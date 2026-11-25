import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getPagination } from '../../common/dto/pagination.dto';
import { CurrentUserPayload } from '../../common/types/current-user.type';
import { isPlatformUser, resolveTenantId } from '../../common/utils/tenant-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AppUserQueryDto } from './dto/app-user-query.dto';
import { BatchMarkAppUsersAsTestDataDto, MarkAppUserAsTestDataDto, RestrictAppUserDto, UpdateAppUserProfileDto, UpdateAppUserTaskAccountDto } from './dto/app-user.dto';

type AppUserStatusSource = {
  status: string;
  bannedUntil: Date | null;
  banReason: string | null;
};

type MemberListScope = {
  memberOnly: boolean;
  leaderGroupId?: string;
};

@Injectable()
export class AppUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async list(query: AppUserQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query);
    const tenantId = this.resolveVisibleTenantId(query, user);
    const memberScope = await this.resolveMemberListScope(query, tenantId);
    const now = new Date();
    const andWhere: Prisma.AppUserWhereInput[] = [{ deletedAt: null }];

    if (memberScope.memberOnly) {
      const [memberUserIds, leaderUserIds] = await Promise.all([
        this.findDistributionMemberUserIds({ tenantId, groupId: memberScope.leaderGroupId }),
        this.findDistributionLeaderUserIds({ tenantId, groupId: memberScope.leaderGroupId }),
      ]);
      const leaderUserIdSet = new Set(leaderUserIds);
      const visibleMemberUserIds = memberUserIds.filter((id) => !leaderUserIdSet.has(id));
      // 成员页只返回通过成员邀请码加入团队的账号；团长本人即便曾经是成员，也不会出现在这里。
      andWhere.push({ id: { in: visibleMemberUserIds } });
    } else if (tenantId) {
      const taskAccountUserIds = await this.findTaskAccountUserIds({ tenantId });
      const bindingUserIds = await this.findDistributionBindingUserIds({ tenantId });
      const scopedUserIds = Array.from(new Set([...taskAccountUserIds, ...bindingUserIds]));
      andWhere.push({
        OR: [
          { tenantId },
          { participants: { some: { task: { tenantId } } } },
          ...(scopedUserIds.length ? [{ id: { in: scopedUserIds } }] : []),
        ],
      });
    }

    if (query.registerType === 'WECHAT_MP') andWhere.push({ serviceOpenid: { not: null } });
    if (query.registerType === 'PHONE') andWhere.push({ phone: { not: null } });
    const explicitIds = this.parseScopeIds(query.ids, 'H5 成员');
    if (explicitIds.length) andWhere.push({ id: { in: explicitIds } });
    if (query.isTestData !== undefined) andWhere.push({ isTestData: query.isTestData });
    const statusWhere = this.buildStatusWhere(query.status, now);
    if (Object.keys(statusWhere).length) andWhere.push(statusWhere);
    const keywordWhere = await this.buildKeywordWhere(query, { tenantId, ...memberScope });
    if (Object.keys(keywordWhere).length) andWhere.push(keywordWhere);
    const where: Prisma.AppUserWhereInput = { AND: andWhere };

    const [items, total] = await Promise.all([
      this.prisma.appUser.findMany({
        where,
        skip,
        take,
        orderBy: [{ lastLoginAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          tenant: { select: { id: true, name: true, code: true } },
          _count: { select: { participants: true, mediaAccounts: true, restrictions: true, withdrawals: true } },
          participants: {
            ...(tenantId ? { where: { task: { tenantId } } } : {}),
            orderBy: [{ updatedAt: 'desc' }],
            take: 1,
            select: {
              id: true,
              status: true,
              settlementStatus: true,
              updatedAt: true,
              taskAccountId: true,
              taskAccountPhone: true,
              taskAccountNickname: true,
              task: { select: { id: true, title: true, platform: true, tenant: { select: { id: true, name: true, code: true } } } },
            },
          },
        },
      }),
      this.prisma.appUser.count({ where }),
    ]);

    const taskAccountSummaryMap = await this.buildTaskAccountSummaryMap(items.map((item) => item.id));

    return {
      items: items.map((item) => this.toListItem(item, taskAccountSummaryMap.get(item.id))),
      page,
      pageSize,
      total,
    };
  }

  async detail(id: string, user: CurrentUserPayload) {
    const tenantId = this.resolveVisibleTenantId({}, user);
    await this.ensureVisible(id, user);
    const appUser = await this.prisma.appUser.findFirst({
      where: { id, deletedAt: null },
      include: {
        tenant: { select: { id: true, name: true, code: true } },
        mediaAccounts: { orderBy: [{ updatedAt: 'desc' }], take: 20 },
        restrictions: { orderBy: [{ createdAt: 'desc' }], take: 20 },
        participants: {
          ...(tenantId ? { where: { task: { tenantId } } } : {}),
          orderBy: [{ updatedAt: 'desc' }],
          take: 30,
          include: {
            task: { select: { id: true, title: true, platform: true, rewardAmount: true, tenant: { select: { id: true, name: true, code: true } } } },
            comments: {
              orderBy: [{ updatedAt: 'desc' }],
              take: 1,
              select: { id: true, content: true, status: true, assignedAt: true, completedAt: true },
            },
          },
        },
        withdrawals: { orderBy: [{ createdAt: 'desc' }], take: 20 },
        _count: { select: { participants: true, mediaAccounts: true, restrictions: true, withdrawals: true } },
      },
    });
    if (!appUser) throw new NotFoundException('H5 成员不存在或无权访问');
    const taskAccountDetail = await this.buildTaskAccountDetail(appUser.id, tenantId);
    return {
      ...appUser,
      resolvedStatus: this.resolveAppUserStatus(appUser),
      taskAccounts: taskAccountDetail.items,
      taskAccountSummary: taskAccountDetail.summary,
    };
  }

  async updateStatus(id: string, status: 'ENABLED' | 'DISABLED', user: CurrentUserPayload) {
    await this.ensureVisible(id, user);
    return this.prisma.appUser.update({
      where: { id },
      data: {
        status,
        ...(status === 'ENABLED' ? { bannedUntil: null, banReason: null } : {}),
      },
    });
  }

  async restrict(id: string, dto: RestrictAppUserDto, user: CurrentUserPayload) {
    await this.ensureVisible(id, user);
    const days = Number(dto.days || 0);
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      throw new BadRequestException('限制天数必须在 1 到 365 天之间');
    }
    const reason = String(dto.reason || '').trim();
    if (!reason) throw new BadRequestException('限制原因不能为空');

    const now = new Date();
    const endsAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const [restriction, appUser] = await this.prisma.$transaction([
      this.prisma.appUserRestriction.create({
        data: {
          appUserId: id,
          operatorId: user.id,
          days,
          reason,
          screenshotFileId: String(dto.screenshotFileId || '').trim() || null,
          startedAt: now,
          endsAt,
          status: 'ACTIVE',
        },
      }),
      this.prisma.appUser.update({
        where: { id },
        data: {
          bannedUntil: endsAt,
          banReason: reason,
        },
      }),
    ]);
    return { restriction, appUser, resolvedStatus: this.resolveAppUserStatus(appUser) };
  }


  async markAsTestData(id: string, dto: MarkAppUserAsTestDataDto, user: CurrentUserPayload) {
    await this.ensureVisible(id, user);
    const appUser = await this.prisma.appUser.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, tenantId: true, nickname: true, phone: true, isTestData: true },
    });
    if (!appUser) throw new NotFoundException('H5 成员不存在');
    const expectedValues = [appUser.nickname, appUser.phone, appUser.id]
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    const confirmed = String(dto.confirmIdentity || '').trim();
    if (!expectedValues.includes(confirmed)) {
      throw new BadRequestException('确认文本不匹配，请输入当前成员昵称、手机号或用户 ID');
    }
    if (appUser.isTestData) return { ...appUser, alreadyMarked: true };

    const markedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.appUser.update({
        where: { id: appUser.id },
        data: { isTestData: true, testMarkedAt: markedAt, testMarkedById: user.id },
      });
      await tx.operationLog.create({
        data: {
          operatorId: user.id,
          tenantId: appUser.tenantId || null,
          module: 'APP_USER',
          action: 'MARK_TEST_DATA',
          bizId: appUser.id,
          description: `将 H5 成员“${appUser.nickname || appUser.phone || appUser.id}”标记为独立测试账号`,
          beforeData: { isTestData: false },
          afterData: { isTestData: true, testMarkedAt: markedAt.toISOString() },
        },
      });
      return next;
    });
    return { ...updated, alreadyMarked: false };
  }

  async batchMarkAsTestData(dto: BatchMarkAppUsersAsTestDataDto, user: CurrentUserPayload) {
    const ids = Array.from(new Set((dto.ids || []).map((item) => String(item || '').trim()).filter(Boolean)));
    if (!ids.length) throw new BadRequestException('请至少选择一个 H5 成员');
    if (ids.length > 100) throw new BadRequestException('一次最多标记 100 个 H5 成员');
    const expectedConfirmText = `确认标记${ids.length}个测试账号`;
    if (String(dto.confirmText || '').trim() !== expectedConfirmText) {
      throw new BadRequestException(`确认文本不匹配，请输入“${expectedConfirmText}”`);
    }

    await Promise.all(ids.map((id) => this.ensureVisible(id, user)));
    const appUsers = await this.prisma.appUser.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, tenantId: true, nickname: true, phone: true, isTestData: true },
    });
    if (appUsers.length !== ids.length) throw new NotFoundException('存在不存在或已删除的 H5 成员，请刷新后重试');

    const targets = appUsers.filter((item) => !item.isTestData);
    if (!targets.length) {
      return { selectedCount: ids.length, markedCount: 0, alreadyMarkedCount: ids.length };
    }

    const markedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.appUser.updateMany({
        where: { id: { in: targets.map((item) => item.id) }, deletedAt: null, isTestData: false },
        data: { isTestData: true, testMarkedAt: markedAt, testMarkedById: user.id },
      });
      if (updateResult.count !== targets.length) {
        throw new BadRequestException('部分 H5 成员状态已变化，请刷新后重试');
      }
      await Promise.all(
        targets.map((item) =>
          tx.operationLog.create({
            data: {
              operatorId: user.id,
              tenantId: item.tenantId || null,
              module: 'APP_USER',
              action: 'BATCH_MARK_TEST_DATA',
              bizId: item.id,
              description: `批量将 H5 成员“${item.nickname || item.phone || item.id}”标记为独立测试账号`,
              beforeData: { isTestData: false },
              afterData: { isTestData: true, testMarkedAt: markedAt.toISOString() },
            },
          }),
        ),
      );
    });

    return {
      selectedCount: ids.length,
      markedCount: targets.length,
      alreadyMarkedCount: ids.length - targets.length,
    };
  }

  async updateProfile(id: string, dto: UpdateAppUserProfileDto, user: CurrentUserPayload) {
    await this.ensureVisible(id, user);
    const phone = this.normalizePhone(dto.phone);
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      throw new BadRequestException('手机号格式不正确');
    }
    const nickname = String(dto.nickname || '').trim();
    if (!nickname) throw new BadRequestException('姓名/昵称不能为空');

    const existed = await this.prisma.appUser.findFirst({
      where: { phone, deletedAt: null, id: { not: id } },
      select: { id: true },
    });
    if (existed) throw new BadRequestException('该手机号已绑定其他 H5 成员主体');

    const [updated] = await this.prisma.$transaction([
      this.prisma.appUser.update({
        where: { id },
        data: { phone, nickname },
      }),
      this.prisma.taskParticipant.updateMany({
        where: { appUserId: id },
        data: { phone, visitorName: nickname },
      }),
      this.prisma.taskComment.updateMany({
        where: { participant: { appUserId: id }, status: { in: ['CLAIMED', 'COMPLETED'] } },
        data: { claimerName: nickname },
      }),
    ]);
    return { ...updated, resolvedStatus: this.resolveAppUserStatus(updated) };
  }

  async resetTodayAbandonCount(id: string, user: CurrentUserPayload) {
    await this.ensureVisible(id, user);
    const { start, end } = this.getTodayRange();
    const result = await this.prisma.taskAbandonLog.deleteMany({
      where: { appUserId: id, createdAt: { gte: start, lt: end } },
    });
    return { success: true, deletedCount: result.count, todayAbandonCount: 0, todayRemainingAbandonCount: 2 };
  }

  async getTaskAccountPhoneOccupancy(rawPhone: string, user: CurrentUserPayload) {
    const phone = this.normalizePhone(rawPhone);
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      throw new BadRequestException('手机号格式不正确');
    }

    const account = await this.prisma.distributionTaskAccount.findUnique({ where: { phone } });
    if (!account) {
      return { phone, occupied: false, releasable: false, taskAccount: null, owner: null, tenant: null, group: null, blockingReason: null };
    }

    const visibleTenantId = this.resolveVisibleTenantId({}, user);
    if (visibleTenantId === '__NO_TENANT__' || (visibleTenantId && account.tenantId !== visibleTenantId)) {
      throw new NotFoundException('该手机号任务账号不存在或无权访问');
    }

    const [owner, tenant, group, leaderGroup] = await Promise.all([
      this.prisma.appUser.findUnique({
        where: { id: account.userId },
        select: { id: true, nickname: true, phone: true, deletedAt: true },
      }),
      this.prisma.tenant.findUnique({
        where: { id: account.tenantId },
        select: { id: true, name: true, code: true },
      }),
      this.prisma.distributionGroup.findUnique({
        where: { id: account.groupId },
        select: { id: true, name: true, leaderName: true, leaderPhone: true, leaderUserId: true, leaderTaskAccountId: true },
      }),
      this.prisma.distributionGroup.findFirst({
        where: { leaderTaskAccountId: account.id, deletedAt: null, status: { in: ['ENABLED', 'DISABLED'] } },
        select: { id: true, name: true },
      }),
    ]);

    const blockingReason = leaderGroup
      ? `该手机号是团长「${leaderGroup.name}」当前绑定的主任务账号，请先在团长管理调整团长账号，不能从 H5 成员页直接释放`
      : null;

    return {
      phone,
      occupied: true,
      releasable: !blockingReason,
      blockingReason,
      taskAccount: {
        id: account.id,
        userId: account.userId,
        tenantId: account.tenantId,
        groupId: account.groupId,
        phone: account.phone,
        nickname: account.nickname,
        status: account.status,
        isDefault: account.isDefault,
      },
      owner: owner
        ? { id: owner.id, nickname: owner.nickname, phone: owner.phone, deletedAt: owner.deletedAt }
        : null,
      tenant,
      group,
    };
  }

  async releaseTaskAccountPhone(rawPhone: string, user: CurrentUserPayload) {
    const occupancy = await this.getTaskAccountPhoneOccupancy(rawPhone, user);
    if (!occupancy.occupied || !occupancy.taskAccount) {
      throw new BadRequestException('该手机号当前没有任务账号占用，无需释放');
    }
    if (!occupancy.releasable) {
      throw new BadRequestException(occupancy.blockingReason || '该手机号当前不能从 H5 成员页释放');
    }

    const account = await this.prisma.distributionTaskAccount.findUnique({
      where: { id: occupancy.taskAccount.id },
      select: { id: true, userId: true, tenantId: true, isDefault: true, phone: true, nickname: true },
    });
    if (!account || account.phone !== occupancy.phone) {
      throw new BadRequestException('手机号占用状态已变化，请重新查询后再操作');
    }

    await this.deleteTaskAccountRecord(account, account.tenantId);
    return {
      success: true,
      releasedPhone: occupancy.phone,
      taskAccountId: account.id,
      ownerUserId: account.userId,
      ownerNickname: occupancy.owner?.nickname || null,
    };
  }

  async updateTaskAccount(id: string, accountId: string, dto: UpdateAppUserTaskAccountDto, user: CurrentUserPayload) {
    await this.ensureVisible(id, user);
    const tenantId = this.resolveVisibleTenantId({}, user);
    const account = await this.prisma.distributionTaskAccount.findFirst({
      where: { id: accountId, userId: id, ...(tenantId ? { tenantId } : {}) },
    });
    if (!account) throw new NotFoundException('任务账号不存在或无权访问');

    const phone = this.normalizePhone(dto.phone);
    if (!/^1[3-9]\d{9}$/.test(phone)) throw new BadRequestException('任务账号手机号格式不正确');
    const nickname = String(dto.nickname || '').trim();
    if (!nickname) throw new BadRequestException('任务账号昵称不能为空');

    const existed = await this.prisma.distributionTaskAccount.findFirst({
      where: { phone, id: { not: account.id } },
      select: { id: true },
    });
    if (existed) throw new BadRequestException('该手机号已被其他任务账号使用');

    await this.prisma.distributionTaskAccount.update({
      where: { id: account.id },
      data: { phone, nickname },
    });
    return this.buildTaskAccountDetail(id, tenantId);
  }

  async removeTaskAccount(id: string, accountId: string, user: CurrentUserPayload) {
    await this.ensureVisible(id, user);
    const tenantId = this.resolveVisibleTenantId({}, user);
    const account = await this.prisma.distributionTaskAccount.findFirst({
      where: { id: accountId, userId: id, ...(tenantId ? { tenantId } : {}) },
    });
    if (!account) throw new NotFoundException('任务账号不存在或无权访问');

    await this.deleteTaskAccountRecord(account, tenantId);
    return this.buildTaskAccountDetail(id, tenantId);
  }

  private async deleteTaskAccountRecord(
    account: { id: string; userId: string; isDefault: boolean },
    tenantId?: string,
  ) {
    const nextDefault = await this.prisma.distributionTaskAccount.findFirst({
      where: { userId: account.userId, status: 'ENABLED', id: { not: account.id }, ...(tenantId ? { tenantId } : {}) },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { id: true },
    });

    await this.prisma.$transaction([
      this.prisma.distributionGroup.updateMany({ where: { leaderTaskAccountId: account.id }, data: { leaderTaskAccountId: null } }),
      this.prisma.distributionTaskAccount.delete({ where: { id: account.id } }),
      ...(account.isDefault && nextDefault
        ? [
            this.prisma.distributionTaskAccount.updateMany({ where: { userId: account.userId, ...(tenantId ? { tenantId } : {}) }, data: { isDefault: false } }),
            this.prisma.distributionTaskAccount.update({ where: { id: nextDefault.id }, data: { isDefault: true } }),
          ]
        : []),
    ]);
  }

  async updateTaskAccountStatus(id: string, accountId: string, status: 'ENABLED' | 'DISABLED', user: CurrentUserPayload) {
    await this.ensureVisible(id, user);
    const tenantId = this.resolveVisibleTenantId({}, user);
    const account = await this.prisma.distributionTaskAccount.findFirst({
      where: { id: accountId, userId: id, ...(tenantId ? { tenantId } : {}) },
    });
    if (!account) throw new NotFoundException('任务账号不存在或无权访问');

    if (status === 'ENABLED') {
      const existedDefault = await this.prisma.distributionTaskAccount.findFirst({
        where: { userId: id, status: 'ENABLED', isDefault: true, id: { not: account.id }, ...(tenantId ? { tenantId } : {}) },
        select: { id: true },
      });
      if (!existedDefault && !account.isDefault) {
        await this.prisma.$transaction([
          this.prisma.distributionTaskAccount.updateMany({ where: { userId: id, ...(tenantId ? { tenantId } : {}) }, data: { isDefault: false } }),
          this.prisma.distributionTaskAccount.update({ where: { id: account.id }, data: { status: 'ENABLED', isDefault: true } }),
        ]);
      } else {
        await this.prisma.distributionTaskAccount.update({ where: { id: account.id }, data: { status: 'ENABLED' } });
      }
    } else {
      await this.prisma.distributionTaskAccount.update({ where: { id: account.id }, data: { status: 'DISABLED', isDefault: false } });
      if (account.isDefault) {
        const next = await this.prisma.distributionTaskAccount.findFirst({
          where: { userId: id, status: 'ENABLED', id: { not: account.id }, ...(tenantId ? { tenantId } : {}) },
          orderBy: [{ createdAt: 'asc' }],
          select: { id: true },
        });
        if (next) {
          await this.prisma.$transaction([
            this.prisma.distributionTaskAccount.updateMany({ where: { userId: id, ...(tenantId ? { tenantId } : {}) }, data: { isDefault: false } }),
            this.prisma.distributionTaskAccount.update({ where: { id: next.id }, data: { isDefault: true } }),
          ]);
        }
      }
    }

    return this.buildTaskAccountDetail(id, tenantId);
  }

  async setDefaultTaskAccount(id: string, accountId: string, user: CurrentUserPayload) {
    await this.ensureVisible(id, user);
    const tenantId = this.resolveVisibleTenantId({}, user);
    const account = await this.prisma.distributionTaskAccount.findFirst({
      where: { id: accountId, userId: id, status: 'ENABLED', ...(tenantId ? { tenantId } : {}) },
      select: { id: true },
    });
    if (!account) throw new NotFoundException('任务账号不存在、已停用或无权访问');
    await this.prisma.$transaction([
      this.prisma.distributionTaskAccount.updateMany({ where: { userId: id, ...(tenantId ? { tenantId } : {}) }, data: { isDefault: false } }),
      this.prisma.distributionTaskAccount.update({ where: { id: account.id }, data: { isDefault: true } }),
    ]);
    return this.buildTaskAccountDetail(id, tenantId);
  }

  private getTodayRange() {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    return { start, end };
  }

  async remove(id: string, user: CurrentUserPayload) {
    await this.ensureVisible(id, user);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const accounts = await tx.distributionTaskAccount.findMany({
        where: { userId: id },
        select: { id: true },
      });
      const accountIds = accounts.map((item) => item.id);

      await tx.distributionGroup.updateMany({
        where: { leaderUserId: id },
        data: { leaderUserId: null, leaderTaskAccountId: null },
      });
      if (accountIds.length) {
        await tx.distributionGroup.updateMany({
          where: { leaderTaskAccountId: { in: accountIds } },
          data: { leaderTaskAccountId: null },
        });
      }
      await tx.distributionUserBinding.deleteMany({ where: { userId: id } });
      await tx.distributionTaskAccount.deleteMany({ where: { userId: id } });
      await tx.appUserMediaAccount.deleteMany({ where: { appUserId: id } });
      await tx.appUserRestriction.deleteMany({ where: { appUserId: id } });
      await tx.taskAbandonLog.deleteMany({ where: { appUserId: id } });
      await tx.taskParticipant.updateMany({
        where: { appUserId: id, status: { in: ['STARTED', 'CLAIMED'] } },
        data: { status: 'ABANDONED', abandonedAt: now, abandonReason: 'H5成员主体已删除', lastActiveAt: now },
      });
      await tx.taskParticipant.updateMany({
        where: { appUserId: id },
        data: { appUserId: null },
      });
      await tx.appUser.update({
        where: { id },
        data: {
          phone: null,
          nickname: null,
          serviceOpenid: null,
          wechatOpenid: null,
          unionid: null,
          bannedUntil: null,
          banReason: null,
          deletedAt: now,
          status: 'DISABLED',
        },
      });
    });
    await this.clearDistributionSessionsForAppUser(id).catch(() => undefined);
    return { success: true };
  }

  private async clearDistributionSessionsForAppUser(appUserId: string) {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redisService.raw.scan(cursor, 'MATCH', 'distribution:session:*', 'COUNT', 200);
      cursor = nextCursor;
      const matchedKeys: string[] = [];
      for (const key of keys) {
        const raw = await this.redisService.get(key);
        if (!raw) continue;
        try {
          const payload = JSON.parse(raw) as { appUserId?: string };
          if (payload.appUserId === appUserId) matchedKeys.push(key);
        } catch {
          // Ignore stale malformed session payloads.
        }
      }
      if (matchedKeys.length) await this.redisService.raw.del(...matchedKeys);
    } while (cursor !== '0');
  }

  private async ensureVisible(id: string, user: CurrentUserPayload) {
    const tenantId = this.resolveVisibleTenantId({}, user);
    const [appUser, memberBinding, isLeader] = await Promise.all([
      this.prisma.appUser.findFirst({ where: { id, deletedAt: null }, select: { id: true } }),
      this.prisma.distributionUserBinding.findFirst({
        where: {
          userId: id,
          status: 'ENABLED',
          bindSource: 'INVITE',
          ...(tenantId ? { tenantId } : {}),
        },
        select: { id: true },
      }),
      this.isDistributionLeader(id, tenantId),
    ]);
    if (!appUser || !memberBinding || isLeader) {
      throw new NotFoundException('H5 成员不存在或无权访问');
    }
    return appUser;
  }

  private parseScopeIds(raw: unknown, label: string) {
    const ids = Array.from(new Set(String(raw || '').split(',').map((item) => item.trim()).filter(Boolean)));
    if (ids.length > 100) throw new BadRequestException(`${label}范围最多支持 100 条`);
    return ids;
  }

  private resolveVisibleTenantId(query: Pick<AppUserQueryDto, 'tenantId'>, user: CurrentUserPayload) {
    const requestedTenantId = String(query.tenantId || '').trim();
    if (isPlatformUser(user)) {
      // 平台管理员在 H5 成员页默认查看全部租户。只有页面显式选择租户时才按租户过滤，
      // 避免当前后台登录态里携带的 tenantId 导致服务号/手机号新用户列表为空。
      return requestedTenantId || undefined;
    }
    const resolved = resolveTenantId(user, requestedTenantId);
    return resolved === '__NO_TENANT__' ? '__NO_TENANT__' : resolved;
  }

  private buildStatusWhere(status: AppUserQueryDto['status'], now: Date): Prisma.AppUserWhereInput {
    if (status === 'DISABLED') return { status: 'DISABLED' };
    if (status === 'RESTRICTED') {
      return { status: 'ENABLED', bannedUntil: { gt: now } };
    }
    if (status === 'ENABLED') {
      return {
        status: 'ENABLED',
        OR: [{ bannedUntil: null }, { bannedUntil: { lte: now } }],
      };
    }
    return {};
  }

  private async resolveMemberListScope(query: AppUserQueryDto, tenantId?: string): Promise<MemberListScope> {
    const requestedGroupId = String(query.leaderGroupId || '').trim();
    const memberOnly = query.memberOnly === 'true' || Boolean(requestedGroupId);
    if (!requestedGroupId) return { memberOnly };

    const group = await this.prisma.distributionGroup.findUnique({
      where: { id: requestedGroupId },
      select: { id: true, tenantId: true },
    });
    if (!group || (tenantId && group.tenantId !== tenantId)) {
      throw new NotFoundException('团长筛选不存在或无权访问');
    }
    return { memberOnly: true, leaderGroupId: group.id };
  }

  private async buildKeywordWhere(
    query: AppUserQueryDto,
    scope: { tenantId?: string; leaderGroupId?: string; memberOnly?: boolean } = {},
  ): Promise<Prisma.AppUserWhereInput> {
    const keyword = String(query.keyword || '').trim();
    const phone = this.normalizePhone(query.phone);
    const conditions: Prisma.AppUserWhereInput[] = [];
    if (keyword) {
      const normalizedKeywordPhone = this.normalizePhone(keyword);
      conditions.push(
        { nickname: { contains: keyword, mode: 'insensitive' } },
        { serviceOpenid: { contains: keyword, mode: 'insensitive' } },
        { wechatOpenid: { contains: keyword, mode: 'insensitive' } },
        { unionid: { contains: keyword, mode: 'insensitive' } },
      );
      if (normalizedKeywordPhone) {
        conditions.push({ phone: { contains: normalizedKeywordPhone, mode: 'insensitive' } });
      }
    }
    if (phone) {
      conditions.push({ phone: { contains: phone, mode: 'insensitive' } });
    }
    if (keyword || phone) {
      const [taskAccountUserIds, bindingUserIds] = await Promise.all([
        this.findTaskAccountUserIds({
          tenantId: scope.tenantId,
          groupId: scope.leaderGroupId,
          keyword,
          phone,
        }),
        this.findDistributionBindingUserIds({
          tenantId: scope.tenantId,
          groupId: scope.leaderGroupId,
          bindSource: scope.memberOnly ? 'INVITE' : undefined,
          keyword,
          phone,
        }),
      ]);
      const matchedUserIds = Array.from(new Set([...taskAccountUserIds, ...bindingUserIds]));
      if (matchedUserIds.length) conditions.push({ id: { in: matchedUserIds } });
    }
    return conditions.length ? { OR: conditions } : {};
  }

  private async findTaskAccountUserIds(filter: { tenantId?: string; groupId?: string; keyword?: string; phone?: string }) {
    const tenantId = String(filter.tenantId || '').trim();
    const groupId = String(filter.groupId || '').trim();
    const keyword = String(filter.keyword || '').trim();
    const phone = this.normalizePhone(filter.phone);
    const andWhere: Prisma.DistributionTaskAccountWhereInput[] = [];
    if (tenantId) andWhere.push({ tenantId });
    if (groupId) andWhere.push({ groupId });
    const orWhere: Prisma.DistributionTaskAccountWhereInput[] = [];
    if (keyword) {
      const normalizedKeywordPhone = this.normalizePhone(keyword);
      orWhere.push({ nickname: { contains: keyword, mode: 'insensitive' } });
      if (normalizedKeywordPhone) orWhere.push({ phone: { contains: normalizedKeywordPhone } });
    }
    if (phone) orWhere.push({ phone: { contains: phone } });
    if (orWhere.length) andWhere.push({ OR: orWhere });
    if (!andWhere.length) return [] as string[];
    const rows = await this.prisma.distributionTaskAccount.findMany({
      where: { AND: andWhere },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((item) => item.userId).filter(Boolean);
  }

  private async findDistributionBindingUserIds(filter: { tenantId?: string; groupId?: string; bindSource?: string; keyword?: string; phone?: string }) {
    const tenantId = String(filter.tenantId || '').trim();
    const groupId = String(filter.groupId || '').trim();
    const bindSource = String(filter.bindSource || '').trim();
    const keyword = String(filter.keyword || '').trim();
    const phone = this.normalizePhone(filter.phone);
    const andWhere: Prisma.DistributionUserBindingWhereInput[] = [{ status: 'ENABLED' }];
    if (tenantId) andWhere.push({ tenantId });
    if (groupId) andWhere.push({ groupId });
    if (bindSource) andWhere.push({ bindSource });

    const orWhere: Prisma.DistributionUserBindingWhereInput[] = [];
    if (keyword || phone) {
      const normalizedKeywordPhone = this.normalizePhone(keyword);
      const groupOrWhere: Prisma.DistributionGroupWhereInput[] = [];
      if (keyword) {
        groupOrWhere.push(
          { name: { contains: keyword, mode: 'insensitive' } },
          { leaderName: { contains: keyword, mode: 'insensitive' } },
          { memberInviteCode: { contains: keyword, mode: 'insensitive' } },
          { leaderBindCode: { contains: keyword, mode: 'insensitive' } },
        );
      }
      if (normalizedKeywordPhone) groupOrWhere.push({ leaderPhone: { contains: normalizedKeywordPhone } });
      if (phone) groupOrWhere.push({ leaderPhone: { contains: phone } });
      const groups = groupOrWhere.length
        ? await this.prisma.distributionGroup.findMany({
            where: {
              ...(tenantId ? { tenantId } : {}),
              ...(groupId ? { id: groupId } : {}),
              OR: groupOrWhere,
            },
            select: { id: true },
          })
        : [];
      const groupIds = groups.map((item) => item.id);
      if (groupIds.length) orWhere.push({ groupId: { in: groupIds } });
      if (keyword) orWhere.push({ inviteCode: { contains: keyword, mode: 'insensitive' } });
      if (!orWhere.length) return [] as string[];
      andWhere.push({ OR: orWhere });
    }

    if (andWhere.length <= 1 && !tenantId && !groupId && !bindSource) return [] as string[];
    const rows = await this.prisma.distributionUserBinding.findMany({
      where: { AND: andWhere },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((item) => item.userId).filter(Boolean);
  }

  private async findDistributionMemberUserIds(filter: { tenantId?: string; groupId?: string }) {
    const tenantId = String(filter.tenantId || '').trim();
    const groupId = String(filter.groupId || '').trim();
    const rows = await this.prisma.distributionUserBinding.findMany({
      where: {
        status: 'ENABLED',
        bindSource: 'INVITE',
        ...(tenantId ? { tenantId } : {}),
        ...(groupId ? { groupId } : {}),
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((item) => item.userId).filter(Boolean);
  }

  private async findDistributionLeaderUserIds(filter: { tenantId?: string; groupId?: string }) {
    const tenantId = String(filter.tenantId || '').trim();
    const groupId = String(filter.groupId || '').trim();
    const groups = await this.prisma.distributionGroup.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(groupId ? { id: groupId } : {}),
      },
      select: { leaderUserId: true, leaderTaskAccountId: true },
    });
    const userIds = new Set(groups.map((item) => String(item.leaderUserId || '').trim()).filter(Boolean));
    const taskAccountIds = Array.from(new Set(groups.map((item) => String(item.leaderTaskAccountId || '').trim()).filter(Boolean)));
    if (taskAccountIds.length) {
      const accounts = await this.prisma.distributionTaskAccount.findMany({
        where: { id: { in: taskAccountIds } },
        select: { userId: true },
      });
      accounts.forEach((item) => {
        const userId = String(item.userId || '').trim();
        if (userId) userIds.add(userId);
      });
    }
    return Array.from(userIds);
  }

  private async isDistributionLeader(userId: string, tenantId?: string) {
    const directGroup = await this.prisma.distributionGroup.findFirst({
      where: { leaderUserId: userId, ...(tenantId ? { tenantId } : {}) },
      select: { id: true },
    });
    if (directGroup) return true;

    const accounts = await this.prisma.distributionTaskAccount.findMany({
      where: { userId },
      select: { id: true },
    });
    const accountIds = accounts.map((item) => item.id);
    if (!accountIds.length) return false;
    const legacyLeaderGroup = await this.prisma.distributionGroup.findFirst({
      where: { leaderTaskAccountId: { in: accountIds }, ...(tenantId ? { tenantId } : {}) },
      select: { id: true },
    });
    return Boolean(legacyLeaderGroup);
  }

  private async buildTaskAccountSummaryMap(userIds: string[]) {
    const ids = Array.from(new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean)));
    const createEmptySummary = () => ({
      taskAccountCount: 0,
      activeTaskAccountCount: 0,
      disabledTaskAccountCount: 0,
      defaultTaskAccount: null,
      taskAccounts: [],
      distributionLeaders: [],
      distributionBindings: [],
    });
    const map = new Map<string, any>();
    ids.forEach((id) => map.set(id, createEmptySummary()));
    if (!ids.length) return map;

    const [accounts, bindings] = await Promise.all([
      this.prisma.distributionTaskAccount.findMany({
        where: { userId: { in: ids } },
        orderBy: [{ isDefault: 'desc' }, { status: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          userId: true,
          tenantId: true,
          groupId: true,
          phone: true,
          nickname: true,
          status: true,
          isDefault: true,
          smsVerified: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.distributionUserBinding.findMany({
        where: { userId: { in: ids }, status: 'ENABLED' },
        orderBy: [{ createdAt: 'desc' }],
        select: {
          id: true,
          userId: true,
          tenantId: true,
          groupId: true,
          status: true,
          bindSource: true,
          inviteCode: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const groupIds = Array.from(new Set([...accounts, ...bindings].map((item) => String(item.groupId || '').trim()).filter(Boolean)));
    const groups = groupIds.length
      ? await this.prisma.distributionGroup.findMany({
          where: { id: { in: groupIds } },
          select: { id: true, name: true, leaderName: true, leaderPhone: true, leaderUserId: true, leaderTaskAccountId: true },
        })
      : [];
    const leaderTaskAccountIds = Array.from(new Set(groups.map((item) => String(item.leaderTaskAccountId || '').trim()).filter(Boolean)));
    const leaderUserIds = Array.from(new Set(groups.map((item) => String(item.leaderUserId || '').trim()).filter(Boolean)));
    const [leaderTaskAccounts, leaderUsers] = await Promise.all([
      leaderTaskAccountIds.length
        ? this.prisma.distributionTaskAccount.findMany({
            where: { id: { in: leaderTaskAccountIds } },
            select: { id: true, nickname: true, phone: true },
          })
        : [],
      leaderUserIds.length
        ? this.prisma.appUser.findMany({
            where: { id: { in: leaderUserIds } },
            select: { id: true, nickname: true, phone: true },
          })
        : [],
    ]);
    const groupMap = new Map(groups.map((item) => [item.id, item]));
    const leaderTaskAccountMap = new Map(leaderTaskAccounts.map((item) => [item.id, item]));
    const leaderUserMap = new Map(leaderUsers.map((item) => [item.id, item]));

    const buildLeader = (group?: (typeof groups)[number] | null) => {
      if (!group) return null;
      const leaderTaskAccount = group.leaderTaskAccountId ? leaderTaskAccountMap.get(group.leaderTaskAccountId) : null;
      const leaderUser = group.leaderUserId ? leaderUserMap.get(group.leaderUserId) : null;
      const leaderName = String(group.leaderName || leaderTaskAccount?.nickname || leaderUser?.nickname || '').trim();
      const leaderPhone = this.normalizePhone(group.leaderPhone || leaderTaskAccount?.phone || leaderUser?.phone || '');
      return {
        groupId: group.id,
        groupName: group.name,
        leaderName: leaderName || null,
        leaderPhone: leaderPhone || null,
        maskedLeaderPhone: this.maskPhone(leaderPhone),
        leaderUserId: group.leaderUserId || null,
        leaderTaskAccountId: group.leaderTaskAccountId || null,
      };
    };

    const appendLeader = (summary: any, leader: any) => {
      if (!leader) return;
      if (!Array.isArray(summary.distributionLeaders)) summary.distributionLeaders = [];
      const leaderKey = `${leader.groupId}:${leader.leaderUserId || ''}:${leader.leaderTaskAccountId || ''}:${leader.leaderPhone || ''}`;
      const existed = summary.distributionLeaders.some((item: any) => `${item.groupId}:${item.leaderUserId || ''}:${item.leaderTaskAccountId || ''}:${item.leaderPhone || ''}` === leaderKey);
      if (!existed) summary.distributionLeaders.push(leader);
    };

    for (const binding of bindings) {
      const summary = map.get(binding.userId) || createEmptySummary();
      const group = groupMap.get(binding.groupId) || null;
      const leader = buildLeader(group);
      if (!Array.isArray(summary.distributionBindings)) summary.distributionBindings = [];
      summary.distributionBindings.push({ ...binding, group, leader });
      appendLeader(summary, leader);
      map.set(binding.userId, summary);
    }

    for (const account of accounts) {
      const summary = map.get(account.userId) || createEmptySummary();
      summary.taskAccountCount += 1;
      if (account.status === 'ENABLED') summary.activeTaskAccountCount += 1;
      if (account.status === 'DISABLED') summary.disabledTaskAccountCount += 1;
      const group = groupMap.get(account.groupId) || null;
      const leader = buildLeader(group);
      const card = { ...account, maskedPhone: this.maskPhone(account.phone), group, leader };
      if (!Array.isArray(summary.taskAccounts)) summary.taskAccounts = [];
      summary.taskAccounts.push(card);
      appendLeader(summary, leader);
      if (account.status === 'ENABLED' && (account.isDefault || !summary.defaultTaskAccount)) summary.defaultTaskAccount = card;
      map.set(account.userId, summary);
    }
    return map;
  }

  private async buildTaskAccountDetail(appUserId: string, tenantId?: string) {
    const where: Prisma.DistributionTaskAccountWhereInput = { userId: appUserId, ...(tenantId ? { tenantId } : {}) };
    const accounts = await this.prisma.distributionTaskAccount.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { status: 'asc' }, { createdAt: 'asc' }],
    });
    const accountIds = accounts.map((item) => item.id);
    const tenantIds = Array.from(new Set(accounts.map((item) => item.tenantId).filter(Boolean)));
    const groupIds = Array.from(new Set(accounts.map((item) => item.groupId).filter(Boolean)));
    const [tenants, groups, groupedStats, todayAbandonStats] = await Promise.all([
      tenantIds.length ? this.prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true, code: true } }) : [],
      groupIds.length ? this.prisma.distributionGroup.findMany({ where: { id: { in: groupIds } }, select: { id: true, name: true, leaderName: true, leaderPhone: true } }) : [],
      accountIds.length
        ? this.prisma.taskParticipant.groupBy({
            by: ['taskAccountId', 'status', 'settlementStatus'],
            where: { appUserId, taskAccountId: { in: accountIds }, task: { deletedAt: null } },
            _count: { _all: true },
            _sum: { settlementAmount: true },
            _max: { updatedAt: true },
          })
        : [],
      accountIds.length
        ? this.prisma.taskParticipant.groupBy({
            by: ['taskAccountId'],
            where: { appUserId, taskAccountId: { in: accountIds }, status: 'ABANDONED', abandonedAt: { gte: this.getTodayRange().start, lt: this.getTodayRange().end }, task: { deletedAt: null } },
            _count: { _all: true },
          })
        : [],
    ]);
    const tenantMap = new Map(tenants.map((item) => [item.id, item]));
    const groupMap = new Map(groups.map((item) => [item.id, item]));
    const statsMap = new Map<string, any>();
    for (const account of accounts) {
      statsMap.set(account.id, {
        totalOrders: 0,
        currentOrders: 0,
        completedOrders: 0,
        abandonedOrders: 0,
        settledOrders: 0,
        settledAmount: 0,
        todayAbandonCount: 0,
        latestUsedAt: null,
      });
    }
    for (const row of groupedStats as any[]) {
      const accountId = String(row.taskAccountId || '');
      const stats = statsMap.get(accountId);
      if (!stats) continue;
      const count = Number(row._count?._all || 0);
      const status = String(row.status || '').toUpperCase();
      const settlementStatus = String(row.settlementStatus || '').toUpperCase();
      stats.totalOrders += count;
      if (status === 'STARTED' || status === 'CLAIMED') stats.currentOrders += count;
      if (status === 'COMPLETED') stats.completedOrders += count;
      if (status === 'ABANDONED') stats.abandonedOrders += count;
      if (settlementStatus === 'SETTLED') {
        stats.settledOrders += count;
        stats.settledAmount += Number(row._sum?.settlementAmount || 0);
      }
      const latest = row._max?.updatedAt ? new Date(row._max.updatedAt) : null;
      if (latest && (!stats.latestUsedAt || latest.getTime() > new Date(stats.latestUsedAt).getTime())) stats.latestUsedAt = latest;
    }
    for (const row of todayAbandonStats as any[]) {
      const stats = statsMap.get(String(row.taskAccountId || ''));
      if (stats) stats.todayAbandonCount = Number(row._count?._all || 0);
    }
    const items = accounts.map((account) => ({
      ...account,
      maskedPhone: this.maskPhone(account.phone),
      tenant: tenantMap.get(account.tenantId) || null,
      group: groupMap.get(account.groupId) || null,
      stats: statsMap.get(account.id) || null,
    }));
    const summary = {
      taskAccountCount: items.length,
      activeTaskAccountCount: items.filter((item) => item.status === 'ENABLED').length,
      disabledTaskAccountCount: items.filter((item) => item.status === 'DISABLED').length,
      defaultTaskAccount: items.find((item) => item.status === 'ENABLED' && item.isDefault) || items.find((item) => item.status === 'ENABLED') || null,
    };
    return { items, summary };
  }

  private toListItem(item: any, taskAccountSummary?: any) {
    const latestParticipant = item.participants?.[0] ?? null;
    const safeTaskAccountSummary = taskAccountSummary || { taskAccountCount: 0, activeTaskAccountCount: 0, disabledTaskAccountCount: 0, defaultTaskAccount: null, taskAccounts: [], distributionLeaders: [], distributionBindings: [] };
    return {
      id: item.id,
      phone: item.phone,
      nickname: item.nickname,
      avatarUrl: item.avatarUrl,
      wechatOpenid: item.wechatOpenid,
      serviceOpenid: item.serviceOpenid,
      unionid: item.unionid,
      tenantId: item.tenantId,
      tenant: item.tenant ?? null,
      status: item.status,
      resolvedStatus: this.resolveAppUserStatus(item),
      bannedUntil: item.bannedUntil,
      banReason: item.banReason,
      isTestData: Boolean(item.isTestData),
      testMarkedAt: item.testMarkedAt || null,
      totalCompletedOrders: item.totalCompletedOrders,
      totalSettledAmount: item.totalSettledAmount,
      balanceAmount: item.balanceAmount,
      withdrawnAmount: item.withdrawnAmount,
      lastLoginAt: item.lastLoginAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      counts: item._count,
      latestParticipant,
      taskAccountCount: safeTaskAccountSummary.taskAccountCount,
      activeTaskAccountCount: safeTaskAccountSummary.activeTaskAccountCount,
      disabledTaskAccountCount: safeTaskAccountSummary.disabledTaskAccountCount,
      defaultTaskAccount: safeTaskAccountSummary.defaultTaskAccount,
      taskAccounts: safeTaskAccountSummary.taskAccounts || [],
      taskAccountSummary: safeTaskAccountSummary,
      distributionLeaders: safeTaskAccountSummary.distributionLeaders || [],
      distributionBindings: safeTaskAccountSummary.distributionBindings || [],
      registerType: item.serviceOpenid ? 'WECHAT_MP' : item.phone ? 'PHONE' : 'UNKNOWN',
    };
  }

  private resolveAppUserStatus(appUser: AppUserStatusSource) {
    const now = new Date();
    const stillInBanWindow = appUser.bannedUntil ? appUser.bannedUntil.getTime() > now.getTime() : false;
    const disabled = appUser.status === 'DISABLED';
    const restricted = disabled || stillInBanWindow;
    return {
      status: restricted ? 'RESTRICTED' : 'ENABLED',
      rawStatus: appUser.status,
      canClaim: !restricted,
      bannedUntil: restricted ? appUser.bannedUntil : null,
      banReason: restricted ? appUser.banReason : null,
      message: restricted ? (appUser.banReason || '当前账号处于限制接单状态') : null,
    };
  }


  private maskPhone(phone?: string | null) {
    const value = this.normalizePhone(phone);
    if (value.length < 7) return value;
    return value.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
  }

  private normalizePhone(value?: string | null) {
    const digits = String(value ?? '').replace(/[^0-9]/g, '');
    if (digits.length === 13 && digits.startsWith('86')) return digits.slice(2);
    return digits;
  }
}
