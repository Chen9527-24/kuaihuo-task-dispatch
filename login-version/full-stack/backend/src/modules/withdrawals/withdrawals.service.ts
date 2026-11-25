import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { getPagination } from '../../common/dto/pagination.dto';
import { CurrentUserPayload } from '../../common/types/current-user.type';
import { isPlatformUser, resolveTenantId } from '../../common/utils/tenant-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { ApplyWithdrawalDto, MarkWithdrawalPaidDto, RejectWithdrawalDto, WithdrawalQueryDto } from './dto/withdrawal.dto';
import { WechatPayTransferClient } from './wechat-pay-transfer.client';

type WithdrawalStatus = 'PENDING' | 'APPROVED' | 'WAIT_USER_CONFIRM' | 'PROCESSING' | 'PAID' | 'REJECTED' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
type TransferMode = 'WECHAT' | 'MANUAL' | 'MOCK';

type AppUserForWithdraw = {
  id: string;
  tenantId: string | null;
  phone: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  serviceOpenid: string | null;
  status: string;
  bannedUntil: Date | null;
  banReason: string | null;
  balanceAmount: number;
  withdrawnAmount: number;
  deletedAt: Date | null;
};

@Injectable()
export class WithdrawalsService {
  private readonly activeStatuses = ['PENDING', 'APPROVED', 'WAIT_USER_CONFIRM', 'PROCESSING'] as const;
  private readonly finalStatuses = ['PAID', 'REJECTED', 'FAILED', 'CANCELLED', 'EXPIRED'] as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly wechatPayTransferClient: WechatPayTransferClient,
  ) {}

  async applyForH5(dto: ApplyWithdrawalDto, authorization?: string) {
    const appUser = await this.requireDistributionAppUser(authorization);
    this.assertAppUserCanWithdraw(appUser);
    this.assertAmountRules(dto.amount);
    if (!appUser.serviceOpenid) {
      throw new BadRequestException('当前微信账号未完成服务号网页授权，请在微信内重新打开页面后再提现。');
    }
    const transferMode = this.resolveTransferMode();
    const reviewRequired = this.resolveReviewRequired();
    const outBillNo = this.generateOutBillNo();
    const initialStatus: WithdrawalStatus = transferMode === 'WECHAT' && !reviewRequired ? 'PROCESSING' : 'PENDING';
    const withdrawal = await this.createFrozenWithdrawal({ appUser, amount: dto.amount, remark: dto.remark, transferMode, status: initialStatus, outBillNo });

    if (transferMode === 'WECHAT' && !reviewRequired) {
      return this.initiateWechatTransfer(withdrawal.id, appUser.serviceOpenid, dto.remark || '用户收益提现');
    }

    if (transferMode === 'MOCK') {
      const updated = await this.prisma.appUserWithdrawal.update({
        where: { id: withdrawal.id, status: 'PENDING' },
        data: {
          status: 'WAIT_USER_CONFIRM',
          transferState: 'WAIT_USER_CONFIRM',
          transferMchId: this.resolveMchIdForFrontend(),
          transferAppId: this.resolveAppIdForFrontend(),
          transferPackageInfo: `mock_package_${outBillNo}`,
          transferPackageExpireAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          approvedAt: new Date(),
        },
        include: this.withdrawalInclude(),
      });
      return this.toH5Item(updated);
    }

    return this.toH5Item(await this.findWithdrawalById(withdrawal.id));
  }

  async listForH5(query: WithdrawalQueryDto, authorization?: string) {
    const appUser = await this.requireDistributionAppUser(authorization);
    const { skip, take, page, pageSize } = getPagination(query);
    const where: Prisma.AppUserWithdrawalWhereInput = {
      appUserId: appUser.id,
      ...(query.status ? { status: this.normalizeStatus(query.status) } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.appUserWithdrawal.findMany({ where, skip, take, orderBy: [{ createdAt: 'desc' }], include: this.withdrawalInclude() }),
      this.prisma.appUserWithdrawal.count({ where }),
    ]);
    return { items: items.map((item) => this.toH5Item(item)), total, page, pageSize };
  }

  async getForH5(id: string, authorization?: string) {
    const appUser = await this.requireDistributionAppUser(authorization);
    const withdrawal = await this.prisma.appUserWithdrawal.findFirst({
      where: { OR: [{ id }, { outBillNo: id }], appUserId: appUser.id },
      include: this.withdrawalInclude(),
    });
    if (!withdrawal) throw new NotFoundException('提现记录不存在');
    return this.toH5Item(withdrawal);
  }

  async cancelForH5(id: string, authorization?: string) {
    const appUser = await this.requireDistributionAppUser(authorization);
    const withdrawal = await this.prisma.appUserWithdrawal.findFirst({
      where: { OR: [{ id }, { outBillNo: id }], appUserId: appUser.id },
      include: this.withdrawalInclude(),
    });
    if (!withdrawal) throw new NotFoundException('提现记录不存在');
    this.assertCanCancelByH5(withdrawal);
    await this.releaseFrozenWithdrawal(withdrawal.id, 'CANCELLED', '用户主动取消提现申请');
    return this.getForH5(id, authorization);
  }

  async syncForH5(id: string, authorization?: string) {
    const appUser = await this.requireDistributionAppUser(authorization);
    const withdrawal = await this.prisma.appUserWithdrawal.findFirst({
      where: { OR: [{ id }, { outBillNo: id }], appUserId: appUser.id },
      include: this.withdrawalInclude(),
    });
    if (!withdrawal) throw new NotFoundException('提现记录不存在');

    if (withdrawal.transferMode !== 'WECHAT') {
      return this.toH5Item(withdrawal);
    }
    if (!withdrawal.outBillNo) {
      throw new BadRequestException('当前提现缺少商户单号，无法同步查单。');
    }
    if (this.finalStatuses.includes(String(withdrawal.status || '').toUpperCase() as any)) {
      return this.toH5Item(withdrawal);
    }

    const result = await this.wechatPayTransferClient.queryByOutBillNo(withdrawal.outBillNo);
    await this.applyWechatTransferState(withdrawal.id, result);
    return this.getForH5(withdrawal.id, authorization);
  }

  async mockConfirmForH5(id: string, authorization?: string) {
    const appUser = await this.requireDistributionAppUser(authorization);
    const withdrawal = await this.prisma.appUserWithdrawal.findFirst({ where: { id, appUserId: appUser.id }, select: { id: true, transferMode: true, status: true } });
    if (!withdrawal) throw new NotFoundException('提现记录不存在');
    if (withdrawal.transferMode !== 'MOCK') throw new BadRequestException('当前提现不是模拟模式，不能模拟确认收款。');
    if (!['WAIT_USER_CONFIRM', 'PROCESSING', 'APPROVED'].includes(withdrawal.status)) throw new BadRequestException('当前提现状态不支持模拟确认。');
    await this.markWithdrawalPaidInternal(withdrawal.id, { tradeNo: `MOCK${Date.now()}`, remark: 'H5 模拟确认收款' });
    return this.getForH5(id, authorization);
  }

  async getDistributionMeStats(authorization?: string) {
    const appUser = await this.requireDistributionAppUser(authorization);
    return this.buildDistributionMeStats(appUser);
  }

  async listAdmin(query: WithdrawalQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query);
    const tenantId = this.resolveVisibleTenantId(query, user);
    const where = await this.buildAdminWhere(query, tenantId);
    const [items, total] = await Promise.all([
      this.prisma.appUserWithdrawal.findMany({
        where,
        skip,
        take,
        orderBy: [{ createdAt: 'desc' }],
        include: this.withdrawalInclude(),
      }),
      this.prisma.appUserWithdrawal.count({ where }),
    ]);
    return { items: items.map((item) => this.toAdminItem(item)), total, page, pageSize };
  }

  async detailAdmin(id: string, user: CurrentUserPayload) {
    const withdrawal = await this.findVisibleWithdrawal(id, user);
    return this.toAdminItem(withdrawal);
  }

  async exportAdmin(query: WithdrawalQueryDto, user: CurrentUserPayload) {
    const tenantId = this.resolveVisibleTenantId(query, user);
    const where = await this.buildAdminWhere(query, tenantId);
    const items = await this.prisma.appUserWithdrawal.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      include: this.withdrawalInclude(),
    });
    return items.map((item) => this.toAdminItem(item));
  }

  async approveAdmin(id: string, user: CurrentUserPayload) {
    const withdrawal = await this.findVisibleWithdrawal(id, user);
    if (withdrawal.status !== 'PENDING') throw new BadRequestException('只有待审核提现可以审核通过。');
    if (withdrawal.transferMode === 'WECHAT') {
      if (!withdrawal.appUser?.serviceOpenid) throw new BadRequestException('该用户缺少服务号 openid，无法发起微信提现。');
      return this.toAdminItem(await this.initiateWechatTransfer(withdrawal.id, withdrawal.appUser.serviceOpenid, withdrawal.remark || '用户收益提现', user.id));
    }
    const updated = await this.prisma.appUserWithdrawal.update({
      where: { id: withdrawal.id, status: 'PENDING' },
      data: {
        status: withdrawal.transferMode === 'MOCK' ? 'WAIT_USER_CONFIRM' : 'APPROVED',
        transferState: withdrawal.transferMode === 'MOCK' ? 'WAIT_USER_CONFIRM' : withdrawal.transferState,
        transferMchId: withdrawal.transferMode === 'MOCK' ? this.resolveMchIdForFrontend() : withdrawal.transferMchId,
        transferAppId: withdrawal.transferMode === 'MOCK' ? this.resolveAppIdForFrontend() : withdrawal.transferAppId,
        transferPackageInfo: withdrawal.transferMode === 'MOCK' ? `mock_package_${withdrawal.outBillNo || withdrawal.id}` : withdrawal.transferPackageInfo,
        transferPackageExpireAt: withdrawal.transferMode === 'MOCK' ? new Date(Date.now() + 24 * 60 * 60 * 1000) : withdrawal.transferPackageExpireAt,
        approvedAt: new Date(),
        operatorId: user.id,
      },
      include: this.withdrawalInclude(),
    });
    return this.toAdminItem(updated);
  }

  async rejectAdmin(id: string, dto: RejectWithdrawalDto, user: CurrentUserPayload) {
    const withdrawal = await this.findVisibleWithdrawal(id, user);
    if (!this.activeStatuses.includes(withdrawal.status as any)) {
      throw new BadRequestException('只有待处理中的提现可以拒绝。');
    }
    await this.releaseFrozenWithdrawal(withdrawal.id, 'REJECTED', dto.rejectReason, user.id);
    return this.detailAdmin(id, user);
  }

  async markPaidAdmin(id: string, dto: MarkWithdrawalPaidDto, user: CurrentUserPayload) {
    const withdrawal = await this.findVisibleWithdrawal(id, user);
    if (withdrawal.transferMode === 'WECHAT') throw new BadRequestException('微信转账模式必须以回调或查单结果为准，不能人工标记已打款。');
    if (!['APPROVED', 'WAIT_USER_CONFIRM', 'PROCESSING'].includes(withdrawal.status)) throw new BadRequestException('当前提现状态不支持标记已打款。');
    await this.markWithdrawalPaidInternal(withdrawal.id, { tradeNo: dto.tradeNo, remark: dto.remark, operatorId: user.id });
    return this.detailAdmin(id, user);
  }

  async syncAdmin(id: string, user: CurrentUserPayload) {
    const withdrawal = await this.findVisibleWithdrawal(id, user);
    if (withdrawal.transferMode !== 'WECHAT') throw new BadRequestException('只有微信转账模式支持同步查单。');
    if (!withdrawal.outBillNo) throw new BadRequestException('当前提现缺少商户单号，无法查单。');
    const result = await this.wechatPayTransferClient.queryByOutBillNo(withdrawal.outBillNo);
    await this.applyWechatTransferState(withdrawal.id, result);
    return this.detailAdmin(id, user);
  }

  async queryWechatByOutBillNo(outBillNo: string, user: CurrentUserPayload) {
    const withdrawal = await this.findVisibleWithdrawal(outBillNo, user);
    if (!withdrawal.outBillNo) throw new BadRequestException('当前提现缺少商户单号，无法查单。');
    const result = await this.wechatPayTransferClient.queryByOutBillNo(withdrawal.outBillNo);
    await this.applyWechatTransferState(withdrawal.id, result);
    return this.detailAdmin(withdrawal.id, user);
  }

  async handleWechatPayNotify(headers: Record<string, string | string[] | undefined>, rawBody: Buffer | string) {
    const bodyText = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
    this.wechatPayTransferClient.verifyWechatpaySignature({
      timestamp: this.headerValue(headers, 'wechatpay-timestamp'),
      nonce: this.headerValue(headers, 'wechatpay-nonce'),
      serial: this.headerValue(headers, 'wechatpay-serial'),
      signature: this.headerValue(headers, 'wechatpay-signature'),
      body: bodyText,
    });
    const notifyPayload = JSON.parse(bodyText) as { id?: string; event_type?: string; resource?: { ciphertext: string; nonce: string; associated_data?: string; algorithm?: string } };
    const decrypted = this.wechatPayTransferClient.decryptResource(notifyPayload.resource as any);
    const outBillNo = String(decrypted.out_bill_no || '').trim();
    if (!outBillNo) throw new BadRequestException('微信支付回调缺少 out_bill_no');
    const withdrawal = await this.prisma.appUserWithdrawal.findUnique({
      where: { outBillNo }, select: { id: true, amount: true, transferMode: true, appUser: { select: { serviceOpenid: true } } },
    });
    if (!withdrawal) throw new NotFoundException('本地提现单不存在');
    if (withdrawal.transferMode !== 'WECHAT' || decrypted.mch_id !== this.resolveMchIdForFrontend() ||
        decrypted.transfer_amount !== withdrawal.amount || !withdrawal.appUser.serviceOpenid ||
        decrypted.openid !== withdrawal.appUser.serviceOpenid) {
      throw new BadRequestException('转账通知与本地商户、金额或收款身份不一致');
    }
    await this.applyWechatTransferState(withdrawal.id, {
      transfer_bill_no: String(decrypted.transfer_bill_no || '').trim() || undefined,
      state: String(decrypted.state || decrypted.transfer_state || '').trim() || undefined,
      fail_reason: String(decrypted.fail_reason || decrypted.fail_reason_msg || '').trim() || undefined,
      package_info: String(decrypted.package_info || '').trim() || undefined,
      raw: { notify: notifyPayload, resource: this.redactNotifyResource(decrypted) },
    });
    return { success: true };
  }

  private async initiateWechatTransfer(withdrawalId: string, serviceOpenid: string, remark?: string, operatorId?: string) {
    const current = await this.prisma.appUserWithdrawal.findUnique({ where: { id: withdrawalId }, include: this.withdrawalInclude() });
    if (!current) throw new NotFoundException('提现记录不存在');
    if (!current.outBillNo) throw new BadRequestException('当前提现缺少商户单号，无法发起微信提现。');
    if (current.status === 'PAID') return current;
    if (!['PENDING', 'PROCESSING', 'APPROVED'].includes(current.status)) throw new BadRequestException('当前提现状态不支持发起微信提现。');

    const reserved = await this.prisma.appUserWithdrawal.updateMany({
      where: { id: current.id, status: { in: ['PENDING', 'APPROVED', 'PROCESSING'] } },
      data: { status: 'PROCESSING' },
    });
    if (!reserved.count) throw new BadRequestException('提现单状态已变化，请刷新');
    try {
      const result = await this.wechatPayTransferClient.createTransfer({
        outBillNo: current.outBillNo,
        openid: serviceOpenid,
        amount: current.amount,
        remark,
      });
      await this.applyWechatTransferState(withdrawalId, result, operatorId);
      return this.findWithdrawalById(withdrawalId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 微信支付接口请求结果不明确时，先用原 out_bill_no 查单，避免换单号重复发起。
      try {
        const queryResult = await this.wechatPayTransferClient.queryByOutBillNo(current.outBillNo);
        await this.applyWechatTransferState(withdrawalId, queryResult, operatorId);
        return this.findWithdrawalById(withdrawalId);
      } catch (queryError) {
        const queryMessage = queryError instanceof Error ? queryError.message : String(queryError);
        const combinedMessage = `${message}；查单暂未确认：${queryMessage}`.slice(0, 1000);
        await this.prisma.appUserWithdrawal.updateMany({
          where: { id: withdrawalId, status: { in: [...this.activeStatuses] } },
          data: {
            status: 'PROCESSING',
            transferState: 'CREATE_REQUEST_UNKNOWN',
            failReason: combinedMessage,
            operatorId: operatorId || undefined,
          },
        });
        throw new BadRequestException('微信提现请求结果暂不确定，已保留提现单和冻结金额，请稍后在提现记录查看或由后台同步查单。');
      }
    }
  }

  private async createFrozenWithdrawal(params: {
    appUser: AppUserForWithdraw;
    amount: number;
    remark?: string | null;
    transferMode: TransferMode;
    status: WithdrawalStatus;
    outBillNo: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AppUser" WHERE id = ${params.appUser.id} FOR UPDATE`;
      const existingActive = await tx.appUserWithdrawal.findFirst({
        where: { appUserId: params.appUser.id, status: { in: [...this.activeStatuses] } },
        select: { id: true, status: true },
      });
      if (existingActive) {
        throw new BadRequestException('当前已有一笔提现处理中，请等待完成后再发起新的提现。');
      }

      const updated = await tx.appUser.updateMany({
        where: { id: params.appUser.id, deletedAt: null, status: { not: 'DISABLED' }, balanceAmount: { gte: params.amount } },
        data: { balanceAmount: { decrement: params.amount } },
      });
      if (updated.count !== 1) throw new BadRequestException('可提现余额不足');
      const refreshed = await tx.appUser.findUnique({ where: { id: params.appUser.id }, select: { balanceAmount: true } });
      await tx.appUserWalletLedger.create({
        data: {
          appUserId: params.appUser.id,
          type: 'WITHDRAW',
          amount: -params.amount,
          balanceAfter: refreshed?.balanceAmount ?? Math.max(0, params.appUser.balanceAmount - params.amount),
          remark: params.remark || '用户申请提现到微信零钱',
        },
      });
      return tx.appUserWithdrawal.create({
        data: {
          appUserId: params.appUser.id,
          tenantId: params.appUser.tenantId,
          amount: params.amount,
          channel: 'WECHAT_TRANSFER',
          transferMode: params.transferMode,
          status: params.status,
          outBillNo: params.outBillNo,
          remark: params.remark || '提现到微信零钱',
        },
      });
    });
  }

  private async applyWechatTransferState(withdrawalId: string, result: { state?: string; transfer_bill_no?: string; fail_reason?: string; package_info?: string; raw: Record<string, unknown> }, operatorId?: string) {
    const state = String(result.state || '').trim();
    const nextStatus = this.mapWechatStateToLocalStatus(state);
    const current = await this.prisma.appUserWithdrawal.findUnique({ where: { id: withdrawalId }, select: { id: true, status: true, appUserId: true, amount: true } });
    if (!current) throw new NotFoundException('提现记录不存在');
    if (current.status === 'PAID' && nextStatus !== 'PAID') return;
    if (this.finalStatuses.includes(current.status as any) && current.status !== 'FAILED') return;

    if (nextStatus === 'PAID') {
      await this.markWithdrawalPaidInternal(withdrawalId, {
        tradeNo: result.transfer_bill_no,
        remark: '微信支付回调/查单确认转账成功',
        operatorId,
        extraData: {
          transferBillNo: result.transfer_bill_no || undefined,
          transferState: state || 'SUCCESS',
          transferPackageInfo: result.package_info || undefined,
          notifyRaw: result.raw as Prisma.InputJsonValue,
        },
      });
      return;
    }

    if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(nextStatus)) {
      await this.releaseFrozenWithdrawal(withdrawalId, nextStatus as WithdrawalStatus, result.fail_reason || state || '微信提现失败', operatorId, {
        transferBillNo: result.transfer_bill_no || undefined,
        transferState: state || undefined,
        transferPackageInfo: result.package_info || undefined,
        notifyRaw: result.raw as Prisma.InputJsonValue,
      });
      return;
    }

    await this.prisma.appUserWithdrawal.updateMany({
      where: { id: withdrawalId, status: { in: [...this.activeStatuses] } },
      data: {
        status: nextStatus,
        transferBillNo: result.transfer_bill_no || undefined,
        transferState: state || undefined,
        transferPackageInfo: result.package_info || undefined,
        transferPackageExpireAt: result.package_info ? new Date(Date.now() + 24 * 60 * 60 * 1000) : undefined,
        transferMchId: this.resolveMchIdForFrontend(),
        transferAppId: this.resolveAppIdForFrontend(),
        failReason: result.fail_reason || null,
        approvedAt: nextStatus !== 'PENDING' ? new Date() : undefined,
        operatorId: operatorId || undefined,
        notifyRaw: result.raw as Prisma.InputJsonValue,
      },
    });
  }

  private async releaseFrozenWithdrawal(
    withdrawalId: string,
    status: WithdrawalStatus,
    reason: string,
    operatorId?: string,
    extraData: Prisma.AppUserWithdrawalUpdateInput = {},
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AppUserWithdrawal" WHERE id = ${withdrawalId} FOR UPDATE`;
      const current = await tx.appUserWithdrawal.findUnique({ where: { id: withdrawalId }, include: { appUser: true } });
      if (!current) throw new NotFoundException('提现记录不存在');
      if (['REJECTED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(current.status)) return;
      if (current.status === 'PAID') throw new BadRequestException('已打款提现不能释放余额。');
      if (current.transferMode === 'WECHAT' && (status === 'REJECTED' || (status === 'CANCELLED' && !extraData.transferState)) && current.status !== 'PENDING') {
        throw new BadRequestException('微信已受理或正在受理，只能按微信结果处理');
      }

      const updatedUser = await tx.appUser.update({
        where: { id: current.appUserId },
        data: { balanceAmount: { increment: current.amount } },
        select: { balanceAmount: true },
      });
      await tx.appUserWalletLedger.create({
        data: {
          appUserId: current.appUserId,
          type: 'WITHDRAW_REFUND',
          amount: current.amount,
          balanceAfter: updatedUser.balanceAmount,
          remark: reason || '提现失败/拒绝，退回余额',
        },
      });
      await tx.appUserWithdrawal.update({
        where: { id: withdrawalId },
        data: {
          ...extraData,
          status,
          rejectReason: status === 'REJECTED' ? reason : current.rejectReason,
          failReason: status !== 'REJECTED' ? reason : current.failReason,
          operatorId: operatorId || current.operatorId,
          rejectedAt: status === 'REJECTED' ? new Date() : current.rejectedAt,
          failedAt: status === 'FAILED' ? new Date() : current.failedAt,
          cancelledAt: ['CANCELLED', 'EXPIRED'].includes(status) ? new Date() : current.cancelledAt,
        },
      });
    });
  }

  private async markWithdrawalPaidInternal(
    withdrawalId: string,
    params: { tradeNo?: string | null; remark?: string | null; operatorId?: string; extraData?: Prisma.AppUserWithdrawalUpdateInput },
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AppUserWithdrawal" WHERE id = ${withdrawalId} FOR UPDATE`;
      const current = await tx.appUserWithdrawal.findUnique({ where: { id: withdrawalId }, select: { id: true, status: true, appUserId: true, amount: true } });
      if (!current) throw new NotFoundException('提现记录不存在');
      if (current.status === 'PAID') return;
      if (['REJECTED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(current.status)) throw new BadRequestException('已结束提现不能标记为已打款。');

      await tx.appUser.update({ where: { id: current.appUserId }, data: { withdrawnAmount: { increment: current.amount } } });
      const extraData = params.extraData || {};
      const extraTransferBillNo = (extraData as { transferBillNo?: unknown }).transferBillNo;
      const extraTransferState = (extraData as { transferState?: unknown }).transferState;
      await tx.appUserWithdrawal.update({
        where: { id: withdrawalId },
        data: {
          ...extraData,
          status: 'PAID',
          tradeNo: params.tradeNo || undefined,
          transferBillNo: (extraTransferBillNo as string | undefined) || params.tradeNo || undefined,
          transferState: (extraTransferState as string | undefined) || 'SUCCESS',
          failReason: null,
          operatorId: params.operatorId || undefined,
          remark: params.remark || undefined,
          paidAt: new Date(),
        },
      });
    });
  }

  private async buildDistributionMeStats(appUser: AppUserForWithdraw) {
    const [pendingAmount, paidAmount] = await Promise.all([
      this.prisma.appUserWithdrawal.aggregate({ where: { appUserId: appUser.id, status: { in: [...this.activeStatuses] } }, _sum: { amount: true } }),
      this.prisma.appUserWithdrawal.aggregate({ where: { appUserId: appUser.id, status: 'PAID' }, _sum: { amount: true } }),
    ]);
    return {
      availableWithdrawalAmount: appUser.balanceAmount,
      pendingWithdrawalAmount: pendingAmount._sum.amount || 0,
      paidWithdrawalAmount: paidAmount._sum.amount || appUser.withdrawnAmount || 0,
    };
  }

  private async findVisibleWithdrawal(idOrOutBillNo: string, user: CurrentUserPayload) {
    const tenantId = this.resolveVisibleTenantId({}, user);
    const identityWhere: Prisma.AppUserWithdrawalWhereInput = { OR: [{ id: idOrOutBillNo }, { outBillNo: idOrOutBillNo }] };
    const tenantWhere: Prisma.AppUserWithdrawalWhereInput | null = tenantId
      ? { OR: [{ tenantId }, { appUser: { tenantId } }, { appUser: { participants: { some: { task: { tenantId } } } } }] }
      : null;
    const withdrawal = await this.prisma.appUserWithdrawal.findFirst({
      where: tenantWhere ? { AND: [identityWhere, tenantWhere] } : identityWhere,
      include: this.withdrawalInclude(),
    });
    if (!withdrawal) throw new NotFoundException('提现记录不存在或无权访问');
    return withdrawal;
  }

  private async findWithdrawalById(id: string) {
    const withdrawal = await this.prisma.appUserWithdrawal.findUnique({ where: { id }, include: this.withdrawalInclude() });
    if (!withdrawal) throw new NotFoundException('提现记录不存在');
    return withdrawal;
  }

  private async buildAdminWhere(query: WithdrawalQueryDto, tenantId?: string | null): Promise<Prisma.AppUserWithdrawalWhereInput> {
    const where: Prisma.AppUserWithdrawalWhereInput = {};
    if (tenantId) where.OR = [{ tenantId }, { appUser: { tenantId } }, { appUser: { participants: { some: { task: { tenantId } } } } }];
    if (query.status) where.status = this.normalizeStatus(query.status);
    if (query.transferMode) where.transferMode = this.normalizeTransferMode(query.transferMode);
    const explicitAppUserIds = this.parseScopeAppUserIds(query.appUserIds);
    if (explicitAppUserIds.length) where.appUserId = { in: explicitAppUserIds };
    const keyword = String(query.keyword || '').trim();
    if (keyword) {
      const keywordWhere: Prisma.AppUserWithdrawalWhereInput = {
        OR: [
          { id: { contains: keyword, mode: 'insensitive' } },
          { outBillNo: { contains: keyword, mode: 'insensitive' } },
          { transferBillNo: { contains: keyword, mode: 'insensitive' } },
          { tradeNo: { contains: keyword, mode: 'insensitive' } },
          { appUser: { phone: { contains: keyword, mode: 'insensitive' } } },
          { appUser: { nickname: { contains: keyword, mode: 'insensitive' } } },
          { appUser: { serviceOpenid: { contains: keyword, mode: 'insensitive' } } },
        ],
      };
      if (where.OR) where.AND = [{ OR: where.OR }, keywordWhere];
      else Object.assign(where, keywordWhere);
      delete where.OR;
    }
    return where;
  }

  private parseScopeAppUserIds(raw: unknown) {
    const ids = Array.from(new Set(String(raw || '').split(',').map((item) => item.trim()).filter(Boolean)));
    if (ids.length > 100) throw new BadRequestException('测试范围最多支持 100 个 H5 用户');
    return ids;
  }

  private resolveVisibleTenantId(query: Partial<WithdrawalQueryDto>, user: CurrentUserPayload) {
    if (isPlatformUser(user)) {
      const ref = String(query.tenantId || '').trim();
      return ref || null;
    }
    return resolveTenantId(user) || null;
  }

  private assertCanCancelByH5(withdrawal: any) {
    const status = String(withdrawal.status || '').toUpperCase();
    if (!this.activeStatuses.includes(status as any)) {
      throw new BadRequestException('当前提现状态不支持取消。');
    }
    if (withdrawal.transferMode === 'WECHAT' && status !== 'PENDING') {
      throw new BadRequestException('微信提现已进入微信确认/处理流程，暂不支持自行取消，请等待结果或联系后台处理。');
    }
  }

  private canCancelByH5(item: any) {
    const status = String(item.status || '').toUpperCase();
    if (!this.activeStatuses.includes(status as any)) return false;
    if (item.transferMode === 'WECHAT' && status !== 'PENDING') return false;
    return true;
  }

  private canRejectByAdmin(item: any) {
    return (item.transferMode !== 'WECHAT' || item.status === 'PENDING') && this.activeStatuses.includes(String(item.status || '').toUpperCase() as any);
  }

  private async requireDistributionAppUser(authorization?: string): Promise<AppUserForWithdraw> {
    const token = this.readDistributionBearerToken(authorization);
    if (!token) throw new BadRequestException('请先登录后再操作');
    const raw = await this.redisService.get(`distribution:session:${token}`);
    if (!raw) throw new BadRequestException('登录已过期，请重新登录');
    let payload: { appUserId?: string } = {};
    try {
      payload = JSON.parse(raw) as { appUserId?: string };
    } catch {
      throw new BadRequestException('登录状态异常，请重新登录');
    }
    if (!payload.appUserId) throw new BadRequestException('登录状态异常，请重新登录');
    const appUser = await this.prisma.appUser.findFirst({ where: { id: payload.appUserId, deletedAt: null } });
    if (!appUser) throw new BadRequestException('账号不存在或已被禁用');
    return appUser;
  }

  private readDistributionBearerToken(authorization?: string) {
    return String(authorization || '').trim().replace(/^Bearer\s+/i, '').trim();
  }

  private assertAppUserCanWithdraw(appUser: AppUserForWithdraw) {
    if (appUser.status === 'DISABLED' || appUser.deletedAt) throw new BadRequestException('当前账号不可提现');
    if (appUser.bannedUntil && appUser.bannedUntil.getTime() > Date.now()) throw new BadRequestException(appUser.banReason || '当前账号处于限制状态，暂不可提现');
  }

  private assertAmountRules(amount: number) {
    if (!Number.isInteger(amount) || amount <= 0) throw new BadRequestException('提现金额必须为大于 0 的整数分。');
    const min = Number(this.configService.get<string>('WECHAT_WITHDRAW_MIN_AMOUNT_FEN', '') || process.env.WECHAT_WITHDRAW_MIN_AMOUNT_FEN || 1);
    const max = Number(this.configService.get<string>('WECHAT_WITHDRAW_MAX_AMOUNT_FEN', '') || process.env.WECHAT_WITHDRAW_MAX_AMOUNT_FEN || 20000);
    if (Number.isFinite(min) && amount < min) throw new BadRequestException(`单笔提现金额不能低于 ${min} 分。`);
    if (Number.isFinite(max) && amount > max) throw new BadRequestException(`单笔提现金额不能超过 ${max} 分。`);
  }

  private resolveTransferMode(): TransferMode {
    return this.normalizeTransferMode(String(this.configService.get<string>('WECHAT_PAY_TRANSFER_MODE', '') || process.env.WECHAT_PAY_TRANSFER_MODE || process.env.WITHDRAW_TRANSFER_MODE || 'MOCK'));
  }

  private normalizeTransferMode(value?: string | null): TransferMode {
    const mode = String(value || '').trim().toUpperCase();
    if (mode === 'MANUAL' || mode === 'MOCK') return mode;
    return 'WECHAT';
  }

  private resolveReviewRequired() {
    const raw = String(this.configService.get<string>('WECHAT_WITHDRAW_REVIEW_REQUIRED', '') || process.env.WECHAT_WITHDRAW_REVIEW_REQUIRED || '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(raw);
  }

  private normalizeStatus(status?: string | null): WithdrawalStatus {
    const clean = String(status || '').trim().toUpperCase();
    const allowed: WithdrawalStatus[] = ['PENDING', 'APPROVED', 'WAIT_USER_CONFIRM', 'PROCESSING', 'PAID', 'REJECTED', 'FAILED', 'CANCELLED', 'EXPIRED'];
    return allowed.includes(clean as WithdrawalStatus) ? (clean as WithdrawalStatus) : 'PENDING';
  }

  private mapWechatStateToLocalStatus(state: string): WithdrawalStatus {
    const clean = String(state || '').trim().toUpperCase();
    if (clean === 'SUCCESS') return 'PAID';
    if (clean === 'WAIT_USER_CONFIRM' || clean === 'TRANSFERING') return 'WAIT_USER_CONFIRM';
    if (clean === 'ACCEPTED' || clean === 'PROCESSING') return 'PROCESSING';
    if (clean === 'FAIL') return 'FAILED';
    if (clean === 'CANCELLED') return 'CANCELLED';
    return 'PROCESSING';
  }

  private generateOutBillNo() {
    return `W${Date.now()}${Math.random().toString(36).slice(2, 10).toUpperCase()}`.replace(/[^0-9A-Za-z]/g, '').slice(0, 32);
  }

  private resolveMchIdForFrontend() {
    return String(this.configService.get<string>('WECHAT_PAY_MCH_ID', '') || process.env.WECHAT_PAY_MCH_ID || '').trim();
  }

  private resolveAppIdForFrontend() {
    return String(
      this.configService.get<string>('WECHAT_PAY_APP_ID', '') || process.env.WECHAT_PAY_APP_ID || process.env.WECHAT_MP_APPID || process.env.WECHAT_OFFICIAL_APPID || '',
    ).trim();
  }

  private headerValue(headers: Record<string, string | string[] | undefined>, name: string) {
    const lower = name.toLowerCase();
    const value = headers[name] ?? headers[lower] ?? headers[Object.keys(headers).find((key) => key.toLowerCase() === lower) || ''];
    return Array.isArray(value) ? value[0] : value;
  }

  private withdrawalInclude() {
    return {
      appUser: { select: { id: true, phone: true, nickname: true, avatarUrl: true, serviceOpenid: true, balanceAmount: true, withdrawnAmount: true } },
      tenant: { select: { id: true, name: true, code: true } },
    } satisfies Prisma.AppUserWithdrawalInclude;
  }

  private toH5Item(item: any) {
    return {
      id: item.id,
      withdrawNo: item.outBillNo || item.id,
      outBillNo: item.outBillNo,
      amount: item.amount,
      channel: item.channel,
      transferMode: item.transferMode,
      status: item.status,
      statusLabel: this.statusLabel(item.status),
      transferState: item.transferState,
      transferBillNo: item.transferBillNo,
      transferMchId: item.transferMchId,
      transferAppId: item.transferAppId,
      transferPackageInfo: item.transferPackageInfo,
      canRequestMerchantTransfer: item.transferMode === 'WECHAT' && ['WAIT_USER_CONFIRM', 'PROCESSING'].includes(item.status) && Boolean(item.transferPackageInfo),
      canMockConfirm: item.transferMode === 'MOCK' && ['WAIT_USER_CONFIRM', 'PROCESSING', 'APPROVED'].includes(item.status),
      canCancelWithdrawal: this.canCancelByH5(item),
      rejectReason: item.rejectReason,
      failReason: item.failReason,
      remark: item.remark,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      paidAt: item.paidAt,
      rejectedAt: item.rejectedAt,
      failedAt: item.failedAt,
      cancelledAt: item.cancelledAt,
      mch_id: item.transferMchId,
      app_id: item.transferAppId,
      package_info: item.transferPackageInfo,
      wechat_state: item.transferState,
    };
  }

  private toAdminItem(item: any) {
    return {
      ...this.toH5Item(item),
      appUserId: item.appUserId,
      appUser: item.appUser,
      tenantId: item.tenantId,
      tenant: item.tenant,
      tradeNo: item.tradeNo,
      approvedAt: item.approvedAt,
      operatorId: item.operatorId,
      notifyRaw: item.notifyRaw,
      canRejectWithdrawal: this.canRejectByAdmin(item),
    };
  }

  private statusLabel(status: string) {
    const map: Record<string, string> = {
      PENDING: '待审核',
      APPROVED: '已通过/待打款',
      WAIT_USER_CONFIRM: '待用户确认',
      PROCESSING: '处理中',
      PAID: '已打款',
      REJECTED: '已拒绝',
      FAILED: '失败',
      CANCELLED: '已撤销',
      EXPIRED: '已过期',
    };
    return map[String(status || '').toUpperCase()] || status || '--';
  }

  private redactNotifyResource(value: Record<string, unknown>) {
    return {
      ...value,
      openid: value.openid ? `${String(value.openid).slice(0, 6)}***${String(value.openid).slice(-4)}` : value.openid,
    };
  }
}
