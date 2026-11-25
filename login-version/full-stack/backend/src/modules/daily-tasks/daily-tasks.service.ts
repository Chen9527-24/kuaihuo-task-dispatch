import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type UploadFile } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { getPagination } from '../../common/dto/pagination.dto';
import { cozeErrorResponse, createCozeTransportDiagnostic, extractCozeSafeDiagnostic, formatCozeErrorMessage, readCozeLogIdFromHeaders } from '../../common/utils/coze-response';
import { CurrentUserPayload } from '../../common/types/current-user.type';
import { isPlatformUser, resolveRequiredTenantId, resolveTenantId, resolveVisibleTenantId } from '../../common/utils/tenant-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { FilesService } from '../files/files.service';
import { WechatService } from '../wechat/wechat.service';
import { SmsService } from '../sms/sms.service';
import {
  BatchMarkDailyTasksAsTestDataDto,
  CreateDailyTaskConfigDto,
  CreateDailyTaskDto,
  DailyTaskCommentInputDto,
  DailyTaskVideoLinkInputDto,
  RemoveDailyTaskDto,
  UpdateDailyTaskConfigDto,
  UpdateDailyTaskDto,
} from './dto/daily-task.dto';
import { DailyTaskQueryDto } from './dto/daily-task-query.dto';
import { RejectTaskOrderDto, SettleTaskOrderDto, TaskOrderQueryDto } from './dto/task-order.dto';
import { AdminApproveLeaderApplicationDto, AdminBindGroupLeaderDto, AdminCreateDistributionGroupDto, AdminCreateGroupCollaborationDto, AdminDeleteDistributionGroupDto, AdminDistributionGroupQueryDto, AdminForceUnbindDeleteDistributionGroupDto, AdminGroupCollaborationQueryDto, AdminLeaderApplicationQueryDto, AdminLeaderCommissionSettlementQueryDto, AdminMarkDistributionGroupTestDataDto, AdminRejectLeaderApplicationDto, AdminResetDistributionGroupTestDataDto, AdminUnbindDistributionGroupLeaderDto, AdminUpdateDistributionGroupCodeDto, AdminUpdateDistributionGroupCommissionDto, BanAppUserDto, DistributionAbandonDto, DistributionClaimDto, DistributionCompleteDto, DistributionHomepageProofRecognitionRequestDto, DistributionHomepageProofRetainDto, DistributionInviteBindDto, DistributionLeaderApplicationDto, DistributionLeaderBindDto, DistributionLeaderCenterQueryDto, DistributionLoginDto, DistributionOrderQueryDto, DistributionProfileDto, DistributionTaskAccountDto, DistributionTaskQueryDto, DistributionWithdrawDto } from './dto/distribution.dto';
import {
  PublicClaimCommentDto,
  PublicConfirmCompleteDto,
  PublicStartTaskDto,
  PublicTaskLinkQueryDto,
} from './dto/public-task.dto';
import { AiGenerateCommentsDto, BatchDeleteTaskCommentsDto, CreateTaskCommentDto, UpdateTaskCommentDto } from './dto/task-comment.dto';
import { SendSmsCodeDto } from '../sms/dto/sms-code.dto';
import { DistributionHomepageOcrService } from './distribution-homepage-ocr.service';
import { DeepSeekService } from '../ai/deepseek.service';

const adminTaskInclude = {
  tenant: true,
  mediaAccount: true,
  createdBy: { select: { id: true, username: true, displayName: true } },
  videoLinks: { orderBy: { sort: 'asc' as const } },
  comments: {
    orderBy: { sort: 'asc' as const },
    include: {
      assignee: { select: { id: true, username: true, displayName: true } },
      participant: {
        select: {
          id: true,
          visitorName: true,
          phone: true,
          visitorToken: true,
          uploadedImageUrl: true,
          settlementStatus: true,
          status: true,
          claimedAt: true,
          completedAt: true,
          settledAt: true,
        },
      },
    },
  },
  dispatches: { orderBy: { createdAt: 'desc' as const } },
  participants: {
    orderBy: { updatedAt: 'desc' as const },
    select: {
      id: true,
      visitorToken: true,
      visitorName: true,
      phone: true,
      status: true,
      uploadedImageUrl: true,
      settlementStatus: true,
      settlementAmount: true,
      settlementOrderNo: true,
      settlementProofUrl: true,
      settlementRemark: true,
      settledAt: true,
      sourcePlatform: true,
      startedAt: true,
      claimedAt: true,
      completedAt: true,
      lastActiveAt: true,
    },
  },
} satisfies Prisma.DailyTaskInclude;

type AdminTaskDetail = Prisma.DailyTaskGetPayload<{ include: typeof adminTaskInclude }>;
const COZE_CONVERSATION_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;

type RequestMeta = {
  ip?: string | null;
  userAgent?: string | string[] | null;
  referer?: string | null;
  tenantRef?: string | null;
  authorization?: string | string[] | null;
};

type TaskCommissionSnapshot = {
  distributionScope: 'TENANT' | 'GROUP';
  distributionGroupId: string | null;
  taskBudgetAmount: number;
  workerRewardAmount: number;
  commissionEnabled: boolean;
  commissionMode: 'INCLUDED' | 'EXTRA' | null;
  commissionRuleType: 'PERCENT' | 'FIXED' | null;
  commissionRuleValue: number | null;
  commissionAmount: number;
  commissionGroupId: string | null;
  commissionLeaderUserId: string | null;
};

const DAILY_TASK_MODULE_CONFIG_TYPE_CODE = 'daily_task_module_config';
const DISTRIBUTION_HOMEPAGE_PROOF_BIZ_TYPE = 'APP_USER_HOMEPAGE_PROOF';
const DISTRIBUTION_HOMEPAGE_PROOF_FIELD = 'homepageProof';

type OrderMediaFile = Pick<
  UploadFile,
  | 'id'
  | 'storageDriver'
  | 'bucket'
  | 'objectKey'
  | 'thumbnailObjectKey'
  | 'thumbnailMimeType'
  | 'thumbnailSize'
  | 'imageWidth'
  | 'imageHeight'
  | 'url'
  | 'status'
>;

@Injectable()
export class DailyTasksService {
  private readonly logger = new Logger(DailyTasksService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly wechatService: WechatService,
    private readonly smsService: SmsService,
    private readonly distributionHomepageOcrService: DistributionHomepageOcrService,
    private readonly deepSeekService: DeepSeekService,
  ) {}

  async list(query: DailyTaskQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query);
    const tenantId = resolveVisibleTenantId(user, query.tenantId);
    const explicitIds = this.parseScopeIds(query.ids, '每日任务');
    const where: Prisma.DailyTaskWhereInput = {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(query.platform ? { platform: this.normalizePlatform(query.platform) } : {}),
      ...(query.postId ? { postId: query.postId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.distributionGroupId ? { distributionGroupId: query.distributionGroupId } : {}),
      ...(explicitIds.length ? { id: { in: explicitIds } } : {}),
      ...(query.isTestData !== undefined ? { isTestData: query.isTestData } : {}),
      ...(query.keyword ? { OR: [
        { title: { contains: query.keyword, mode: 'insensitive' } },
        { postId: query.keyword.trim() },
      ] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.dailyTask.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          tenant: true,
          mediaAccount: true,
          createdBy: { select: { id: true, username: true, displayName: true } },
          videoLinks: {
            orderBy: [{ isPrimary: 'desc' }, { sort: 'asc' }, { createdAt: 'asc' }],
            select: {
              id: true,
              url: true,
              isPrimary: true,
              sort: true,
            },
          },
          comments: {
            orderBy: { sort: 'asc' },
            select: {
              id: true,
              content: true,
              source: true,
              regionCode: true,
              status: true,
              sort: true,
            },
          },
        },
      }),
      this.prisma.dailyTask.count({ where }),
    ]);
    const relatedGroupIds = Array.from(
      new Set(
        items
          .flatMap((item) => [item.distributionGroupId, item.commissionGroupId])
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const relatedGroups = relatedGroupIds.length
      ? await this.prisma.distributionGroup.findMany({
          where: { id: { in: relatedGroupIds } },
          select: { id: true, name: true, status: true, deletedAt: true },
        })
      : [];
    const relatedGroupMap = new Map(relatedGroups.map((item) => [item.id, item]));

    const pendingSettlementCounts = items.length
      ? await this.prisma.taskParticipant.groupBy({
          by: ['taskId'],
          where: {
            taskId: { in: items.map((item) => item.id) },
            status: 'COMPLETED',
            settlementStatus: 'UNSETTLED',
            OR: [{ uploadedImageFileId: { not: null } }, { uploadedImageUrl: { not: null } }],
          },
          _count: { _all: true },
        })
      : [];
    const pendingSettlementCountByTaskId = new Map(
      pendingSettlementCounts.map((item) => [item.taskId, item._count._all]),
    );
    const participantCounts = items.length
      ? await this.prisma.taskParticipant.groupBy({
          by: ['taskId'],
          where: { taskId: { in: items.map((item) => item.id) } },
          _count: { _all: true },
        })
      : [];
    const participantCountByTaskId = new Map(
      participantCounts.map((item) => [item.taskId, item._count._all]),
    );

    const normalizedItems = await Promise.all(
      items.map(async (item) => {
        const postId = await this.ensureNumericPostId(item);
        const { id: taskId, postId: _postId, stepConfig: _stepConfig, comments, videoLinks, ...rest } = item;
        return {
          ...rest,
          id: taskId,
          postId,
          leaderGroup: item.distributionGroupId ? relatedGroupMap.get(item.distributionGroupId) || null : null,
          pendingSettlementCount: pendingSettlementCountByTaskId.get(taskId) ?? 0,
          participantCount: participantCountByTaskId.get(taskId) ?? 0,
          commissionLocked: (participantCountByTaskId.get(taskId) ?? 0) > 0,
          videoUrl: this.toTaskVideoUrlArray(item),
          videoLinks,
          comments,
        };
      }),
    );
    return { code: 0, message: 'ok', data: normalizedItems, page, pageSize, total };
  }

  async detail(id: string, user?: CurrentUserPayload) {
    const task = await this.findAdminTaskByIdentifier(id, user);
    const config = await this.getResolvedConfigByPlatform(task.platform);
    const postId = await this.ensureNumericPostId(task);
    const { id: taskId, postId: _postId, stepConfig: _stepConfig, comments, ...rest } = task;
    return {
      ...rest,
      id: taskId,
      postId,
      videoUrl: this.toTaskVideoUrlArray(task),
      comments,
      stepConfig: config,
    };
  }

  async create(dto: CreateDailyTaskDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    const platform = this.normalizePlatform(dto.platform);
    await this.ensureMediaAccount(dto.mediaAccountId, tenantId, platform);
    const distributionGroup = await this.ensureDistributionGroupForTask(tenantId, dto.distributionScope, dto.distributionGroupId);
    const commissionSnapshot = await this.resolveTaskCommissionSnapshot({
      tenantId,
      input: dto,
      distributionScope: dto.distributionScope,
      distributionGroup: distributionGroup || null,
    });
    const coverFile = dto.coverFileId ? await this.filesService.getFile(dto.coverFileId) : null;
    const inputComments = this.normalizeInputComments(this.pickInputComments(dto));
    const preferredPostId = String(dto.postId ?? '').trim();

    const task = await this.prisma.$transaction(async (tx) => {
      await this.lockDailyTaskPostIdSequence(tx);
      const resolvedPostId = await this.resolvePostIdForWrite(
        {
          tenantId,
          platform,
          preferredPostId,
        },
        tx,
      );
      return this.createTaskWithRelations(tx, {
        dto,
        userId: user.id,
        tenantId,
        platform,
        postId: resolvedPostId,
        coverUrl: coverFile?.url,
        inputComments,
        commissionSnapshot,
      });
    });

    if (dto.coverFileId) {
      await this.filesService.activateAndBind(dto.coverFileId, { bizType: 'DAILY_TASK', bizId: task.id, fieldName: 'cover' });
    }

    await this.recalculateTaskCounters(task.id);
    return this.detail(task.id, user);
  }

  async update(id: string, dto: UpdateDailyTaskDto, user: CurrentUserPayload) {
    const oldTask = await this.findAdminTaskByIdentifier(id, user);
    if (oldTask.status === 'DISABLED') {
      throw new BadRequestException('当前任务已停用，不能编辑');
    }

    const platform = this.normalizePlatform(dto.platform ?? oldTask.platform);
    const mediaAccountId = dto.mediaAccountId ?? oldTask.mediaAccountId;
    const resolvedPostId =
      dto.postId !== undefined
        ? await this.resolvePostIdForWrite({
            tenantId: oldTask.tenantId,
            platform,
            preferredPostId: dto.postId,
            excludeTaskId: oldTask.id,
          })
        : oldTask.postId;
    const inputComments = this.pickInputComments(dto);
    const normalizedComments = this.normalizeInputComments(inputComments);
    const shouldReplaceComments =
      dto.replaceComments === true || (inputComments !== undefined && normalizedComments.length > 0);
    await this.ensureMediaAccount(mediaAccountId, oldTask.tenantId, platform);

    const effectiveDistributionScope =
      dto.distributionScope !== undefined
        ? String(dto.distributionScope || 'TENANT').toUpperCase() === 'GROUP'
          ? 'GROUP'
          : 'TENANT'
        : oldTask.distributionScope === 'GROUP'
          ? 'GROUP'
          : 'TENANT';
    const effectiveDistributionGroupId =
      effectiveDistributionScope === 'GROUP'
        ? dto.distributionGroupId !== undefined
          ? String(dto.distributionGroupId || '').trim() || null
          : oldTask.distributionGroupId || null
        : null;
    const distributionGroup = await this.ensureDistributionGroupForTask(
      oldTask.tenantId,
      effectiveDistributionScope,
      effectiveDistributionGroupId,
    );
    const commissionFieldsTouched = [
      'taskBudgetAmount',
      'rewardAmount',
      'commissionEnabled',
      'commissionMode',
      'distributionScope',
      'distributionGroupId',
    ].some((key) => Object.prototype.hasOwnProperty.call(dto, key));

    let commissionSnapshot: TaskCommissionSnapshot | null = null;
    if (commissionFieldsTouched) {
      commissionSnapshot = await this.resolveTaskCommissionSnapshot({
        tenantId: oldTask.tenantId,
        input: {
          ...dto,
          taskBudgetAmount:
            dto.taskBudgetAmount ??
            (Number((oldTask as any).taskBudgetAmount) > 0
              ? Number((oldTask as any).taskBudgetAmount)
              : Number(oldTask.rewardAmount || 0)),
          rewardAmount: dto.rewardAmount ?? oldTask.rewardAmount,
          commissionEnabled: dto.commissionEnabled ?? oldTask.commissionEnabled,
          commissionMode: dto.commissionMode ?? (oldTask as any).commissionMode ?? null,
        },
        distributionScope: effectiveDistributionScope,
        distributionGroup: distributionGroup || null,
      });
      const participantCount = await this.prisma.taskParticipant.count({ where: { taskId: oldTask.id } });
      if (participantCount > 0 && !this.isSameTaskCommissionSnapshot(oldTask, commissionSnapshot)) {
        throw new BadRequestException('已有用户领取任务，任务金额与团长分佣已锁定；如需调整请先停用任务后重新创建');
      }
    }

    const coverFile = dto.coverFileId ? await this.filesService.getFile(dto.coverFileId) : null;
    const updateData: Prisma.DailyTaskUncheckedUpdateInput = {
      ...(dto.mediaAccountId !== undefined ? { mediaAccountId: dto.mediaAccountId } : {}),
      ...(dto.platform !== undefined ? { platform } : {}),
      postId: resolvedPostId,
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.authorName !== undefined ? { authorName: dto.authorName } : {}),
      ...(dto.publishedAt !== undefined ? { publishedAt: this.parseOptionalDate(dto.publishedAt) } : {}),
      ...(dto.coverFileId !== undefined ? { coverFileId: dto.coverFileId } : {}),
      ...(coverFile ? { coverUrl: coverFile.url } : {}),
      ...(dto.copywriting !== undefined ? { copywriting: dto.copywriting } : {}),
      ...(dto.commentRequirement !== undefined ? { commentRequirement: dto.commentRequirement } : {}),
      ...(dto.commentExample !== undefined ? { commentExample: dto.commentExample } : {}),
      ...(dto.targetCommentCount !== undefined ? { targetCommentCount: dto.targetCommentCount } : {}),
      ...(dto.allowGroupCollaboration !== undefined ? { allowGroupCollaboration: Boolean(dto.allowGroupCollaboration) } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.remark !== undefined ? { remark: dto.remark } : {}),
      ...(commissionSnapshot
        ? {
            rewardAmount: commissionSnapshot.workerRewardAmount,
            taskBudgetAmount: commissionSnapshot.taskBudgetAmount,
            distributionScope: commissionSnapshot.distributionScope,
            distributionGroupId: commissionSnapshot.distributionGroupId,
            commissionEnabled: commissionSnapshot.commissionEnabled,
            commissionRuleId: null,
            commissionMode: commissionSnapshot.commissionMode,
            commissionRuleType: commissionSnapshot.commissionRuleType,
            commissionRuleValue: commissionSnapshot.commissionRuleValue,
            commissionAmount: commissionSnapshot.commissionAmount,
            commissionGroupId: commissionSnapshot.commissionGroupId,
            commissionLeaderUserId: commissionSnapshot.commissionLeaderUserId,
          }
        : {}),
    };

    const resolvedVideoLinks =
      dto.videoUrl !== undefined || dto.videoLinks !== undefined
        ? this.resolveTaskVideoLinks({
            videoUrls: dto.videoUrl,
            extraLinks: dto.videoLinks,
            fallbackPrimaryUrl: dto.videoUrl === undefined ? oldTask.videoUrl : undefined,
          })
        : null;

    if (resolvedVideoLinks) {
      Object.assign(updateData, { videoUrl: resolvedVideoLinks.primaryUrl });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const task = await tx.dailyTask.update({
        where: { id: oldTask.id },
        data: updateData,
      });

      if (shouldReplaceComments) {
        const blockedCount = await tx.taskComment.count({
          where: {
            taskId: oldTask.id,
            status: { in: ['CLAIMED', 'COMPLETED'] },
          },
        });
        if (blockedCount > 0) {
          throw new BadRequestException('当前存在已领取或已完成的评论，不能直接替换评论池');
        }

        await tx.taskComment.deleteMany({ where: { taskId: oldTask.id } });
        if (normalizedComments.length) {
          await tx.taskComment.createMany({
            data: normalizedComments.map((comment, index) => ({
              taskId: oldTask.id,
              content: comment.content,
              source: comment.source ?? 'MANUAL',
              status: 'AVAILABLE',
              regionCode: comment.regionCode,
              sort: index,
            })),
          });
        }
      }

      if (resolvedVideoLinks) {
        await tx.dailyTaskVideoLink.deleteMany({ where: { taskId: oldTask.id } });
        await tx.dailyTaskVideoLink.createMany({
          data: resolvedVideoLinks.links.map((link) => ({
            taskId: oldTask.id,
            url: link.url,
            isPrimary: link.isPrimary,
            sort: link.sort,
          })),
        });
      }

      return task;
    });

    if (dto.coverFileId) {
      await this.filesService.activateAndBind(dto.coverFileId, { bizType: 'DAILY_TASK', bizId: oldTask.id, fieldName: 'cover' });
    }

    await this.recalculateTaskCounters(oldTask.id);
    return this.detail(updated.id, user);
  }

  async getConfig(platform: string) {
    const normalizedPlatform = this.normalizePlatform(platform);
    const item = await this.prisma.dictItem.findUnique({
      where: { typeCode_value: { typeCode: DAILY_TASK_MODULE_CONFIG_TYPE_CODE, value: normalizedPlatform } },
    });
    if (!item) {
      throw new NotFoundException('任务配置不存在');
    }
    return {
      id: item.id,
      platform: item.value,
      config: item.remark,
    };
  }

  async createConfig(dto: CreateDailyTaskConfigDto) {
    const platform = this.normalizePlatform(dto.platform);
    await this.ensureTaskConfigType();
    const exists = await this.prisma.dictItem.findUnique({
      where: { typeCode_value: { typeCode: DAILY_TASK_MODULE_CONFIG_TYPE_CODE, value: platform } },
      select: { id: true },
    });
    if (exists) {
      throw new ConflictException('当前平台的任务配置已存在');
    }
    const item = await this.prisma.dictItem.create({
      data: {
        typeCode: DAILY_TASK_MODULE_CONFIG_TYPE_CODE,
        label: platform,
        value: platform,
        status: 'ENABLED',
        remark: dto.config,
      },
    });
    return {
      id: item.id,
      platform: item.value,
      config: dto.config,
    };
  }

  async updateConfig(dto: UpdateDailyTaskConfigDto) {
    const platform = this.normalizePlatform(dto.platform);
    const existing = await this.prisma.dictItem.findUnique({
      where: { typeCode_value: { typeCode: DAILY_TASK_MODULE_CONFIG_TYPE_CODE, value: platform } },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('任务配置不存在');
    }
    const item = await this.prisma.dictItem.update({
      where: { id: existing.id },
      data: {
        label: platform,
        value: platform,
        status: 'ENABLED',
        remark: dto.config,
      },
    });
    return {
      id: item.id,
      platform: item.value,
      config: dto.config,
    };
  }

  async markDailyTaskAsTestData(id: string, user: CurrentUserPayload) {
    const taskId = String(id || '').trim();
    if (!taskId) throw new BadRequestException('每日任务不能为空');
    const result = await this.markDailyTaskIdsAsTestData([taskId], user);
    return { ...result, taskId };
  }

  async batchMarkDailyTasksAsTestData(dto: BatchMarkDailyTasksAsTestDataDto, user: CurrentUserPayload) {
    return this.markDailyTaskIdsAsTestData(dto.ids, user);
  }

  async remove(id: string, user: CurrentUserPayload, dto?: RemoveDailyTaskDto) {
    const task = await this.findAdminTaskByIdentifier(id, user);
    if (task.isTestData) {
      this.assertDistributionTestDataPurgeEnabled();
      if (String(dto?.confirmTitle || '').trim() !== task.title) {
        throw new BadRequestException('请输入完整任务标题确认测试数据删除');
      }
      // 默认走“当前任务直接链路清理”：只移除该任务及其订单、佣金和可回退的收益记录。
      // 只有管理员显式勾选并输入服务端确认文本时，才会升级为跨任务、跨账号的高危强制清理。
      if (dto?.forceAdminPurge) {
        return this.forcePurgeTestDailyTask(task.id, user, {
          forceAdminPurge: true,
          confirmForceText: String(dto?.confirmForceText || '').trim(),
        });
      }
      return this.purgeTestDailyTask(task, user);
    }

    const [claimedCommentCount, claimedParticipantCount] = await this.prisma.$transaction([
      this.prisma.taskComment.count({
        where: {
          taskId: task.id,
          status: { in: ['CLAIMED', 'COMPLETED'] },
        },
      }),
      this.prisma.taskParticipant.count({
        where: {
          taskId: task.id,
          OR: [
            { status: { in: ['CLAIMED', 'COMPLETED'] } },
            { comments: { some: { status: { in: ['CLAIMED', 'COMPLETED'] } } } },
          ],
        },
      }),
    ]);
    if (claimedCommentCount > 0 || claimedParticipantCount > 0) {
      throw new BadRequestException('已有领取过的任务，无法删除；测试数据请先标记为测试任务后再清理');
    }
    await this.prisma.dailyTask.update({ where: { id: task.id }, data: { deletedAt: new Date(), status: 'CANCELLED' } });
    return { success: true, mode: 'SOFT_DELETE' };
  }
  private async markDailyTaskIdsAsTestData(rawIds: string[], user: CurrentUserPayload) {
    this.assertDistributionTestDataPurgeEnabled();
    const ids = Array.from(new Set((rawIds || []).map((item) => String(item || '').trim()).filter(Boolean)));
    if (!ids.length) throw new BadRequestException('请至少选择一个每日任务');
    if (ids.length > 100) throw new BadRequestException('一次最多标记 100 个每日任务');

    const tasks = await this.prisma.dailyTask.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, tenantId: true, title: true, status: true, isTestData: true },
    });
    if (tasks.length !== ids.length) throw new NotFoundException('存在不存在或已删除的每日任务，请刷新列表后重试');
    for (const task of tasks) {
      if (resolveTenantId(user, task.tenantId) !== task.tenantId) {
        throw new NotFoundException('每日任务不存在');
      }
    }

    const tasksToMark = tasks.filter((task) => !task.isTestData);
    if (!tasksToMark.length) {
      return { selectedCount: ids.length, markedCount: 0, alreadyMarkedCount: ids.length, stoppedCount: 0 };
    }

    const markedAt = new Date();
    const markedIds = tasksToMark.map((task) => task.id);
    await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.dailyTask.updateMany({
        where: { id: { in: markedIds }, deletedAt: null, isTestData: false },
        data: { isTestData: true, testMarkedAt: markedAt, testMarkedById: user.id, status: 'DISABLED' },
      });
      if (updateResult.count !== markedIds.length) {
        throw new ConflictException('部分任务状态已变化，请刷新列表后重试');
      }
      await Promise.all(
        tasksToMark.map((task) =>
          tx.operationLog.create({
            data: {
              operatorId: user.id,
              tenantId: task.tenantId,
              module: 'DAILY_TASK',
              action: 'MARK_TEST_DATA',
              bizId: task.id,
              description: `将每日任务“${task.title}”标记为测试数据并停用`,
              beforeData: { status: task.status, isTestData: false },
              afterData: { status: 'DISABLED', isTestData: true, testMarkedAt: markedAt.toISOString() },
            },
          }),
        ),
      );
    });

    return {
      selectedCount: ids.length,
      markedCount: markedIds.length,
      alreadyMarkedCount: ids.length - markedIds.length,
      stoppedCount: tasksToMark.filter((task) => task.status !== 'DISABLED').length,
    };
  }

  /**
   * 返回测试清理预演。
   * 起点任务必须已经标记为测试；管理员强制清理会自动计算关联任务、订单、账号和资金范围，
   * 不要求操作人跨页面逐条标记或手工定位。
   */
  async getForceTestDailyTaskPurgePreview(id: string, user: CurrentUserPayload) {
    const task = await this.findAdminTaskByIdentifier(id, user);
    if (!task.isTestData) throw new BadRequestException('当前任务未标记为测试数据，不能进入强制清理');
    return this.buildForceTestTaskPurgePlan(this.prisma, task.id);
  }

  /**
   * 管理员强制清理。
   *
   * 此路径只要求“起点任务”已标记为测试并且服务端开启清理开关；不再要求操作人逐页标记
   * 成员、团长和关联任务。系统会自动纳入一跳关联任务，并将关联账号的账本、提现和统计重置。
   * 它是高危操作，因此必须输入由服务端返回的确认文本。
   */
  private async forcePurgeTestDailyTask(
    taskId: string,
    user: CurrentUserPayload,
    options: { forceAdminPurge?: boolean; confirmForceText?: string } = {},
  ) {
    if (!options.forceAdminPurge) {
      throw new BadRequestException('管理员强制清理未确认');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`daily_task_force_test_purge:${taskId}`}))`;
      const current = await tx.dailyTask.findFirst({
        where: { id: taskId, deletedAt: null, isTestData: true },
        select: { id: true, tenantId: true, title: true, status: true },
      });
      if (!current) throw new ConflictException('测试任务状态已变化，请刷新后重试');
      if (current.status !== 'DISABLED') {
        throw new BadRequestException('测试任务必须处于已停用状态才能清理，请重新标记测试数据');
      }

      const plan = await this.buildForceTestTaskPurgePlan(tx, current.id);
      if (!plan.canAdminForcePurge) {
        throw new BadRequestException(`当前管理员强制清理不可执行：${plan.forceBlockers.join('；')}`);
      }
      if (String(options.confirmForceText || '').trim() !== plan.forceConfirmText) {
        throw new BadRequestException(`强制清理确认文本不匹配，请输入“${plan.forceConfirmText}”`);
      }

      // 强制范围仅锁定当前租户，避免平台管理员误把同名/跨租户关联数据纳入清理。
      const forceTasks = await tx.dailyTask.findMany({
        where: { id: { in: plan.forceScopeTaskIds }, tenantId: current.tenantId, deletedAt: null },
        select: {
          id: true,
          title: true,
          distributionGroupId: true,
          commissionGroupId: true,
          commissionLeaderUserId: true,
        },
      });
      const forceTaskIds = forceTasks.map((item) => item.id);
      if (!forceTaskIds.length) throw new ConflictException('没有可清理的关联任务，请刷新后重试');

      const forceParticipants = await tx.taskParticipant.findMany({
        where: { taskId: { in: forceTaskIds } },
        select: {
          id: true,
          appUserId: true,
          primaryGroupId: true,
          taskOwnerGroupId: true,
          participantGroupId: true,
          leaderCommissionGroupId: true,
        },
      });
      const forceParticipantIds = forceParticipants.map((item) => item.id);

      const settlements = await tx.leaderCommissionSettlement.findMany({
        where: {
          OR: [
            { taskId: { in: forceTaskIds } },
            ...(forceParticipantIds.length ? [{ participantId: { in: forceParticipantIds } }] : []),
          ],
        },
        select: { id: true, leaderUserId: true, workerUserId: true, groupId: true },
      });

      const forceGroupIds = Array.from(
        new Set(
          [
            ...plan.scopeGroupIds,
            ...forceTasks.flatMap((item) => [item.distributionGroupId || '', item.commissionGroupId || '']),
            ...forceParticipants.flatMap((item) => [item.primaryGroupId || '', item.taskOwnerGroupId || '', item.participantGroupId || '', item.leaderCommissionGroupId || '']),
            ...settlements.map((item) => item.groupId || ''),
          ].filter(Boolean),
        ),
      );
      const groups = forceGroupIds.length
        ? await tx.distributionGroup.findMany({
            where: { id: { in: forceGroupIds } },
            select: { id: true, leaderUserId: true },
          })
        : [];
      const forceUserIds = Array.from(
        new Set(
          [
            ...plan.scopeUserIds,
            ...forceTasks.map((item) => item.commissionLeaderUserId || ''),
            ...forceParticipants.map((item) => item.appUserId || ''),
            ...settlements.flatMap((item) => [item.leaderUserId || '', item.workerUserId || '']),
            ...groups.map((item) => item.leaderUserId || ''),
          ].filter(Boolean),
        ),
      );

      if (forceTaskIds.length) {
        await tx.fileUsage.deleteMany({ where: { bizType: 'DAILY_TASK', bizId: { in: forceTaskIds } } });
      }
      if (forceParticipantIds.length) {
        await tx.fileUsage.deleteMany({ where: { bizType: 'TASK_PARTICIPANT', bizId: { in: forceParticipantIds } } });
      }
      if (forceTaskIds.length) {
        await tx.taskAbandonLog.deleteMany({ where: { taskId: { in: forceTaskIds } } });
      }
      if (forceTaskIds.length || forceParticipantIds.length) {
        await tx.leaderCommissionSettlement.deleteMany({
          where: {
            OR: [
              ...(forceTaskIds.length ? [{ taskId: { in: forceTaskIds } }] : []),
              ...(forceParticipantIds.length ? [{ participantId: { in: forceParticipantIds } }] : []),
            ],
          },
        });
      }

      // 提现和人工调账没有可靠的任务外键。管理员强制清理明确表示：这些账号均为专用测试账号，
      // 因而直接清空完整账本、提现记录并把账号财务统计归零，而不是要求人工逐笔定位。
      if (forceUserIds.length) {
        await tx.appUserWalletLedger.deleteMany({ where: { appUserId: { in: forceUserIds } } });
        await tx.appUserWithdrawal.deleteMany({ where: { appUserId: { in: forceUserIds } } });
      }
      await tx.dailyTask.deleteMany({ where: { id: { in: forceTaskIds } } });
      if (forceUserIds.length) {
        await tx.appUser.updateMany({
          where: { id: { in: forceUserIds } },
          data: {
            balanceAmount: 0,
            totalSettledAmount: 0,
            totalCompletedOrders: 0,
            withdrawnAmount: 0,
          },
        });
      }

      await tx.operationLog.create({
        data: {
          operatorId: user.id,
          tenantId: current.tenantId,
          module: 'DAILY_TASK',
          action: 'ADMIN_FORCE_PURGE_TEST_DATA',
          bizId: current.id,
          description: `管理员强制清理测试任务“${current.title}”及关联测试范围`,
          beforeData: {
            selectedTaskId: current.id,
            forceTaskIds,
            forceParticipantCount: forceParticipantIds.length,
            forceUserIds,
            walletLedgerCount: plan.walletLedgerCount,
            withdrawalCount: plan.withdrawalCount,
          },
          afterData: {
            cleanedAt: new Date().toISOString(),
            deletedTaskCount: forceTaskIds.length,
            deletedParticipantCount: forceParticipantIds.length,
            resetTestAccountCount: forceUserIds.length,
          },
        },
      });

      return {
        success: true,
        mode: 'ADMIN_FORCE_TEST_PURGE',
        deletedTaskCount: forceTaskIds.length,
        deletedParticipantCount: forceParticipantIds.length,
        deletedCommissionSettlementCount: settlements.length,
        deletedWalletLedgerCount: plan.walletLedgerCount,
        deletedWithdrawalCount: plan.withdrawalCount,
        resetTestAccountCount: forceUserIds.length,
      };
    }, {
      maxWait: 5_000,
      timeout: 45_000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  private async buildForceTestTaskPurgePlan(
    db: Prisma.TransactionClient | PrismaService,
    taskId: string,
    options: { allowExternalWithdrawalPurge?: boolean } = {},
  ) {
    const purgeEnabled = this.isDistributionTestDataPurgeEnabled();
    const blockers: string[] = [];
    const current = await db.dailyTask.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        id: true,
        title: true,
        tenantId: true,
        status: true,
        isTestData: true,
        distributionGroupId: true,
        commissionGroupId: true,
        commissionLeaderUserId: true,
      },
    });
    if (!current) throw new NotFoundException('每日任务不存在或已删除');
    if (!current.isTestData) blockers.push('当前任务未标记为测试数据');
    if (current.status !== 'DISABLED') blockers.push('当前测试任务尚未停用');
    if (!purgeEnabled) blockers.push('服务端未开启 ALLOW_TEST_DATA_PURGE=true');

    const taskIdSet = new Set<string>([current.id]);
    const userIdSet = new Set<string>([current.commissionLeaderUserId || ''].filter(Boolean));
    const groupIdSet = new Set<string>([current.distributionGroupId || '', current.commissionGroupId || ''].filter(Boolean));
    let iteration = 0;
    let expanded = true;

    while (expanded && iteration < 12) {
      expanded = false;
      iteration += 1;
      const taskIds = Array.from(taskIdSet);
      const userIds = Array.from(userIdSet);
      const groupIds = Array.from(groupIdSet);
      if (taskIds.length > 300 || userIds.length > 200 || groupIds.length > 200) {
        blockers.push('测试范围关联数据过大，请拆分测试账号或任务后再清理');
        break;
      }

      const candidateTasks = await db.dailyTask.findMany({
        where: {
          deletedAt: null,
          isTestData: true,
          OR: [
            { id: { in: taskIds } },
            ...(userIds.length
              ? [
                  { commissionLeaderUserId: { in: userIds } },
                  { participants: { some: { appUserId: { in: userIds } } } },
                ]
              : []),
            ...(groupIds.length
              ? [
                  { distributionGroupId: { in: groupIds } },
                  { commissionGroupId: { in: groupIds } },
                ]
              : []),
          ],
        },
        select: {
          id: true,
          title: true,
          distributionGroupId: true,
          commissionGroupId: true,
          commissionLeaderUserId: true,
        },
      });
      for (const task of candidateTasks) {
        if (!taskIdSet.has(task.id)) {
          taskIdSet.add(task.id);
          expanded = true;
        }
        for (const value of [task.distributionGroupId, task.commissionGroupId]) {
          if (value && !groupIdSet.has(value)) {
            groupIdSet.add(value);
            expanded = true;
          }
        }
        if (task.commissionLeaderUserId && !userIdSet.has(task.commissionLeaderUserId)) {
          userIdSet.add(task.commissionLeaderUserId);
          expanded = true;
        }
      }

      const participants = taskIdSet.size
        ? await db.taskParticipant.findMany({
            where: { taskId: { in: Array.from(taskIdSet) } },
            select: {
              id: true,
              appUserId: true,
              primaryGroupId: true,
              taskOwnerGroupId: true,
              participantGroupId: true,
              leaderCommissionGroupId: true,
            },
          })
        : [];
      for (const participant of participants) {
        if (participant.appUserId && !userIdSet.has(participant.appUserId)) {
          userIdSet.add(participant.appUserId);
          expanded = true;
        }
        for (const value of [participant.primaryGroupId, participant.taskOwnerGroupId, participant.participantGroupId, participant.leaderCommissionGroupId]) {
          if (value && !groupIdSet.has(value)) {
            groupIdSet.add(value);
            expanded = true;
          }
        }
      }

      const settlements = taskIdSet.size
        ? await db.leaderCommissionSettlement.findMany({
            where: { taskId: { in: Array.from(taskIdSet) } },
            select: { leaderUserId: true, workerUserId: true, groupId: true },
          })
        : [];
      for (const settlement of settlements) {
        for (const value of [settlement.leaderUserId, settlement.workerUserId]) {
          if (value && !userIdSet.has(value)) {
            userIdSet.add(value);
            expanded = true;
          }
        }
        if (settlement.groupId && !groupIdSet.has(settlement.groupId)) {
          groupIdSet.add(settlement.groupId);
          expanded = true;
        }
      }

      if (groupIdSet.size) {
        const groups = await db.distributionGroup.findMany({
          where: { id: { in: Array.from(groupIdSet) } },
          select: { id: true, leaderUserId: true },
        });
        for (const group of groups) {
          if (group.leaderUserId && !userIdSet.has(group.leaderUserId)) {
            userIdSet.add(group.leaderUserId);
            expanded = true;
          }
        }
      }
    }

    if (iteration >= 12 && expanded) blockers.push('测试范围关联层级过深，请拆分后再清理');

    const scopeTaskIds = Array.from(taskIdSet);
    const scopeUserIds = Array.from(userIdSet);
    const scopeGroupIds = Array.from(groupIdSet);
    const [scopeTasks, scopeParticipants, scopeSettlements, scopeGroups, scopeUsers, scopeLedgers, scopeWithdrawals] = await Promise.all([
      db.dailyTask.findMany({
        where: { id: { in: scopeTaskIds }, deletedAt: null, isTestData: true },
        select: { id: true, title: true, status: true, distributionGroupId: true, commissionGroupId: true },
      }),
      scopeTaskIds.length
        ? db.taskParticipant.findMany({
            where: { taskId: { in: scopeTaskIds } },
            select: { id: true, appUserId: true },
          })
        : Promise.resolve([]),
      scopeTaskIds.length
        ? db.leaderCommissionSettlement.findMany({
            where: { taskId: { in: scopeTaskIds } },
            select: { id: true, participantId: true, leaderUserId: true, workerUserId: true, groupId: true },
          })
        : Promise.resolve([]),
      scopeGroupIds.length
        ? db.distributionGroup.findMany({
            where: { id: { in: scopeGroupIds } },
            select: { id: true, name: true, isTestData: true, leaderUserId: true, status: true },
          })
        : Promise.resolve([]),
      scopeUserIds.length
        ? db.appUser.findMany({
            where: { id: { in: scopeUserIds }, deletedAt: null },
            select: { id: true, nickname: true, phone: true, isTestData: true },
          })
        : Promise.resolve([]),
      scopeUserIds.length
        ? db.appUserWalletLedger.findMany({
            where: { appUserId: { in: scopeUserIds } },
            select: { id: true, appUserId: true, type: true, amount: true },
          })
        : Promise.resolve([]),
      scopeUserIds.length
        ? db.appUserWithdrawal.findMany({
            where: { appUserId: { in: scopeUserIds } },
            select: { id: true, appUserId: true, status: true, transferMode: true, outBillNo: true, tradeNo: true, transferBillNo: true },
          })
        : Promise.resolve([]),
    ]);

    const actualScopeTaskIds = scopeTasks.map((item) => item.id);
    const scopeParticipantIds = scopeParticipants.map((item) => item.id);
    const leaderUserIdSet = new Set(
      scopeGroups.map((group) => String(group.leaderUserId || '').trim()).filter(Boolean),
    );
    const formatAccount = (item: { id: string; nickname: string | null; phone: string | null; isTestData: boolean }) => ({
      id: item.id,
      label: item.nickname || item.phone || item.id,
      isTestData: item.isTestData,
    });
    const memberAccounts = scopeUsers.filter((item) => !leaderUserIdSet.has(item.id));
    const leaderAccounts = scopeUsers.filter((item) => leaderUserIdSet.has(item.id));
    const missingTestMemberAccounts = memberAccounts.filter((item) => !item.isTestData).map(formatAccount);
    const missingTestGroups = scopeGroups
      .filter((group) => !group.isTestData)
      .map((group) => ({ id: group.id, label: group.name || group.id, status: group.status, isTestData: false }));
    if (missingTestMemberAccounts.length) {
      blockers.push(`存在 ${missingTestMemberAccounts.length} 个未标记为测试账号的关联 H5 成员`);
    }
    if (missingTestGroups.length) {
      blockers.push(`存在 ${missingTestGroups.length} 个未标记为测试团长的关联团队`);
    }

    const nonTestTasks = scopeUserIds.length || scopeGroupIds.length
      ? await db.dailyTask.findMany({
          where: {
            deletedAt: null,
            isTestData: false,
            OR: [
              ...(scopeUserIds.length
                ? [
                    { commissionLeaderUserId: { in: scopeUserIds } },
                    { participants: { some: { appUserId: { in: scopeUserIds } } } },
                  ]
                : []),
              ...(scopeGroupIds.length
                ? [
                    { distributionGroupId: { in: scopeGroupIds } },
                    { commissionGroupId: { in: scopeGroupIds } },
                  ]
                : []),
            ],
          },
          select: { id: true, title: true, status: true, distributionGroupId: true, commissionGroupId: true },
          orderBy: { createdAt: 'desc' },
          take: 100,
        })
      : [];
    if (nonTestTasks.length) blockers.push(`测试账号或团长仍关联 ${nonTestTasks.length} 个未标记为测试的任务`);

    const unsafeExternalWithdrawals = scopeWithdrawals.filter((item) => {
      const mode = String(item.transferMode || '').toUpperCase();
      const status = String(item.status || '').toUpperCase();
      const finalNoPayment = ['REJECTED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(status);
      if (mode === 'MOCK' || finalNoPayment) return false;
      const pendingWithoutExternalReference = status === 'PENDING' && !item.outBillNo && !item.tradeNo && !item.transferBillNo;
      return !pendingWithoutExternalReference;
    });
    const externalWithdrawalOverrideText = `确认清理${unsafeExternalWithdrawals.length}笔外部提现测试记录`;
    const canPurgeWithExternalWithdrawalOverride = blockers.length === 0;
    if (unsafeExternalWithdrawals.length && !options.allowExternalWithdrawalPurge) {
      blockers.push(`存在 ${unsafeExternalWithdrawals.length} 笔已进入外部付款流程或已打款的提现，需在预演中明确确认后才能一并清理`);
    }

    const manualAdjustmentCount = scopeLedgers.filter((item) => String(item.type || '').toUpperCase() === 'ADJUST').length;
    const testAccounts = scopeUsers.map(formatAccount);
    const taskTitles = scopeTasks.slice(0, 20).map((item) => item.title);

    // 管理员强制清理不再要求先手工标记所有成员、团长和关联任务；
    // 它自动纳入当前已识别的测试任务与一跳关联的普通任务，并以服务端确认文本作为最后防线。
    const forceScopeTaskIds = Array.from(new Set([...actualScopeTaskIds, ...nonTestTasks.map((item) => item.id)]));
    // 为管理员强制清理单独计算一次最终范围；这里不再复用“安全清理”的旧统计，避免预览数量和实际删除数量不一致。
    const forceScopeTasks = forceScopeTaskIds.length
      ? await db.dailyTask.findMany({
          where: { id: { in: forceScopeTaskIds }, tenantId: current.tenantId, deletedAt: null },
          select: { id: true, title: true, status: true, isTestData: true, distributionGroupId: true, commissionGroupId: true, commissionLeaderUserId: true },
        })
      : [];
    const forceActualTaskIds = forceScopeTasks.map((item) => item.id);
    const forceParticipants = forceActualTaskIds.length
      ? await db.taskParticipant.findMany({
          where: { taskId: { in: forceActualTaskIds } },
          select: { id: true, appUserId: true, primaryGroupId: true, taskOwnerGroupId: true, participantGroupId: true, leaderCommissionGroupId: true },
        })
      : [];
    const forceParticipantIds = forceParticipants.map((item) => item.id);
    const forceSettlements = forceActualTaskIds.length
      ? await db.leaderCommissionSettlement.findMany({
          where: {
            OR: [
              { taskId: { in: forceActualTaskIds } },
              ...(forceParticipantIds.length ? [{ participantId: { in: forceParticipantIds } }] : []),
            ],
          },
          select: { id: true, leaderUserId: true, workerUserId: true, groupId: true },
        })
      : [];
    const forceGroupIds = Array.from(
      new Set(
        [
          ...scopeGroupIds,
          ...forceScopeTasks.flatMap((item) => [item.distributionGroupId || '', item.commissionGroupId || '']),
          ...forceParticipants.flatMap((item) => [item.primaryGroupId || '', item.taskOwnerGroupId || '', item.participantGroupId || '', item.leaderCommissionGroupId || '']),
          ...forceSettlements.map((item) => item.groupId || ''),
        ].filter(Boolean),
      ),
    );
    const forceGroups = forceGroupIds.length
      ? await db.distributionGroup.findMany({ where: { id: { in: forceGroupIds } }, select: { id: true, leaderUserId: true } })
      : [];
    const forceUserIds = Array.from(
      new Set(
        [
          ...scopeUserIds,
          ...forceScopeTasks.map((item) => item.commissionLeaderUserId || ''),
          ...forceParticipants.map((item) => item.appUserId || ''),
          ...forceSettlements.flatMap((item) => [item.leaderUserId || '', item.workerUserId || '']),
          ...forceGroups.map((item) => item.leaderUserId || ''),
        ].filter(Boolean),
      ),
    );
    const [forceUsers, forceWalletLedgerCount, forceWithdrawalCount, forceManualAdjustmentCount] = forceUserIds.length
      ? await Promise.all([
          db.appUser.findMany({ where: { id: { in: forceUserIds }, deletedAt: null }, select: { id: true, nickname: true, phone: true, isTestData: true } }),
          db.appUserWalletLedger.count({ where: { appUserId: { in: forceUserIds } } }),
          db.appUserWithdrawal.count({ where: { appUserId: { in: forceUserIds } } }),
          db.appUserWalletLedger.count({ where: { appUserId: { in: forceUserIds }, type: 'ADJUST' } }),
        ])
      : [[], 0, 0, 0];

    const forceBlockers: string[] = [];
    if (!current.isTestData) forceBlockers.push('当前任务未标记为测试数据');
    if (current.status !== 'DISABLED') forceBlockers.push('当前测试任务尚未停用');
    if (!purgeEnabled) forceBlockers.push('服务端未开启 ALLOW_TEST_DATA_PURGE=true');
    if (taskIdSet.size > 300 || userIdSet.size > 200 || groupIdSet.size > 200 || (iteration >= 12 && expanded)) {
      forceBlockers.push('关联范围过大或层级过深，不能自动强制清理');
    }
    if (forceActualTaskIds.length > 100 || forceUserIds.length > 100 || forceParticipantIds.length > 2_000) {
      forceBlockers.push('自动纳入的任务、账号或订单数量过大，不能一次强制清理');
    }
    const canAdminForcePurge = forceBlockers.length === 0;
    const forceConfirmText = `确认强制清理${forceActualTaskIds.length}个任务及${forceUserIds.length}个账号的测试数据`;

    return {
      selectedTaskId: current.id,
      selectedTaskTitle: current.title,
      purgeEnabled,
      forceScopeTaskIds: forceActualTaskIds,
      forceScopeTaskCount: forceActualTaskIds.length,
      forceScopeTasks: forceScopeTasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        isTestData: task.isTestData,
        distributionGroupId: task.distributionGroupId,
        commissionGroupId: task.commissionGroupId,
      })),
      forceParticipantCount: forceParticipantIds.length,
      forceUserIds,
      forceUserCount: forceUserIds.length,
      forceAccounts: forceUsers.map(formatAccount),
      forceCommissionSettlementCount: forceSettlements.length,
      forceWalletLedgerCount,
      forceWithdrawalCount,
      forceManualAdjustmentCount,
      forceConfirmText,
      forceBlockers,
      canAdminForcePurge,
      scopeTaskIds: actualScopeTaskIds,
      scopeParticipantIds,
      scopeUserIds,
      scopeGroupIds,
      scopeTaskCount: actualScopeTaskIds.length,
      participantCount: scopeParticipantIds.length,
      testAccountCount: scopeUserIds.length,
      memberAccountCount: memberAccounts.length,
      leaderAccountCount: leaderAccounts.length,
      testAccounts,
      memberAccounts: memberAccounts.map(formatAccount),
      leaderAccounts: leaderAccounts.map(formatAccount),
      missingTestMemberAccounts,
      scopeGroups: scopeGroups.map((group) => ({ id: group.id, label: group.name || group.id, status: group.status, isTestData: group.isTestData })),
      missingTestGroups,
      taskTitles,
      scopeTasks: scopeTasks.map((task) => ({ id: task.id, title: task.title, status: task.status })),
      nonTestTasks: nonTestTasks.map((task) => ({ id: task.id, title: task.title, status: task.status, distributionGroupId: task.distributionGroupId, commissionGroupId: task.commissionGroupId })),
      commissionSettlementCount: scopeSettlements.length,
      walletLedgerCount: scopeLedgers.length,
      withdrawalCount: scopeWithdrawals.length,
      manualAdjustmentCount,
      externalWithdrawalBlockCount: unsafeExternalWithdrawals.length,
      externalWithdrawals: unsafeExternalWithdrawals.map((item) => ({
        id: item.id,
        appUserId: item.appUserId,
        status: item.status,
        transferMode: item.transferMode,
        outBillNo: item.outBillNo,
      })),
      externalWithdrawalOverrideText: unsafeExternalWithdrawals.length ? externalWithdrawalOverrideText : null,
      canPurgeWithExternalWithdrawalOverride,
      nonTestTaskCount: nonTestTasks.length,
      blockers,
      canPurge: blockers.length === 0,
    };
  }

  /**
   * 清理一条已明确标记为测试数据的任务及其整条测试业务链路。
   * 该路径不会按“任务是否领取/是否已完成”阻断；但提现、人工调账或余额不能安全回退时仍会拒绝执行。
   */
  private async purgeTestDailyTask(task: AdminTaskDetail, user: CurrentUserPayload) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`daily_task_test_purge:${task.id}`}))`;
      const current = await tx.dailyTask.findFirst({
        where: { id: task.id, deletedAt: null, isTestData: true },
        select: { id: true, tenantId: true, title: true, status: true, isTestData: true },
      });
      if (!current) throw new ConflictException('任务状态已变化，请刷新后重试');
      if (current.status !== 'DISABLED') {
        throw new BadRequestException('测试任务必须先停用后才能清理，请重新标记测试数据');
      }

      const participants = await tx.taskParticipant.findMany({
        where: { taskId: current.id },
        select: { id: true, appUserId: true, status: true },
      });
      const participantIds = participants.map((item) => item.id);
      const completedCountByUser = new Map<string, number>();
      for (const participant of participants) {
        if (participant.status === 'COMPLETED' && participant.appUserId) {
          completedCountByUser.set(participant.appUserId, (completedCountByUser.get(participant.appUserId) || 0) + 1);
        }
      }

      const [settlements, ledgers] = await Promise.all([
        participantIds.length
          ? tx.leaderCommissionSettlement.findMany({
              where: { participantId: { in: participantIds } },
              select: { id: true, leaderUserId: true, commissionAmount: true },
            })
          : [],
        participantIds.length
          ? tx.appUserWalletLedger.findMany({
              where: { participantId: { in: participantIds } },
              select: { id: true, appUserId: true, type: true, amount: true },
            })
          : [],
      ]);

      const impactedUserIds = Array.from(
        new Set(
          [
            ...participants.map((item) => item.appUserId || ''),
            ...settlements.map((item) => item.leaderUserId),
            ...ledgers.map((item) => item.appUserId),
          ].filter((item): item is string => Boolean(item)),
        ),
      );
      const [impactedUsers, pendingWithdrawalCount, paidWithdrawalCount, manualAdjustmentCount] = impactedUserIds.length
        ? await Promise.all([
            tx.appUser.findMany({
              where: { id: { in: impactedUserIds } },
              select: { id: true, balanceAmount: true, totalSettledAmount: true, totalCompletedOrders: true },
            }),
            tx.appUserWithdrawal.count({
              where: { appUserId: { in: impactedUserIds }, status: { notIn: ['PAID', 'REJECTED', 'FAILED', 'CANCELLED', 'EXPIRED'] } },
            }),
            tx.appUserWithdrawal.count({ where: { appUserId: { in: impactedUserIds }, status: 'PAID' } }),
            tx.appUserWalletLedger.count({ where: { appUserId: { in: impactedUserIds }, type: 'ADJUST' } }),
          ])
        : [[], 0, 0, 0];
      if (pendingWithdrawalCount > 0 || paidWithdrawalCount > 0 || manualAdjustmentCount > 0) {
        throw new BadRequestException('关联账号存在提现或人工调账记录，无法安全回退测试收益；请先人工核对后处理。');
      }

      const userMap = new Map(impactedUsers.map((item) => [item.id, item]));
      const ledgerNetByUser = new Map<string, number>();
      const settledIncomeByUser = new Map<string, number>();
      for (const ledger of ledgers) {
        ledgerNetByUser.set(ledger.appUserId, (ledgerNetByUser.get(ledger.appUserId) || 0) + ledger.amount);
        if (['SETTLEMENT', 'LEADER_COMMISSION'].includes(ledger.type)) {
          settledIncomeByUser.set(ledger.appUserId, (settledIncomeByUser.get(ledger.appUserId) || 0) + ledger.amount);
        }
      }
      for (const [appUserId, netAmount] of ledgerNetByUser) {
        const appUser = userMap.get(appUserId);
        const settledIncome = settledIncomeByUser.get(appUserId) || 0;
        if (!appUser || (netAmount > 0 && appUser.balanceAmount < netAmount) || appUser.totalSettledAmount < settledIncome) {
          throw new BadRequestException('存在已被提现、扣减或不一致的测试收益，无法安全回退任务数据。');
        }
      }
      for (const [appUserId, completedCount] of completedCountByUser) {
        const appUser = userMap.get(appUserId);
        if (!appUser || appUser.totalCompletedOrders < completedCount) {
          throw new BadRequestException('测试订单完成数异常，无法安全回退任务数据。');
        }
      }

      await tx.fileUsage.deleteMany({ where: { bizType: 'DAILY_TASK', bizId: current.id } });
      if (participantIds.length) {
        await tx.fileUsage.deleteMany({ where: { bizType: 'TASK_PARTICIPANT', bizId: { in: participantIds } } });
        await tx.leaderCommissionSettlement.deleteMany({ where: { participantId: { in: participantIds } } });
        await tx.appUserWalletLedger.deleteMany({ where: { id: { in: ledgers.map((item) => item.id) } } });
      }
      await tx.dailyTask.delete({ where: { id: current.id } });

      for (const appUserId of impactedUserIds) {
        const appUser = userMap.get(appUserId);
        if (!appUser) continue;
        const removedNet = ledgerNetByUser.get(appUserId) || 0;
        const removedSettledIncome = settledIncomeByUser.get(appUserId) || 0;
        const completedCount = completedCountByUser.get(appUserId) || 0;
        const remainingLedgers = await tx.appUserWalletLedger.findMany({
          where: { appUserId },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true, amount: true },
        });
        const nextBalance = appUser.balanceAmount - removedNet;
        const nextTotalSettledAmount = appUser.totalSettledAmount - removedSettledIncome;
        const remainingLedgerTotal = remainingLedgers.reduce((sum, item) => sum + item.amount, 0);
        let runningBalance = nextBalance - remainingLedgerTotal;
        await tx.appUser.update({
          where: { id: appUserId },
          data: {
            balanceAmount: nextBalance,
            totalSettledAmount: nextTotalSettledAmount,
            ...(completedCount > 0 ? { totalCompletedOrders: { decrement: completedCount } } : {}),
          },
        });
        for (const ledger of remainingLedgers) {
          runningBalance += ledger.amount;
          await tx.appUserWalletLedger.update({ where: { id: ledger.id }, data: { balanceAfter: runningBalance } });
        }
      }

      await tx.operationLog.create({
        data: {
          operatorId: user.id,
          tenantId: current.tenantId,
          module: 'DAILY_TASK',
          action: 'PURGE_TEST_DATA',
          bizId: current.id,
          description: `清理测试每日任务“${current.title}”及其关联业务数据`,
          beforeData: {
            status: current.status,
            participantCount: participantIds.length,
            commissionSettlementCount: settlements.length,
            walletLedgerCount: ledgers.length,
          },
          afterData: { taskDeleted: true, affectedUserCount: impactedUserIds.length },
        },
      });
      return {
        success: true,
        mode: 'TEST_PURGE',
        deletedTaskId: current.id,
        deletedParticipantCount: participantIds.length,
        deletedCommissionSettlementCount: settlements.length,
        deletedWalletLedgerCount: ledgers.length,
        affectedUserCount: impactedUserIds.length,
      };
    }, { maxWait: 5_000, timeout: 30_000 });
  }

  async dispatch(id: string, user: CurrentUserPayload) {
    const task = await this.findAdminTaskByIdentifier(id, user);
    if (!['DRAFT', 'READY'].includes(task.status)) {
      throw new BadRequestException('只有草稿或就绪状态的任务才允许发推流');
    }

    const availableCount = await this.prisma.taskComment.count({ where: { taskId: task.id, status: { in: ['AVAILABLE', 'CLAIMED', 'COMPLETED'] } } });
    if (availableCount < task.targetCommentCount) {
      throw new BadRequestException('评论数量不能小于目标评论数');
    }
    if (task.mediaAccount.status !== 'ENABLED') {
      throw new BadRequestException('媒体账号已停用');
    }

    await this.prisma.$transaction([
      this.prisma.taskDispatch.create({ data: { taskId: task.id, operatorId: user.id, status: 'SUCCESS', message: '任务已发布，已进入 H5 可领取任务池。' } }),
      this.prisma.dailyTask.update({ where: { id: task.id }, data: { status: 'DISPATCHED', dispatchedAt: new Date() } }),
    ]);
    await this.notifyServiceAccountTaskCreated(task).catch(async (error) => {
      await this.prisma.taskDispatch.create({
        data: {
          taskId: task.id,
          operatorId: user.id,
          status: 'FAILED',
          message: `服务号通知发送失败：${String(error?.message || error).slice(0, 500)}`,
        },
      });
    });
    return this.detail(task.id, user);
  }


  /**
   * Pause blocks new claims only. Existing claimed work remains valid.
   */
  async pause(id: string, user: CurrentUserPayload) {
    const task = await this.findAdminTaskByIdentifier(id, user);
    if (!['READY', 'DISPATCHED', 'RUNNING'].includes(String(task.status || ''))) {
      throw new BadRequestException('Only ready, dispatched, or running tasks can be paused');
    }
    await this.prisma.dailyTask.update({ where: { id: task.id }, data: { status: 'PAUSED' } });
    return this.detail(task.id, user);
  }

  /**
   * Resume restores the task and recalculates counters without changing history.
   */
  async resume(id: string, user: CurrentUserPayload) {
    const task = await this.findAdminTaskByIdentifier(id, user);
    if (String(task.status || '') !== 'PAUSED') {
      throw new BadRequestException('Only paused tasks can be resumed');
    }
    await this.prisma.dailyTask.update({ where: { id: task.id }, data: { status: 'READY' } });
    await this.recalculateTaskCounters(task.id);
    return this.detail(task.id, user);
  }

  /**
   * Close blocks new claims while preserving existing order history.
   */
  async close(id: string, user: CurrentUserPayload) {
    const task = await this.findAdminTaskByIdentifier(id, user);
    if (['CANCELLED', 'DISABLED', 'ARCHIVED'].includes(String(task.status || ''))) {
      throw new BadRequestException('The current task state cannot be closed');
    }
    if (String(task.status || '') === 'CLOSED') {
      return this.detail(task.id, user);
    }
    await this.prisma.dailyTask.update({ where: { id: task.id }, data: { status: 'CLOSED' } });
    return this.detail(task.id, user);
  }

  /**
   * Archive hides a finished task without deleting orders, ledgers, or history.
   */
  async archive(id: string, user: CurrentUserPayload) {
    const task = await this.findAdminTaskByIdentifier(id, user);
    if (!['CLOSED', 'COMPLETED', 'DISABLED', 'CANCELLED'].includes(String(task.status || ''))) {
      throw new BadRequestException('Close or finish the task before archiving it');
    }
    await this.prisma.dailyTask.update({ where: { id: task.id }, data: { status: 'ARCHIVED' } });
    return this.detail(task.id, user);
  }
  private async notifyServiceAccountTaskCreated(task: AdminTaskDetail) {
    const templateId = String(process.env.WECHAT_MP_TASK_TEMPLATE_ID || '').trim();
    const h5Url = String(process.env.TASK_DISTRIBUTION_H5_URL || process.env.APP_H5_URL || '').trim();
    if (!templateId || !h5Url) return;
    const users = await this.prisma.appUser.findMany({
      where: {
        deletedAt: null,
        status: 'ENABLED',
        serviceOpenid: { not: null },
      },
      select: { serviceOpenid: true },
      take: Number(process.env.WECHAT_MP_TASK_NOTIFY_LIMIT || 200),
    });
    for (const user of users) {
      const openid = String(user.serviceOpenid || '').trim();
      if (!openid) continue;
      await this.wechatService.sendOfficialAccountTemplateMessage({
        openid,
        templateId,
        url: h5Url,
        data: {
          first: { value: '有新的任务可以领取。' },
          keyword1: { value: task.title || '任务分发' },
          keyword2: { value: this.formatCentAmount(task.rewardAmount) },
          keyword3: { value: `${task.targetCommentCount || 0} 条` },
          remark: { value: '点击进入任务页面，登录后即可领取。' },
        },
      });
    }
  }

  private formatCentAmount(amount?: number | null) {
    const value = typeof amount === 'number' && Number.isFinite(amount) ? amount / 100 : 0;
    return `¥${value.toFixed(2)}`;
  }

  async progress(id: string, user: CurrentUserPayload) {
    const task = await this.findAdminTaskByIdentifier(id, user);
    const postId = await this.ensureNumericPostId(task);
    const grouped = await this.prisma.taskComment.groupBy({
      by: ['status'],
      where: { taskId: task.id },
      _count: { id: true },
    });
    const statusCounts = grouped.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count.id;
      return acc;
    }, {});
    const total = await this.prisma.taskComment.count({ where: { taskId: task.id } });
    const claimed = (statusCounts.CLAIMED ?? 0) + (statusCounts.COMPLETED ?? 0);
    const completed = statusCounts.COMPLETED ?? 0;
    const details = await this.prisma.taskComment.findMany({
      where: { taskId: task.id, status: { in: ['CLAIMED', 'COMPLETED'] } },
      include: {
        assignee: { select: { id: true, displayName: true, username: true } },
        participant: {
          select: {
            id: true,
            visitorName: true,
            phone: true,
            visitorToken: true,
            uploadedImageUrl: true,
            settlementStatus: true,
            status: true,
            claimedAt: true,
            completedAt: true,
            settledAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      id: task.id,
      taskId: task.id,
      postId,
      targetCommentCount: task.targetCommentCount,
      totalCommentCount: total,
      claimedCommentCount: claimed,
      completedCommentCount: completed,
      completionRate: task.targetCommentCount ? Number(((completed / task.targetCommentCount) * 100).toFixed(2)) : 0,
      statusCounts,
      details,
    };
  }

  async listOrders(taskId: string, query: TaskOrderQueryDto, user: CurrentUserPayload) {
    const task = await this.findAdminTaskByIdentifier(taskId, user);
    const { skip, take, page, pageSize } = getPagination(query);
    const optimizedMedia = query.mediaMode === 'optimized';
    const where: Prisma.TaskParticipantWhereInput = {
      taskId: task.id,
      ...(query.status ? { status: query.status } : {}),
      ...(query.settlementStatus ? { settlementStatus: query.settlementStatus } : {}),
      ...(query.hasProof
        ? {
            OR: [{ uploadedImageFileId: { not: null } }, { uploadedImageUrl: { not: null } }],
          }
        : {}),
      ...(query.phone ? { phone: { contains: query.phone, mode: 'insensitive' } } : {}),
      ...(query.visitorName ? { visitorName: { contains: query.visitorName, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.taskParticipant.findMany({
        where,
        skip,
        take,
        orderBy: [{ updatedAt: 'desc' }],
        include: {
          comments: {
            where: { status: { in: ['CLAIMED', 'COMPLETED'] } },
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
            take: 1,
            select: {
              id: true,
              content: true,
              status: true,
              assignedAt: true,
              completedAt: true,
            },
          },
          settledBy: { select: { id: true, username: true, displayName: true } },
          appUser: { select: { id: true, phone: true, nickname: true, status: true, bannedUntil: true, banReason: true, balanceAmount: true } },
        },
      }),
      this.prisma.taskParticipant.count({ where }),
    ]);

    const proofFilesMap = await this.listParticipantProofFilesMap(items.map((participant) => participant.id));
    // 一部分历史订单只写了 uploadedImageFileId，未留下 FileUsage；补齐该类文件，避免 optimized 模式遗漏旧凭证。
    const directProofFiles = await this.findActiveFilesByIds(items.map((participant) => participant.uploadedImageFileId));
    const directProofFilesById = new Map(directProofFiles.map((file) => [file.id, file]));
    for (const participant of items) {
      const existingFiles = proofFilesMap.get(participant.id) ?? [];
      if (existingFiles.length || !participant.uploadedImageFileId) continue;
      const directFile = directProofFilesById.get(participant.uploadedImageFileId);
      if (directFile) proofFilesMap.set(participant.id, [directFile]);
    }

    const settlementFiles = await this.findActiveFilesByIds(items.map((participant) => participant.settlementProofFileId));
    const settlementFilesById = new Map(settlementFiles.map((file) => [file.id, file]));
    // 批量读取“任务账号 + 当前任务平台”的主页识别候选，避免订单列表出现 N+1 查询。
    const taskAccountIds = Array.from(new Set(items.map((participant) => String(participant.taskAccountId || '').trim()).filter(Boolean)));
    const homepageRecognitions = taskAccountIds.length
      ? await this.prisma.distributionTaskAccountHomepageRecognition.findMany({
          where: { taskAccountId: { in: taskAccountIds }, expectedPlatform: task.platform },
          select: {
            taskAccountId: true,
            expectedPlatform: true,
            detectedPlatform: true,
            platformConfidence: true,
            nicknameCandidate: true,
            accountIdCandidate: true,
            ocrStatus: true,
            ocrError: true,
            ocrRequestedAt: true,
            ocrCompletedAt: true,
          },
        })
      : [];
    const homepageRecognitionByTaskAccountId = new Map(homepageRecognitions.map((item) => [item.taskAccountId, item]));
    const proofImageUrlsMap = optimizedMedia
      ? this.emptyProofUrlMap(items.map((participant) => participant.id))
      : await this.resolveProofUrlsMap(proofFilesMap);
    const settlementProofUrlsById = optimizedMedia
      ? new Map<string, string | null>()
      : await this.resolveFileUrlsById(settlementFiles);

    return {
      items: items.map((participant) => {
        const proofFiles = proofFilesMap.get(participant.id) ?? [];
        const proofImageUrls = proofImageUrlsMap.get(participant.id) ?? [];
        const settlementFile = participant.settlementProofFileId
          ? settlementFilesById.get(participant.settlementProofFileId) ?? null
          : null;
        const settlementProofUrl = settlementFile
          ? settlementProofUrlsById.get(settlementFile.id) ?? null
          : participant.settlementProofUrl;
        const legacyProofUrls = optimizedMedia && !proofFiles.length
          ? this.toLegacyMediaUrls(participant.uploadedImageUrl)
          : [];
        const legacySettlementProofUrl = optimizedMedia && !settlementFile
          ? this.toLegacyMediaUrl(participant.settlementProofUrl)
          : null;

        return {
          ...participant,
          // Keep historical fields intact for default requests. Optimized callers opt in to descriptor-only media access.
          uploadedImageUrl: optimizedMedia
            ? []
            : proofImageUrls.length
              ? proofImageUrls
              : participant.uploadedImageUrl
                ? [participant.uploadedImageUrl]
                : [],
          proofImageUrls,
          settlementProofUrl: optimizedMedia ? null : settlementProofUrl,
          proofImages: proofFiles.map((file) => this.toOrderMediaDescriptor(file)),
          legacyProofUrls,
          settlementProof: settlementFile ? this.toOrderMediaDescriptor(settlementFile) : null,
          legacySettlementProofUrl,
          homepageRecognition: this.toDistributionHomepageRecognitionSummary(
            participant.taskAccountId ? homepageRecognitionByTaskAccountId.get(participant.taskAccountId) : null,
          ),
          latestComment: participant.comments[0] ?? null,
          taskRewardAmount: task.rewardAmount ?? 0,
          appUser: (participant as any).appUser
            ? {
                ...(participant as any).appUser,
                ...this.resolveAppUserStatus((participant as any).appUser),
              }
            : null,
        };
      }),
      page,
      pageSize,
      total,
    };
  }

  /**
   * 管理端显式重跑主页 OCR。
   * 仅允许重跑订单所属任务账号在当前任务平台的既有主页截图，避免用其他账号或其他平台的图片串数据。
   */
  async retryOrderHomepageRecognition(taskId: string, participantId: string, user: CurrentUserPayload) {
    const task = await this.findAdminTaskByIdentifier(taskId, user);
    const participant = await this.prisma.taskParticipant.findFirst({
      where: { id: participantId, taskId: task.id },
      select: { id: true, taskAccountId: true },
    });
    if (!participant) {
      throw new NotFoundException('任务参与记录不存在');
    }
    if (!participant.taskAccountId) {
      throw new BadRequestException('当前订单未绑定手机号任务账号，无法重新识别主页截图');
    }

    const recognition = await this.prisma.distributionTaskAccountHomepageRecognition.findUnique({
      where: {
        taskAccountId_expectedPlatform: {
          taskAccountId: participant.taskAccountId,
          expectedPlatform: task.platform,
        },
      },
    });
    if (!recognition?.homepageProofFileId) {
      throw new BadRequestException('当前订单未绑定可重新识别的主页截图');
    }

    const queued = await this.distributionHomepageOcrService.requeue(recognition.id);
    return this.toDistributionHomepageRecognitionSummary(queued ?? recognition);
  }

  async getOrderFileAccess(
    taskId: string,
    participantId: string,
    fileId: string,
    variant: 'thumbnail' | 'original' | undefined,
    user: CurrentUserPayload,
    request?: Request,
  ) {
    const task = await this.findAdminTaskByIdentifier(taskId, user);
    const participant = await this.prisma.taskParticipant.findFirst({
      where: { id: participantId, taskId: task.id },
      select: { id: true, uploadedImageFileId: true, settlementProofFileId: true },
    });
    if (!participant) {
      throw new NotFoundException('任务参与记录不存在');
    }

    const isDirectParticipantFile =
      participant.uploadedImageFileId === fileId || participant.settlementProofFileId === fileId;

    const file = isDirectParticipantFile
      ? await this.prisma.uploadFile.findFirst({
          where: { id: fileId, status: { not: 'DELETED' } },
          select: {
            id: true,
            storageDriver: true,
            bucket: true,
            objectKey: true,
            thumbnailObjectKey: true,
            url: true,
            status: true,
          },
        })
      : (
          await this.prisma.fileUsage.findFirst({
            where: {
              fileId,
              bizType: 'TASK_PARTICIPANT',
              bizId: participant.id,
              fieldName: { in: ['confirmProof', 'settlementProof'] },
            },
            select: {
              file: {
                select: {
                  id: true,
                  storageDriver: true,
                  bucket: true,
                  objectKey: true,
                  thumbnailObjectKey: true,
                  url: true,
                  status: true,
                },
              },
            },
          })
        )?.file;

    if (!file || file.status === 'DELETED') {
      throw new NotFoundException('订单中未找到该凭证文件');
    }

    const access = await this.filesService.getReadAccess(file, variant ?? 'original');
    const url = this.filesService.makeFullUrl(access.url, request);
    return {
      fileId: file.id,
      url,
      fullUrl: url,
      variant: access.variant,
      expiresAt: access.expiresAt,
      fallbackToOriginal: access.fallbackToOriginal,
    };
  }

  async cleanupInvalidOrders(taskId: string, user: CurrentUserPayload) {
    const task = await this.findAdminTaskByIdentifier(taskId, user);
    const invalidWhere: Prisma.TaskParticipantWhereInput = {
      taskId: task.id,
      status: 'STARTED',
      settlementStatus: 'UNSETTLED',
      claimedAt: null,
      completedAt: null,
      settledAt: null,
      settledById: null,
      uploadedImageFileId: null,
      uploadedImageUrl: null,
      settlementAmount: null,
      settlementOrderNo: null,
      settlementProofFileId: null,
      settlementProofUrl: null,
      comments: { none: {} },
    };

    const invalidParticipants = await this.prisma.taskParticipant.findMany({
      where: invalidWhere,
      select: { id: true },
    });
    const participantIds = invalidParticipants.map((participant) => participant.id);

    if (!participantIds.length) {
      return {
        deletedCount: 0,
        message: '没有可清理的无效进行中订单',
      };
    }

    const deletedCount = await this.prisma.$transaction(async (tx) => {
      await tx.fileUsage.deleteMany({
        where: {
          bizType: 'TASK_PARTICIPANT',
          bizId: { in: participantIds },
        },
      });
      const deleted = await tx.taskParticipant.deleteMany({
        where: { id: { in: participantIds } },
      });
      return deleted.count;
    });

    return {
      deletedCount,
      message: `已清理 ${deletedCount} 条无效进行中订单`,
    };
  }

  async resetActiveOrder(taskId: string, participantId: string, user: CurrentUserPayload) {
    const task = await this.findAdminTaskByIdentifier(taskId, user);
    const participant = await this.prisma.taskParticipant.findFirst({
      where: { id: participantId, taskId: task.id },
      select: {
        id: true,
        status: true,
        settlementStatus: true,
        appUserId: true,
        taskAccountId: true,
        taskAccountPhone: true,
        visitorName: true,
      },
    });
    if (!participant) {
      throw new NotFoundException('任务参与记录不存在');
    }
    if (!['STARTED', 'CLAIMED'].includes(participant.status)) {
      throw new BadRequestException('只有进行中或已领取的订单才能重置状态');
    }
    if (participant.settlementStatus === 'SETTLED') {
      throw new BadRequestException('已结算的订单不能重置状态');
    }

    const now = new Date();
    const resetReason = '管理员在 PC 重置任务状态';
    const releasedCommentCount = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.taskParticipant.updateMany({
        where: {
          id: participant.id,
          taskId: task.id,
          status: { in: ['STARTED', 'CLAIMED'] },
          settlementStatus: { not: 'SETTLED' },
        },
        data: {
          status: 'ABANDONED',
          abandonedAt: now,
          abandonReason: resetReason,
          lastActiveAt: now,
          resubmitStartedAt: null,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('订单状态已变化，请刷新后重试');
      }

      const released = await tx.taskComment.updateMany({
        where: {
          taskId: task.id,
          participantId: participant.id,
          status: { in: ['CLAIMED', 'COMPLETED'] },
        },
        data: {
          status: 'AVAILABLE',
          participantId: null,
          claimerName: null,
          assignedAt: null,
          completedAt: null,
        },
      });

      await tx.operationLog.create({
        data: {
          operatorId: user.id,
          tenantId: task.tenantId,
          module: 'DAILY_TASK_ORDER',
          action: 'RESET_ACTIVE_ORDER',
          bizId: participant.id,
          description: `管理员重置任务订单状态：${participant.visitorName || participant.taskAccountPhone || participant.id}`,
          beforeData: {
            taskId: task.id,
            participantId: participant.id,
            status: participant.status,
            settlementStatus: participant.settlementStatus,
            appUserId: participant.appUserId,
            taskAccountId: participant.taskAccountId,
            taskAccountPhone: participant.taskAccountPhone,
          },
          afterData: {
            status: 'ABANDONED',
            settlementStatus: participant.settlementStatus,
            releasedCommentCount: released.count,
            abandonedAt: now.toISOString(),
            abandonReason: resetReason,
          },
        },
      });

      return released.count;
    });

    await this.recalculateTaskCounters(task.id);
    return {
      success: true,
      participantId: participant.id,
      status: 'ABANDONED',
      releasedCommentCount,
      message: releasedCommentCount > 0
        ? `状态已重置，并释放 ${releasedCommentCount} 条已占用评论`
        : '状态已重置，当前任务占用已释放',
    };
  }

  async settleOrder(taskId: string, participantId: string, dto: SettleTaskOrderDto, user: CurrentUserPayload) {
    const task = await this.findAdminTaskByIdentifier(taskId, user);
    if (task.isTestData && task.status === 'DISABLED') {
      throw new ConflictException('当前任务已标记为测试数据并停用，不能继续结算；请按测试清理流程删除。');
    }
    const proofFileId = String(dto.settlementProofFileId ?? '').trim();
    const proofFile = proofFileId ? await this.filesService.getFile(proofFileId) : null;
    const settlementOrderNo = String(dto.settlementOrderNo ?? '').trim() || null;
    const settled = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "TaskParticipant" WHERE id = ${participantId} FOR UPDATE`;
      const participant = await tx.taskParticipant.findFirst({
        where: { id: participantId, taskId: task.id },
        select: {
          id: true,
          status: true,
          settlementStatus: true,
          appUserId: true,
          leaderCommissionEnabled: true,
          leaderCommissionGroupId: true,
          leaderCommissionLeaderUserId: true,
          leaderCommissionMode: true,
          leaderCommissionAmount: true,
        },
      });
      if (!participant) {
        throw new NotFoundException('任务参与记录不存在');
      }
      if (participant.status !== 'COMPLETED') {
        throw new BadRequestException('只有已完成的订单才能结算');
      }
      if (participant.settlementStatus === 'SETTLED') {
        throw new ConflictException('该订单已经结算');
      }

      const updated = await tx.taskParticipant.update({
        where: { id: participant.id },
        data: {
          settlementStatus: 'SETTLED',
          settlementAmount: dto.settlementAmount,
          settlementOrderNo,
          settlementProofFileId: proofFile?.id ?? null,
          settlementProofUrl: proofFile?.url ?? null,
          settlementRemark: dto.settlementRemark,
          settledAt: new Date(),
          settledById: user.id,
        },
        include: {
          settledBy: { select: { id: true, username: true, displayName: true } },
        },
      });

      const isFirstSettlement = participant.settlementStatus !== 'SETTLED';
      if (participant.appUserId && isFirstSettlement) {
        const appUser = await tx.appUser.update({
          where: { id: participant.appUserId },
          data: {
            totalSettledAmount: { increment: dto.settlementAmount },
            balanceAmount: { increment: dto.settlementAmount },
          },
          select: { balanceAmount: true },
        });
        await tx.appUserWalletLedger.create({
          data: {
            appUserId: participant.appUserId,
            participantId: participant.id,
            type: 'SETTLEMENT',
            amount: dto.settlementAmount,
            balanceAfter: appUser.balanceAmount,
            remark: dto.settlementRemark || '任务结算入账',
          },
        });
      }

      // 团长佣金与成员任务结算独立入账，但只在首次成功结算时产生一次。
      // 分佣金额来自参与记录快照，而非当前团长规则，避免任务发布后规则变更影响历史订单。
      if (
        isFirstSettlement &&
        participant.leaderCommissionEnabled &&
        participant.leaderCommissionAmount > 0 &&
        participant.leaderCommissionGroupId &&
        participant.leaderCommissionLeaderUserId
      ) {
        const leader = await tx.appUser.findFirst({
          where: { id: participant.leaderCommissionLeaderUserId, deletedAt: null },
          select: { id: true },
        });
        if (leader) {
          const commissionRemark = `团长分佣：任务 ${task.title || task.id}`;
          await tx.leaderCommissionSettlement.create({
            data: {
              id: this.generateCuidLike('lcs'),
              tenantId: task.tenantId,
              groupId: participant.leaderCommissionGroupId,
              leaderUserId: participant.leaderCommissionLeaderUserId,
              taskId: task.id,
              participantId: participant.id,
              workerUserId: participant.appUserId || null,
              workerRewardAmount: dto.settlementAmount,
              commissionAmount: participant.leaderCommissionAmount,
              commissionMode: participant.leaderCommissionMode || 'EXTRA',
              status: 'SETTLED',
              settledAt: new Date(),
              settledById: user.id,
              remark: commissionRemark,
            },
          });
          const leaderBalance = await tx.appUser.update({
            where: { id: leader.id },
            data: {
              totalSettledAmount: { increment: participant.leaderCommissionAmount },
              balanceAmount: { increment: participant.leaderCommissionAmount },
            },
            select: { balanceAmount: true },
          });
          await tx.appUserWalletLedger.create({
            data: {
              appUserId: leader.id,
              participantId: participant.id,
              type: 'LEADER_COMMISSION',
              amount: participant.leaderCommissionAmount,
              balanceAfter: leaderBalance.balanceAmount,
              remark: commissionRemark,
            },
          });
          await tx.taskParticipant.update({
            where: { id: participant.id },
            data: { leaderCommissionSettledAt: new Date(), commissionCalculated: true },
          });
        }
      }
      return updated;
    });

    if (proofFileId) {
      await this.bindFileToBizIfNeeded(proofFileId, 'TASK_PARTICIPANT', participantId, 'settlementProof');
    }
    return settled;
  }

  async rejectOrder(taskId: string, participantId: string, dto: RejectTaskOrderDto, user: CurrentUserPayload) {
    const task = await this.findAdminTaskByIdentifier(taskId, user);
    const rejectReason = String(dto.rejectReason ?? '').trim();
    if (!rejectReason) {
      throw new BadRequestException('驳回原因不能为空');
    }

    const now = new Date();
    let pendingCommentCount = 0;
    const rejected = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "TaskParticipant" WHERE id = ${participantId} FOR UPDATE`;
      const participant = await tx.taskParticipant.findFirst({
        where: { id: participantId, taskId: task.id },
        select: {
          id: true,
          status: true,
          settlementStatus: true,
          appUserId: true,
        },
      });
      if (!participant) {
        throw new NotFoundException('任务参与记录不存在');
      }
      if (participant.status !== 'COMPLETED') {
        throw new BadRequestException('只有已提交完成的订单才能驳回');
      }
      if (participant.settlementStatus === 'SETTLED') {
        throw new BadRequestException('已结算的订单不能驳回');
      }

      const comments = await tx.taskComment.findMany({
        where: { taskId: task.id, participantId: participant.id, status: { in: ['CLAIMED', 'COMPLETED'] } },
        select: { id: true },
      });
      const commentIds = comments.map((item) => item.id);

      if (!commentIds.length) {
        throw new BadRequestException('当前订单未找到已领取评论，无法驳回重提');
      }
      pendingCommentCount = commentIds.length;

      await tx.taskComment.updateMany({
        where: { id: { in: commentIds } },
        data: {
          status: 'CLAIMED',
          completedAt: null,
        },
      });

      await tx.fileUsage.deleteMany({
        where: {
          bizType: 'TASK_PARTICIPANT',
          bizId: participant.id,
          fieldName: 'confirmProof',
        },
      });

      const updated = await tx.taskParticipant.update({
        where: { id: participant.id },
        data: {
          status: 'CLAIMED',
          uploadedImageFileId: null,
          uploadedImageUrl: null,
          completedAt: null,
          lastActiveAt: null,
          settlementStatus: 'REJECTED',
          settlementAmount: null,
          settlementOrderNo: null,
          settlementProofFileId: null,
          settlementProofUrl: null,
          settlementRemark: rejectReason,
          rejectedAt: now,
          resubmitStartedAt: null,
          settledAt: null,
          settledById: null,
        },
      });

      if (participant.appUserId) {
        await tx.appUser.updateMany({
          where: { id: participant.appUserId, totalCompletedOrders: { gt: 0 } },
          data: { totalCompletedOrders: { decrement: 1 } },
        });
      }

      return updated;
    });

    await this.recalculateTaskCounters(task.id);
    return {
      ...rejected,
      rejectReason,
      pendingCommentCount,
      releasedCommentCount: 0,
    };
  }

  async listComments(taskId: string, user: CurrentUserPayload) {
    const task = await this.findAdminTaskByIdentifier(taskId, user);
    return this.prisma.taskComment.findMany({
      where: { taskId: task.id },
      include: {
        assignee: { select: { id: true, username: true, displayName: true } },
        participant: {
          select: {
            id: true,
            visitorName: true,
            phone: true,
            visitorToken: true,
            uploadedImageUrl: true,
            settlementStatus: true,
            settlementAmount: true,
            settlementOrderNo: true,
            settlementProofUrl: true,
            settlementRemark: true,
            status: true,
            claimedAt: true,
            completedAt: true,
            settledAt: true,
          },
        },
      },
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createComment(taskId: string, payload: CreateTaskCommentDto | CreateTaskCommentDto[], user: CurrentUserPayload) {
    const task = await this.findAdminTaskByIdentifier(taskId, user);
    const { comments, isBatch } = this.normalizeCreateCommentPayload(payload);
    const count = await this.prisma.taskComment.count({ where: { taskId: task.id } });
    const createdComments = await this.prisma.$transaction(
      comments.map((comment, index) =>
        this.prisma.taskComment.create({
          data: {
            taskId: task.id,
            content: comment.content,
            source: comment.source ?? 'MANUAL',
            status: 'AVAILABLE',
            regionCode: comment.regionCode,
            sort: count + index,
          },
        }),
      ),
    );
    await this.recalculateTaskCounters(task.id);
    return isBatch ? createdComments : createdComments[0];
  }

  async updateComment(taskId: string, commentId: string, dto: UpdateTaskCommentDto, user: CurrentUserPayload) {
    const task = await this.findAdminTaskByIdentifier(taskId, user);
    const exists = await this.prisma.taskComment.findFirst({
      where: { id: commentId, taskId: task.id },
      include: { participant: true },
    });
    if (!exists) throw new NotFoundException('任务评论不存在');

    const clearClaimInfo = dto.status !== undefined && ['UNCONFIGURED', 'AVAILABLE', 'INVALID'].includes(dto.status);
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      if (clearClaimInfo && exists.participantId) {
        await tx.taskParticipant.update({
          where: { id: exists.participantId },
          data: { status: 'STARTED', claimedAt: null, completedAt: null, lastActiveAt: now },
        });
      }

      const data: Prisma.TaskCommentUpdateInput = {
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.regionCode !== undefined ? { regionCode: dto.regionCode } : {}),
      };

      if (dto.assigneeId) {
        Object.assign(data, { assignee: { connect: { id: dto.assigneeId } }, assignedAt: now });
      }

      if (clearClaimInfo) {
        Object.assign(data, {
          assignee: { disconnect: true },
          participant: { disconnect: true },
          claimerName: null,
          assignedAt: null,
          completedAt: null,
        });
      }

      if (dto.status === 'CLAIMED') {
        Object.assign(data, { assignedAt: exists.assignedAt ?? now, completedAt: null });
      }

      if (dto.status === 'COMPLETED') {
        Object.assign(data, { assignedAt: exists.assignedAt ?? now, completedAt: now });
        if (exists.participantId) {
          await tx.taskParticipant.update({
            where: { id: exists.participantId },
            data: { status: 'COMPLETED', completedAt: now, lastActiveAt: now },
          });
        }
      }

      return tx.taskComment.update({ where: { id: commentId }, data });
    });

    await this.recalculateTaskCounters(task.id);
    return updated;
  }

  async removeComment(taskId: string, commentId: string, user: CurrentUserPayload) {
    const task = await this.findAdminTaskByIdentifier(taskId, user);
    const existingComment = await this.prisma.taskComment.findFirst({
      where: { id: commentId, taskId: task.id },
      select: { status: true },
    });
    if (existingComment && ['CLAIMED', 'COMPLETED'].includes(existingComment.status)) {
      throw new ConflictException('当前评论已被领取，不可删除');
    }
    await this.prisma.taskComment.deleteMany({ where: { id: commentId, taskId: task.id } });
    await this.recalculateTaskCounters(task.id);
    return { success: true };
  }

  async batchRemoveComments(taskId: string, dto: BatchDeleteTaskCommentsDto, user: CurrentUserPayload) {
    const task = await this.findAdminTaskByIdentifier(taskId, user);
    const blockedCommentCount = await this.prisma.taskComment.count({
      where: {
        taskId: task.id,
        id: { in: dto.ids },
        status: { in: ['CLAIMED', 'COMPLETED'] },
      },
    });
    if (blockedCommentCount > 0) {
      throw new ConflictException('当前有被领取的评论，不可删除');
    }
    await this.prisma.taskComment.deleteMany({ where: { id: { in: dto.ids }, taskId: task.id } });
    await this.recalculateTaskCounters(task.id);
    return { success: true };
  }

  async generateComments(dto: AiGenerateCommentsDto, user: CurrentUserPayload) {
    const count = Math.min(Math.max(Number(dto.count || 10), 1), 200);
    let result: { conversationId: string; rows: Record<string, unknown>[] };
    try {
      result = await this.requestDeepSeekGeneratedComments({ ...dto, count });
    } catch (error) {
      const fallbackEnabled = String(this.configService.get<string>('DAILY_TASK_AI_FALLBACK_TO_COZE') ?? 'true').trim().toLowerCase() !== 'false';
      if (!fallbackEnabled) throw error;
      this.logger.warn(`DeepSeek daily-task comment generation failed; falling back to Coze: ${error instanceof Error ? error.message : String(error)}`);
      result = await this.requestCozeGeneratedComments({ ...dto, count }, user);
    }
    return {
      conversationId: result.conversationId || null,
      rows: result.rows.slice(0, count),
    };
  }

  private normalizeCreateCommentPayload(payload: CreateTaskCommentDto | CreateTaskCommentDto[]) {
    const isBatch = Array.isArray(payload);
    const rawComments = isBatch ? payload : [payload];
    if (!rawComments.length) {
      throw new BadRequestException('评论列表不能为空');
    }

    const comments = rawComments.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new BadRequestException({
          message: '参数校验失败',
          errors: [
            {
              field: isBatch ? `[${index}]` : 'body',
              errors: ['每条评论必须是对象'],
            },
          ],
        });
      }

      const dto = plainToInstance(CreateTaskCommentDto, item);
      const errors = validateSync(dto, {
        whitelist: true,
        forbidUnknownValues: false,
      });

      if (errors.length) {
        throw new BadRequestException({
          message: '参数校验失败',
          errors: errors.map((error) => ({
            field: isBatch ? `[${index}].${error.property}` : error.property,
            errors: Object.values(error.constraints ?? {}),
          })),
        });
      }

      return dto;
    });

    return { comments, isBatch };
  }

  async getPublicTaskEntry(query: PublicTaskLinkQueryDto) {
    const task = await this.findPublicTaskByLink(query);
    const visitor = query.visitorToken ? await this.findParticipantByToken(task.id, query.visitorToken) : null;
    const currentComment = visitor ? await this.findLatestParticipantComment(task.id, visitor.id) : null;
    const config = await this.getResolvedConfigByPlatform(task.platform);
    const proofImageUrls = visitor ? await this.listParticipantProofUrls(visitor.id) : [];

    return {
      id: task.id,
      postId: task.postId,
      platform: task.platform,
      authorName: task.authorName || task.mediaAccount.accountName,
      publishedAt: task.publishedAt || task.dispatchedAt || task.createdAt,
      title: task.title,
      videoUrl: task.videoUrl,
      coverUrl: task.coverUrl,
      copywriting: task.copywriting,
      progress: this.toProgressCard(task),
      stepConfig: config,
      visitor: this.toVisitorState(visitor, currentComment, proofImageUrls),
    };
  }

  async startPublicTask(postId: string, dto: PublicStartTaskDto, meta: RequestMeta) {
    const task = await this.findPublicTaskByPostId(postId, meta);
    this.assertDailyTaskNotDisabled(task);
    const appUser = await this.tryDistributionAppUser(this.readMetaAuthorization(meta));
    const participant = await this.getOrCreateParticipant(task.id, dto.visitorToken, {
      appUserId: appUser?.id,
      visitorName: appUser?.nickname || undefined,
      phone: appUser?.phone || undefined,
      sourcePlatform: dto.sourcePlatform,
      ...meta,
    });

    return {
      postId: task.postId || postId,
      visitorToken: participant.visitorToken,
      status: participant.status,
      nextStep: this.getNextStep(participant.status),
    };
  }

  async claimPublicComment(postId: string, dto: PublicClaimCommentDto, meta: RequestMeta) {
    const task = await this.findPublicTaskByPostId(postId, meta);
    this.assertDailyTaskNotDisabled(task);
    if (!dto.visitorName?.trim()) {
      throw new BadRequestException('姓名不能为空');
    }
    if (!dto.phone?.trim()) {
      throw new BadRequestException('手机号不能为空');
    }
    const normalizedName = dto.visitorName.trim();
    const normalizedPhone = this.normalizePhone(dto.phone);
    if (!this.isValidNormalizedPhone(normalizedPhone)) {
      throw new BadRequestException('手机号格式不正确');
    }
    const tokenParticipant = dto.visitorToken ? await this.findParticipantByToken(task.id, dto.visitorToken) : null;
    const excludeParticipantId =
      tokenParticipant && this.isExactClaimIdentityMatch(tokenParticipant, { visitorName: normalizedName, phone: normalizedPhone })
        ? tokenParticipant.id
        : undefined;

    await this.assertPublicClaimIdentityAvailable(task.id, { visitorName: normalizedName, phone: normalizedPhone }, excludeParticipantId);

    const now = new Date();
    const appUser = await this.tryDistributionAppUser(this.readMetaAuthorization(meta));
    const boundAppUser = appUser
      ? await this.bindDistributionAppUserPhone(appUser, normalizedPhone, normalizedName, this.readMetaAuthorization(meta))
      : null;
    const participant = await this.getOrCreateParticipant(task.id, dto.visitorToken, {
      appUserId: boundAppUser?.id,
      visitorName: normalizedName,
      phone: normalizedPhone,
      sourcePlatform: dto.sourcePlatform,
      ...meta,
    });

    const existingComment = await this.findLatestParticipantComment(task.id, participant.id);
    if (existingComment) {
      throw new ConflictException(
        existingComment.status === 'COMPLETED' ? '当前访客已完成任务，无需重复领取' : '当前访客已领取评论，请勿重复领取',
      );
    }

    await this.assertPublicClaimIdentityAvailable(task.id, { visitorName: normalizedName, phone: normalizedPhone }, participant.id);

    let claimedCommentId: string | null = null;

    for (let attempt = 0; attempt < 3 && !claimedCommentId; attempt += 1) {
      claimedCommentId = await this.prisma.$transaction(async (tx) => {
        await this.assertPublicClaimIdentityAvailable(task.id, { visitorName: normalizedName, phone: normalizedPhone }, participant.id, tx);
        const availableComment = await tx.taskComment.findFirst({
          where: { taskId: task.id, status: 'AVAILABLE' },
          orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
        });
        if (!availableComment) {
          return null;
        }

        const updated = await tx.taskComment.updateMany({
          where: { id: availableComment.id, status: 'AVAILABLE' },
          data: {
            status: 'CLAIMED',
            participantId: participant.id,
            claimerName: normalizedName,
            assignedAt: now,
            completedAt: null,
          },
        });
        if (!updated.count) {
          return null;
        }

        await tx.taskParticipant.update({
          where: { id: participant.id },
          data: {
            appUserId: boundAppUser?.id ?? participant.appUserId,
            visitorName: normalizedName,
            phone: normalizedPhone,
            status: 'CLAIMED',
            claimedAt: now,
            lastActiveAt: now,
            settlementStatus: 'UNSETTLED',
            settlementAmount: null,
            settlementOrderNo: null,
            settlementProofFileId: null,
            settlementProofUrl: null,
            settlementRemark: null,
            settledAt: null,
            settledById: null,
            sourcePlatform: dto.sourcePlatform ?? participant.sourcePlatform ?? 'H5',
            ip: this.normalizeText(meta.ip),
            userAgent: this.normalizeText(meta.userAgent),
          },
        });

        if (task.status === 'DISPATCHED') {
          await tx.dailyTask.update({ where: { id: task.id }, data: { status: 'RUNNING' } });
        }

        return availableComment.id;
      });
    }

    if (!claimedCommentId) {
      throw new ConflictException('当前没有可领取的评论');
    }

    await this.recalculateTaskCounters(task.id);
    const claimedComment = await this.prisma.taskComment.findUnique({ where: { id: claimedCommentId } });
    if (!claimedComment) throw new NotFoundException('任务评论不存在');
    const refreshedTask = await this.findPublicTaskById(task.id);
    const proofImageUrls = await this.listParticipantProofUrls(participant.id);

    return {
      postId: task.postId || postId,
      commentId: claimedComment.id,
      commentContent: claimedComment.content,
      visitorName: normalizedName,
      phone: normalizedPhone,
      uploadedImageUrl: proofImageUrls[0] ?? null,
      visitorToken: participant.visitorToken,
      nextStep: 'STEP_3_CONFIRM',
      progress: this.toProgressCard(refreshedTask),
    };
  }

  async confirmPublicTaskCompletion(postId: string, dto: PublicConfirmCompleteDto, meta: RequestMeta) {
    const task = await this.findPublicTaskByPostId(postId, meta);
    this.assertDailyTaskNotDisabled(task);
    const participant = await this.findParticipantByToken(task.id, dto.visitorToken);
    if (!participant) {
      throw new NotFoundException('访客会话不存在');
    }

    await this.assertPublicClaimIdentityAvailable(
      task.id,
      { visitorName: participant.visitorName, phone: participant.phone },
      participant.id,
    );

    const comment = await this.findLatestParticipantComment(task.id, participant.id);
    if (!comment) {
      throw new BadRequestException('当前访客未领取评论');
    }

    const proofFiles = await this.resolveProofFiles(dto);
    await this.bindFilesToBizIfNeeded(
      proofFiles.map((file) => file.id),
      'TASK_PARTICIPANT',
      participant.id,
      'confirmProof',
    );
    const primaryProof = proofFiles[0] ?? null;

    const now = new Date();
    if (comment.status !== 'COMPLETED') {
      await this.prisma.$transaction([
        this.prisma.taskComment.update({ where: { id: comment.id }, data: { status: 'COMPLETED', completedAt: now } }),
        this.prisma.taskParticipant.update({
          where: { id: participant.id },
          data: {
            status: 'COMPLETED',
            completedAt: now,
            lastActiveAt: now,
            settlementStatus: 'UNSETTLED',
            settlementAmount: null,
            settlementOrderNo: null,
            settlementProofFileId: null,
            settlementProofUrl: null,
            settlementRemark: null,
            rejectedAt: null,
            resubmitStartedAt: null,
            mediaAccountNo: this.normalizeMediaAccountNo(dto.mediaAccountNo),
            proofOcrStatus: dto.mediaAccountNo ? 'MANUAL_CONFIRMED' : 'PENDING',
            ip: this.normalizeText(meta.ip),
            userAgent: this.normalizeText(meta.userAgent),
          },
        }),
        ...(participant.appUserId ? [this.prisma.appUser.update({ where: { id: participant.appUserId }, data: { totalCompletedOrders: { increment: 1 } } })] : []),
      ]);
    } else {
      await this.touchParticipant(participant.id, { status: 'COMPLETED' }, meta);
    }

    await this.recalculateTaskCounters(task.id);
    const refreshedTask = await this.findPublicTaskById(task.id);
    const proofImageUrls = await this.listParticipantProofUrls(participant.id);
    if (primaryProof || dto.mediaAccountNo) {
      await this.prisma.taskParticipant.update({
        where: { id: participant.id },
        data: {
          ...(primaryProof ? { uploadedImageFileId: primaryProof.id, uploadedImageUrl: primaryProof.url } : {}),
          ...(dto.mediaAccountNo ? { mediaAccountNo: this.normalizeMediaAccountNo(dto.mediaAccountNo), proofOcrStatus: 'MANUAL_CONFIRMED' } : {}),
        },
      });
    }
    if (participant.appUserId && dto.mediaAccountNo) {
      await this.upsertAppUserMediaAccount(participant.appUserId, task.platform, dto.mediaAccountNo, primaryProof?.id, primaryProof?.url);
    }
    return {
      postId: task.postId || postId,
      commentId: comment.id,
      status: 'COMPLETED',
      nextStep: 'DONE',
      proofImageUrls,
      progress: this.toProgressCard(refreshedTask),
    };
  }


  async sendDistributionSmsCode(dto: SendSmsCodeDto, meta: RequestMeta) {
    return this.smsService.sendCode(dto, meta);
  }

  async distributionLogin(dto: DistributionLoginDto, meta: RequestMeta) {
    const phone = this.normalizePhone(dto.phone);
    if (!phone) {
      throw new BadRequestException('手机号不能为空');
    }
    if (!this.isValidNormalizedPhone(phone)) {
      throw new BadRequestException('手机号格式不正确');
    }
    await this.smsService.verifyCode(phone, 'login', dto.smsCode);
    const nickname = String(dto.nickname ?? '').trim() || `用户${phone.slice(-4)}`;
    const tenantId = await this.resolveDistributionTenantId(meta?.tenantRef);
    const now = new Date();
    let phoneUser = await this.prisma.appUser.findUnique({ where: { phone } });
    if (phoneUser?.deletedAt) {
      await this.releaseDeletedAppUserIdentity({ phone });
      phoneUser = null;
    }
    if (phoneUser && (phoneUser.status === 'DISABLED' || (tenantId && phoneUser.tenantId && tenantId !== phoneUser.tenantId))) {
      throw new BadRequestException('此账号在当前站点不可用');
    }
    // Only the server-side WeChat OAuth callback may bind a payment recipient.
    const appUser = phoneUser
      ? await this.prisma.appUser.update({
        where: { id: phoneUser.id },
        data: { nickname, tenantId: phoneUser.tenantId || tenantId || null, lastLoginAt: now },
      })
      : await this.prisma.appUser.create({
        data: { phone, nickname, tenantId: tenantId || null, status: 'ENABLED', lastLoginAt: now },
      });
    const token = this.generateVisitorToken();
    await this.redisService.set(
      `distribution:session:${token}`,
      JSON.stringify({ appUserId: appUser.id, phone: appUser.phone, tenantId, ip: this.normalizeText(meta.ip), createdAt: now.toISOString() }),
      7 * 24 * 60 * 60,
    );
    return {
      token,
      appToken: token,
      expiresIn: 7 * 24 * 60 * 60,
      user: this.toAppUserProfile(appUser),
      status: this.resolveAppUserStatus(appUser),
    };
  }

  async getDistributionMe(authorization?: string, refreshSubscribe = false) {
    const appUser = await this.requireDistributionAppUser(authorization);
    const [binding, leaderGroup, latestLeaderApplication] = await Promise.all([
      this.prisma.distributionUserBinding.findFirst({ where: { userId: appUser.id, status: 'ENABLED' }, orderBy: { createdAt: 'desc' } }),
      this.prisma.distributionGroup.findFirst({
        where: { leaderUserId: appUser.id, status: { in: ['ENABLED', 'DISABLED'] }, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true, tenantId: true, name: true, status: true, commissionEnabled: true, commissionRuleType: true, commissionRuleValue: true },
      }),
      this.prisma.distributionLeaderApplication.findFirst({
        where: { appUserId: appUser.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, requestedGroupName: true, reason: true, reviewRemark: true, reviewedAt: true, createdAt: true, groupId: true },
      }),
    ]);
    const rawTaskAccounts = await this.prisma.distributionTaskAccount.findMany({ where: { userId: appUser.id, status: 'ENABLED' }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
    const taskAccountIds = rawTaskAccounts.map((item) => item.id);
    const recognitionRows = taskAccountIds.length
      ? await this.prisma.distributionTaskAccountHomepageRecognition.findMany({
          where: { taskAccountId: { in: taskAccountIds } },
          select: {
            taskAccountId: true,
            expectedPlatform: true,
            detectedPlatform: true,
            platformConfidence: true,
            nicknameCandidate: true,
            accountIdCandidate: true,
            ocrStatus: true,
            ocrError: true,
            ocrRequestedAt: true,
            ocrCompletedAt: true,
          },
          orderBy: [{ updatedAt: 'desc' }],
        })
      : [];
    const recognitionsByTaskAccount = new Map<string, any[]>();
    for (const item of recognitionRows) {
      const existing = recognitionsByTaskAccount.get(item.taskAccountId) ?? [];
      existing.push(this.toDistributionHomepageRecognitionSummary(item));
      recognitionsByTaskAccount.set(item.taskAccountId, existing);
    }
    // 识别信息只作为单独的候选信息返回，不改变任务账号中用户手工填写的昵称和手机号。
    const taskAccounts = rawTaskAccounts.map((item) => ({
      ...item,
      homepageRecognitions: recognitionsByTaskAccount.get(item.id) ?? [],
    }));
    const activeTaskAccount = taskAccounts.find((item) => item.isDefault) || taskAccounts[0] || null;
    const [currentTask, todayAbandonCount, totalAbandonedOrders, totalSettledOrders] = await Promise.all([
      activeTaskAccount ? this.findCurrentDistributionParticipant(appUser.id, activeTaskAccount.id) : this.findCurrentDistributionParticipant(appUser.id),
      this.countTodayAbandons(appUser.id),
      this.prisma.taskParticipant.count({ where: { appUserId: appUser.id, status: 'ABANDONED', task: { deletedAt: null } } }),
      this.prisma.taskParticipant.count({ where: { appUserId: appUser.id, status: 'COMPLETED', settlementStatus: 'SETTLED', task: { deletedAt: null } } }),
    ]);
    let bindingDetail: any = null;
    if (binding) {
      const [tenant, group] = await Promise.all([
        this.prisma.tenant.findUnique({ where: { id: binding.tenantId }, select: { id: true, name: true, code: true } }),
        this.prisma.distributionGroup.findUnique({
          where: { id: binding.groupId },
          select: {
            id: true,
            tenantId: true,
            name: true,
            leaderUserId: true,
            status: true,
            commissionEnabled: true,
            commissionRuleType: true,
            commissionRuleValue: true,
          },
        }),
      ]);
      bindingDetail = { ...binding, tenant, tenantName: tenant?.name || '', group, groupName: group?.name || '' };
    }
    const officialAccountSubscribed = await this.wechatService.getOfficialAccountSubscribeStatus(appUser.serviceOpenid, refreshSubscribe).catch(() => null);
    const leaderApplicationGroup = latestLeaderApplication?.groupId
      ? await this.prisma.distributionGroup.findUnique({ where: { id: latestLeaderApplication.groupId }, select: { status: true, leaderUnboundAt: true, deletedAt: true } })
      : null;
    const leaderApplicationCanReapply = Boolean(
      latestLeaderApplication && (
        latestLeaderApplication.status === 'REJECTED' ||
        latestLeaderApplication.status === 'CANCELLED' ||
        (latestLeaderApplication.status === 'APPROVED' && !leaderGroup && Boolean(leaderApplicationGroup?.leaderUnboundAt || leaderApplicationGroup?.deletedAt || leaderApplicationGroup?.status === 'UNBOUND'))
      ),
    );

    return {
      user: this.toAppUserProfile(appUser),
      status: this.resolveAppUserStatus(appUser),
      wechatOfficialAccount: {
        required: Boolean(appUser.serviceOpenid),
        subscribed: officialAccountSubscribed,
        mustFollow: officialAccountSubscribed === false,
      },
      needBindInvite: !binding,
      identity: {
        role: leaderGroup ? 'LEADER' : binding ? 'MEMBER' : 'OTHER',
        label: leaderGroup ? (leaderGroup.status === 'DISABLED' ? '团长（已停用）' : '团长') : binding ? '成员' : '未加入团队',
        leaderGroup: leaderGroup || null,
      },
      leaderApplication: latestLeaderApplication
        ? {
            ...latestLeaderApplication,
            canReapply: leaderApplicationCanReapply,
          }
        : null,
      binding: bindingDetail,
      taskAccounts,
      activeTaskAccount,
      currentTask: currentTask ? await this.toDistributionCurrentTask(currentTask) : null,
      stats: {
        totalCompletedOrders: appUser.totalCompletedOrders,
        totalAbandonedOrders,
        totalSettledOrders,
        totalSettledAmount: appUser.totalSettledAmount,
        balanceAmount: appUser.balanceAmount,
        withdrawnAmount: appUser.withdrawnAmount,
        todayAbandonCount,
        todayRemainingAbandonCount: Math.max(0, 2 - todayAbandonCount),
      },
    };
  }

  async getDistributionLeaderCenter(query: DistributionLeaderCenterQueryDto, authorization?: string) {
    const appUser = await this.requireDistributionAppUser(authorization);
    const [currentBinding, leaderGroups] = await Promise.all([
      this.prisma.distributionUserBinding.findFirst({
        where: { userId: appUser.id, status: 'ENABLED' },
        orderBy: { createdAt: 'desc' },
        select: { groupId: true },
      }),
      this.prisma.distributionGroup.findMany({
        where: { leaderUserId: appUser.id, status: 'ENABLED', deletedAt: null },
        orderBy: [{ createdAt: 'desc' }],
      }),
    ]);

    // 正常数据下，团长绑定关系和 leaderUserId 指向同一个分发组。
    // 这里优先该绑定组，避免历史脏数据导致把统计口径切到其他团长组。
    const group = leaderGroups.find((item) => item.id === currentBinding?.groupId) || leaderGroups[0] || null;
    if (!group) {
      throw new ForbiddenException('当前账号不是启用中的团长，无法查看团长中心');
    }

    const range = this.resolveDistributionLeaderCenterRange(query);
    const invitedMemberWhere: Prisma.DistributionUserBindingWhereInput = {
      groupId: group.id,
      status: 'ENABLED',
      bindSource: 'INVITE',
    };
    const periodInvitedMemberWhere: Prisma.DistributionUserBindingWhereInput = {
      ...invitedMemberWhere,
      ...(range.startAt && range.endExclusive ? { createdAt: { gte: range.startAt, lt: range.endExclusive } } : {}),
    };

    const [tenant, invitedMembers, periodInvitedMembers] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: group.tenantId }, select: { id: true, name: true, code: true } }),
      this.prisma.distributionUserBinding.findMany({
        where: invitedMemberWhere,
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.distributionUserBinding.findMany({
        where: periodInvitedMemberWhere,
        select: { userId: true },
        distinct: ['userId'],
      }),
    ]);

    const invitedUserIds = invitedMembers.map((item) => item.userId).filter(Boolean);
    const completedOrderWhere: Prisma.TaskParticipantWhereInput = {
      appUserId: { in: invitedUserIds },
      participantGroupId: group.id,
      status: 'COMPLETED',
      completedAt: { not: null },
      task: { deletedAt: null },
    };
    const periodCompletedOrderWhere: Prisma.TaskParticipantWhereInput = {
      ...completedOrderWhere,
      ...(range.startAt && range.endExclusive ? { completedAt: { gte: range.startAt, lt: range.endExclusive } } : {}),
    };

    // 只统计已成功打款（PAID）的提现；申请中、驳回、失败、取消都不计入。
    // 早期 H5 提现单可能没有写 tenantId，因此同时兼容当前团长租户和历史空 tenantId 的记录；
    // 仍严格限定为当前团长成功邀请的成员，避免读取无关用户的资金数据。
    const paidWithdrawalWhere: Prisma.AppUserWithdrawalWhereInput = {
      appUserId: { in: invitedUserIds },
      OR: [{ tenantId: group.tenantId }, { tenantId: null }],
      status: 'PAID',
      paidAt: { not: null },
    };
    const periodPaidWithdrawalWhere: Prisma.AppUserWithdrawalWhereInput = {
      ...paidWithdrawalWhere,
      ...(range.startAt && range.endExclusive ? { paidAt: { gte: range.startAt, lt: range.endExclusive } } : {}),
    };

    const totalCommissionWhere: Prisma.LeaderCommissionSettlementWhereInput = {
      leaderUserId: appUser.id,
      groupId: group.id,
      status: 'SETTLED',
    };
    const periodCommissionWhere: Prisma.LeaderCommissionSettlementWhereInput = {
      ...totalCommissionWhere,
      ...(range.startAt && range.endExclusive ? { settledAt: { gte: range.startAt, lt: range.endExclusive } } : {}),
    };

    const [totalCompletedOrderCount, periodCompletedOrderCount, totalPaidWithdrawals, periodPaidWithdrawals, totalCommissions, periodCommissions] = await Promise.all([
      this.prisma.taskParticipant.count({ where: completedOrderWhere }),
      this.prisma.taskParticipant.count({ where: periodCompletedOrderWhere }),
      this.prisma.appUserWithdrawal.aggregate({ where: paidWithdrawalWhere, _sum: { amount: true } }),
      this.prisma.appUserWithdrawal.aggregate({ where: periodPaidWithdrawalWhere, _sum: { amount: true } }),
      this.prisma.leaderCommissionSettlement.aggregate({ where: totalCommissionWhere, _sum: { commissionAmount: true }, _count: { _all: true } }),
      this.prisma.leaderCommissionSettlement.aggregate({ where: periodCommissionWhere, _sum: { commissionAmount: true }, _count: { _all: true } }),
    ]);

    const memberInviteUrl = this.buildDistributionInviteUrl('invite', group.memberInviteCode);
    return {
      group: {
        id: group.id,
        name: group.name,
        tenantId: group.tenantId,
        tenantName: tenant?.name || '',
      },
      invitation: {
        memberInviteCode: group.memberInviteCode,
        memberInviteUrl,
      },
      totals: {
        invitedMemberCount: invitedUserIds.length,
        completedOrderCount: totalCompletedOrderCount,
        paidWithdrawalAmount: totalPaidWithdrawals._sum.amount || 0,
        commissionAmount: totalCommissions._sum.commissionAmount || 0,
        commissionOrderCount: totalCommissions._count._all || 0,
      },
      period: {
        startDate: range.startDate,
        endDate: range.endDate,
        newInvitedMemberCount: periodInvitedMembers.length,
        completedOrderCount: periodCompletedOrderCount,
        paidWithdrawalAmount: periodPaidWithdrawals._sum.amount || 0,
        commissionAmount: periodCommissions._sum.commissionAmount || 0,
        commissionOrderCount: periodCommissions._count._all || 0,
      },
    };
  }

  async updateDistributionProfile(dto: DistributionProfileDto, authorization?: string) {
    const appUser = await this.requireDistributionAppUser(authorization);
    const phone = this.normalizePhone(dto.phone);
    if (!phone) {
      throw new BadRequestException('手机号不能为空');
    }
    if (!this.isValidNormalizedPhone(phone)) {
      throw new BadRequestException('手机号格式不正确');
    }
    await this.smsService.verifyCode(phone, 'profile', dto.smsCode);
    const nickname = String(dto.nickname ?? '').trim();
    if (!nickname) {
      throw new BadRequestException('姓名不能为空');
    }
    const updated = await this.bindDistributionAppUserPhone(appUser, phone, nickname, authorization);
    return {
      user: this.toAppUserProfile(updated),
      status: this.resolveAppUserStatus(updated),
    };
  }

  async listDistributionOrders(query: DistributionOrderQueryDto, authorization?: string) {
    const appUser = await this.requireDistributionAppUser(authorization);
    const { skip, take, page, pageSize } = getPagination(query);
    const type = String(query.type ?? 'completed').trim().toLowerCase();
    const platform = query.platform ? this.normalizePlatform(query.platform) : undefined;
    const requestedTaskAccountId = String(query.taskAccountId ?? '').trim();
    let taskAccountFilter: { id: string } | null = null;
    if (requestedTaskAccountId) {
      taskAccountFilter = await this.prisma.distributionTaskAccount.findFirst({
        where: { id: requestedTaskAccountId, userId: appUser.id, status: 'ENABLED' },
        select: { id: true },
      });
      if (!taskAccountFilter) throw new BadRequestException('任务账号不存在或已停用');
    }

    const baseWhere: Prisma.TaskParticipantWhereInput = {
      appUserId: appUser.id,
      ...(taskAccountFilter ? { taskAccountId: taskAccountFilter.id } : {}),
      task: {
        deletedAt: null,
        ...(platform ? { platform } : {}),
      },
    };

    const completedUnsettledWhere: Prisma.TaskParticipantWhereInput = {
      ...baseWhere,
      status: 'COMPLETED',
      AND: [{ settlementStatus: { not: 'SETTLED' } }, { settlementStatus: { not: 'REJECTED' } }],
    };
    const settledWhere: Prisma.TaskParticipantWhereInput = { ...baseWhere, status: 'COMPLETED', settlementStatus: 'SETTLED' };
    const abandonedWhere: Prisma.TaskParticipantWhereInput = { ...baseWhere, status: 'ABANDONED' };
    const rejectedWhere: Prisma.TaskParticipantWhereInput = { ...baseWhere, settlementStatus: 'REJECTED' };
    const allWhere: Prisma.TaskParticipantWhereInput = {
      ...baseWhere,
      OR: [{ status: 'COMPLETED' }, { status: 'ABANDONED' }, { settlementStatus: 'REJECTED' }],
    };
    const currentWhere: Prisma.TaskParticipantWhereInput = {
      ...baseWhere,
      status: { in: ['STARTED', 'CLAIMED'] },
      OR: [{ settlementStatus: { not: 'REJECTED' } }, { resubmitStartedAt: { not: null } }],
    };

    let where: Prisma.TaskParticipantWhereInput;
    if (type === 'income' || type === 'settled' || type === 'withdrawable') {
      where = settledWhere;
    } else if (type === 'abandoned' || type === 'abandon') {
      where = abandonedWhere;
    } else if (type === 'rejected' || type === 'reject') {
      where = rejectedWhere;
    } else if (type === 'current') {
      where = currentWhere;
    } else if (type === 'all') {
      where = allWhere;
    } else {
      where = completedUnsettledWhere;
    }

    const include = {
      task: {
        include: {
          tenant: { select: { id: true, name: true, code: true } },
          mediaAccount: { select: { id: true, accountName: true, accountId: true, platform: true } },
          videoLinks: { orderBy: [{ isPrimary: 'desc' as const }, { sort: 'asc' as const }] },
        },
      },
      comments: {
        orderBy: [{ updatedAt: 'desc' as const }, { createdAt: 'desc' as const }],
        take: 1,
      },
    } satisfies Prisma.TaskParticipantInclude;

    const [items, total, allCount, completedCount, abandonedCount, settledCount, rejectedCount] = await Promise.all([
      this.prisma.taskParticipant.findMany({
        where,
        skip,
        take,
        orderBy: [{ updatedAt: 'desc' }, { completedAt: 'desc' }, { createdAt: 'desc' }],
        include,
      }),
      this.prisma.taskParticipant.count({ where }),
      this.prisma.taskParticipant.count({ where: allWhere }),
      this.prisma.taskParticipant.count({ where: completedUnsettledWhere }),
      this.prisma.taskParticipant.count({ where: abandonedWhere }),
      this.prisma.taskParticipant.count({ where: settledWhere }),
      this.prisma.taskParticipant.count({ where: rejectedWhere }),
    ]);

    const proofImageUrlsMap = await this.listParticipantProofUrlsMap(items.map((item) => item.id));
    const settlementProofFiles = await this.findActiveFilesByIds(items.map((item) => item.settlementProofFileId));
    const settlementProofUrlsById = await this.resolveFileUrlsById(settlementProofFiles);
    const cards = await Promise.all(
      items.map(async (item) => ({
        id: item.id,
        participantId: item.id,
        visitorToken: item.visitorToken,
        status: item.status,
        settlementStatus: item.settlementStatus,
        settlementAmount: item.settlementAmount ?? item.task?.rewardAmount ?? 0,
        settlementOrderNo: item.settlementOrderNo,
        settlementProofUrl: item.settlementProofFileId
          ? settlementProofUrlsById.get(item.settlementProofFileId) ?? null
          : item.settlementProofUrl,
        settlementRemark: item.settlementRemark,
        rejectReason: item.settlementStatus === 'REJECTED' ? item.settlementRemark : null,
        rejectedAt: item.rejectedAt,
        resubmitStartedAt: item.resubmitStartedAt,
        settledAt: item.settledAt,
        claimedAt: item.claimedAt,
        completedAt: item.completedAt,
        abandonedAt: item.abandonedAt,
        abandonReason: item.abandonReason,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        mediaAccountNo: item.mediaAccountNo,
        taskAccountId: item.taskAccountId,
        taskAccountPhone: item.taskAccountPhone || item.phone,
        taskAccountNickname: item.taskAccountNickname || item.visitorName,
        participantGroupId: item.participantGroupId,
        proofImageUrls: proofImageUrlsMap.get(item.id) ?? [],
        commentId: item.comments?.[0]?.id ?? null,
        commentContent: item.comments?.[0]?.content ?? null,
        canResubmit: item.settlementStatus === 'REJECTED',
        task: await this.toDistributionTaskCard(item.task),
      })),
    );

    return {
      items: cards,
      page,
      pageSize,
      total,
      counts: { all: allCount, completed: completedCount, abandoned: abandonedCount, rejected: rejectedCount, settled: settledCount, income: settledCount },
      taskAccountId: taskAccountFilter?.id || null,
    };
  }

  async listDistributionTasks(query: DistributionTaskQueryDto, authorization?: string) {
    const appUser = await this.requireDistributionAppUser(authorization);
    await this.assertAppUserCanClaim(appUser);
    const taskAccount = await this.getActiveDistributionTaskAccount(appUser, query.taskAccountId);
    const access = await this.getAccessibleGroupIdsForAccount(taskAccount);
    const { skip, take, page, pageSize } = getPagination(query);
    const platform = query.platform ? this.normalizePlatform(query.platform) : undefined;
    const scope = String(query.scope ?? 'claimable').trim().toLowerCase();
    const excludeHandledByPhone = scope !== 'all';
    const collaborationGroupIds = Array.from(new Set(access.sourceGroupIds.filter(Boolean)));
    const visibilityWhere: Prisma.DailyTaskWhereInput[] = [
      { distributionScope: 'TENANT' },
      { distributionGroupId: access.directGroupId },
      ...(collaborationGroupIds.length ? [{ distributionGroupId: { in: collaborationGroupIds }, allowGroupCollaboration: true }] : []),
    ];
    const where: Prisma.DailyTaskWhereInput = {
      ...(query.taskId ? { id: query.taskId } : {}),
      tenantId: taskAccount.tenantId,
      deletedAt: null,
      status: { in: ['READY', 'DISPATCHED', 'RUNNING'] },
      dispatchedAt: { not: null },
      ...(platform ? { platform } : {}),
      OR: visibilityWhere,
      comments: { some: { status: 'AVAILABLE' } },
      ...(excludeHandledByPhone ? { participants: { none: { taskAccountPhone: taskAccount.phone, status: { in: ['STARTED', 'CLAIMED', 'COMPLETED'] } } } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.dailyTask.findMany({
        where,
        skip,
        take,
        orderBy: [{ rewardAmount: 'desc' }, { createdAt: 'desc' }],
        include: {
          tenant: { select: { id: true, name: true, code: true } },
          mediaAccount: { select: { id: true, accountName: true, accountId: true, platform: true } },
          videoLinks: { orderBy: [{ isPrimary: 'desc' }, { sort: 'asc' }] },
        },
      }),
      this.prisma.dailyTask.count({ where }),
    ]);
    const userTaskStatusMap = await this.getDistributionUserTaskStatusMap(appUser.id, items.map((item) => item.id), taskAccount.id, taskAccount.phone);
    const cards = await Promise.all(items.map((task) => this.toDistributionTaskCard(task, userTaskStatusMap.get(task.id))));
    return { items: cards, page, pageSize, total, activeTaskAccount: taskAccount };
  }

  async claimDistributionTask(dto: DistributionClaimDto, authorization?: string, meta?: RequestMeta) {
    const appUser = await this.requireDistributionAppUser(authorization);
    await this.assertDistributionProfileCompleted(appUser);
    await this.assertAppUserCanClaim(appUser);
    const taskAccount = await this.getActiveDistributionTaskAccount(appUser, dto.taskAccountId);
    const current = await this.findCurrentDistributionParticipant(appUser.id, taskAccount.id);
    if (current) {
      throw new ConflictException('当前任务账号还没完成任务，不能领取其他任务');
    }
    const requestedTaskId = String(dto.taskId ?? '').trim();
    if (requestedTaskId) {
      const handled = await this.prisma.taskParticipant.findFirst({
        where: { taskAccountPhone: taskAccount.phone, taskId: requestedTaskId, status: { in: ['STARTED', 'CLAIMED', 'COMPLETED'] } },
        select: { id: true, status: true },
      });
      if (handled?.status === 'COMPLETED') throw new ConflictException('该手机号已完成该任务，不能重复领取');
      if (handled) throw new ConflictException('该手机号已有该任务进行中记录');
    }
    const task = await this.pickDistributionClaimTask(dto, appUser.id, taskAccount);
    if (!task) throw new ConflictException('当前没有可领取的任务');
    const access = await this.getAccessibleGroupIdsForAccount(taskAccount);
    const isCollaborative = Boolean(task.distributionGroupId && task.distributionGroupId !== taskAccount.groupId && access.sourceGroupIds.includes(task.distributionGroupId));
    const collaboration = isCollaborative
      ? access.collaborations.find((item) => item.sourceGroupId === task.distributionGroupId)
      : null;
    const now = new Date();
    // 团长本人领取自己团队任务时默认不产生自佣；只有显式开启 selfCommissionEnabled 才允许。
    let leaderCommissionEnabledForParticipant = Boolean((task as any).commissionEnabled);
    if (leaderCommissionEnabledForParticipant && String((task as any).commissionLeaderUserId || '') === appUser.id) {
      const commissionGroup = String((task as any).commissionGroupId || '').trim()
        ? await this.prisma.distributionGroup.findUnique({
            where: { id: String((task as any).commissionGroupId) },
            select: { selfCommissionEnabled: true },
          })
        : null;
      leaderCommissionEnabledForParticipant = Boolean(commissionGroup?.selfCommissionEnabled);
    }
    const participant = await this.prisma.taskParticipant.create({
      data: {
        taskId: task.id,
        appUserId: appUser.id,
        visitorToken: this.generateVisitorToken(),
        visitorName: taskAccount.nickname,
        phone: taskAccount.phone,
        taskAccountId: taskAccount.id,
        taskAccountPhone: taskAccount.phone,
        taskAccountNickname: taskAccount.nickname,
        primaryGroupId: taskAccount.groupId,
        taskOwnerGroupId: task.distributionGroupId || null,
        participantGroupId: taskAccount.groupId,
        sourceCollaborationId: collaboration?.id || null,
        commissionBaseAmount: task.rewardAmount ?? 0,
        leaderCommissionEnabled: leaderCommissionEnabledForParticipant,
        leaderCommissionGroupId: leaderCommissionEnabledForParticipant ? String((task as any).commissionGroupId || '') || null : null,
        leaderCommissionLeaderUserId: leaderCommissionEnabledForParticipant ? String((task as any).commissionLeaderUserId || '') || null : null,
        leaderCommissionMode: leaderCommissionEnabledForParticipant ? String((task as any).commissionMode || '') || null : null,
        leaderCommissionAmount: leaderCommissionEnabledForParticipant ? Number((task as any).commissionAmount || 0) : 0,
        status: 'STARTED',
        settlementStatus: 'UNSETTLED',
        sourcePlatform: 'H5',
        ip: this.normalizeText(meta?.ip),
        userAgent: this.normalizeText(meta?.userAgent),
        startedAt: now,
        lastActiveAt: now,
      },
      include: {
        task: {
          include: {
            tenant: { select: { id: true, name: true, code: true } },
            mediaAccount: { select: { id: true, accountName: true, accountId: true, platform: true } },
            videoLinks: { orderBy: [{ isPrimary: 'desc' }, { sort: 'asc' }] },
          },
        },
        comments: { where: { status: { in: ['CLAIMED', 'COMPLETED'] } }, orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }], take: 1 },
      },
    });
    if (task.status === 'READY') {
      await this.prisma.dailyTask.update({ where: { id: task.id }, data: { status: 'DISPATCHED', dispatchedAt: task.dispatchedAt ?? now } });
    }
    const currentTask = await this.toDistributionCurrentTask(participant);
    return { currentTask, task: currentTask.task, visitor: currentTask.visitor, commentId: null, commentContent: null, visitorToken: participant.visitorToken, nextStep: 'STEP_2_CLAIM', activeTaskAccount: taskAccount };
  }

  async claimDistributionCurrentComment(authorization?: string, meta?: RequestMeta) {
    const appUser = await this.requireDistributionAppUser(authorization);
    await this.assertDistributionProfileCompleted(appUser);
    const taskAccount = await this.getActiveDistributionTaskAccount(appUser);
    const current = await this.findCurrentDistributionParticipant(appUser.id, taskAccount.id);
    if (!current) {
      throw new BadRequestException('当前没有进行中的任务');
    }
    if (current.status === 'COMPLETED') {
      throw new BadRequestException('当前任务已完成');
    }
    this.assertDailyTaskNotDisabled(current.task);
    const existingComment = current.comments?.[0] ?? await this.findLatestParticipantComment(current.taskId, current.id);
    if (existingComment) {
      const proofImageUrls = await this.listParticipantProofUrls(current.id);
      const refreshedTask = await this.findPublicTaskById(current.taskId);
      return {
        success: true,
        participantId: current.id,
        visitorToken: current.visitorToken,
        commentId: existingComment.id,
        commentContent: existingComment.content,
        visitorName: current.visitorName || taskAccount.nickname,
        phone: current.phone || taskAccount.phone,
        nextStep: 'STEP_3_CONFIRM',
        proofImageUrls,
        progress: this.toProgressCard(refreshedTask),
        currentTask: await this.toDistributionCurrentTask({ ...current, task: refreshedTask, comments: [existingComment] }),
      };
    }

    const now = new Date();
    let claimedCommentId: string | null = null;
    for (let attempt = 0; attempt < 3 && !claimedCommentId; attempt += 1) {
      claimedCommentId = await this.prisma.$transaction(async (tx) => {
        const availableComment = await tx.taskComment.findFirst({
          where: { taskId: current.taskId, status: 'AVAILABLE' },
          orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
        });
        if (!availableComment) return null;

        const updated = await tx.taskComment.updateMany({
          where: { id: availableComment.id, status: 'AVAILABLE' },
          data: {
            status: 'CLAIMED',
            participantId: current.id,
            claimerName: taskAccount.nickname || taskAccount.phone,
            assignedAt: now,
            completedAt: null,
          },
        });
        if (!updated.count) return null;

        await tx.taskParticipant.update({
          where: { id: current.id },
          data: {
            visitorName: taskAccount.nickname,
            phone: taskAccount.phone,
            taskAccountId: taskAccount.id,
            taskAccountPhone: taskAccount.phone,
            taskAccountNickname: taskAccount.nickname,
            status: 'CLAIMED',
            claimedAt: now,
            lastActiveAt: now,
            settlementStatus: 'UNSETTLED',
            settlementAmount: null,
            settlementOrderNo: null,
            settlementProofFileId: null,
            settlementProofUrl: null,
            settlementRemark: null,
            settledAt: null,
            settledById: null,
            ip: this.normalizeText(meta?.ip),
            userAgent: this.normalizeText(meta?.userAgent),
          },
        });

        if (current.task.status === 'DISPATCHED' || current.task.status === 'READY') {
          await tx.dailyTask.update({ where: { id: current.taskId }, data: { status: 'RUNNING' } });
        }
        return availableComment.id;
      });
    }

    if (!claimedCommentId) {
      throw new ConflictException('当前没有可领取的评论');
    }

    await this.recalculateTaskCounters(current.taskId);
    const claimedComment = await this.prisma.taskComment.findUnique({ where: { id: claimedCommentId } });
    if (!claimedComment) throw new NotFoundException('任务评论不存在');
    const refreshedTask = await this.findPublicTaskById(current.taskId);
    const updatedCurrent = await this.findCurrentDistributionParticipant(appUser.id, taskAccount.id);
    const proofImageUrls = await this.listParticipantProofUrls(current.id);
    return {
      success: true,
      participantId: current.id,
      visitorToken: current.visitorToken,
      commentId: claimedComment.id,
      commentContent: claimedComment.content,
      visitorName: taskAccount.nickname,
      phone: taskAccount.phone,
      nextStep: 'STEP_3_CONFIRM',
      proofImageUrls,
      progress: this.toProgressCard(refreshedTask),
      currentTask: updatedCurrent ? await this.toDistributionCurrentTask(updatedCurrent) : null,
    };
  }

  async completeCurrentDistributionTask(dto: DistributionCompleteDto, authorization?: string, meta?: RequestMeta) {
    const appUser = await this.requireDistributionAppUser(authorization);
    const taskAccount = await this.getActiveDistributionTaskAccount(appUser);
    const current = await this.findCurrentDistributionParticipant(appUser.id, taskAccount.id);
    if (!current) {
      throw new BadRequestException('当前没有进行中的任务');
    }
    if (current.status !== 'CLAIMED') {
      throw new BadRequestException('请先领取评论后再提交完成');
    }
    this.assertDailyTaskNotDisabled(current.task);
    const comment = current.comments?.[0] ?? await this.findLatestParticipantComment(current.taskId, current.id);
    if (!comment) {
      throw new BadRequestException('当前任务未绑定评论，请重新领取任务');
    }

    const proofFiles = await this.resolveProofFiles(dto);
    if (proofFiles.some(file => file.memberId !== appUser.id || file.scene !== 'TASK_CLAIM_PROOF')) {
      throw new ForbiddenException('凭证须由当前成员上传');
    }
    const homepage = await this.prisma.fileUsage.findFirst({
      where: {
        fileId: { in: proofFiles.map(file => file.id) }, bizType: DISTRIBUTION_HOMEPAGE_PROOF_BIZ_TYPE, fieldName: DISTRIBUTION_HOMEPAGE_PROOF_FIELD,
        bizId: this.buildDistributionHomepageProofBizId(appUser.id, taskAccount.id, this.normalizePlatform(current.task.platform)),
      },
      select: { fileId: true },
    });
    if (!homepage || proofFiles.length < 2 || proofFiles.length > 7) {
      throw new BadRequestException('请提交主页截图和 1 至 6 张本次任务证明');
    }
    await this.bindFilesToBizIfNeeded(
      proofFiles.map((file) => file.id),
      'TASK_PARTICIPANT',
      current.id,
      'confirmProof',
    );
    const primaryProof = proofFiles[0] ?? null;
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.taskComment.update({ where: { id: comment.id }, data: { status: 'COMPLETED', completedAt: now } }),
      this.prisma.taskParticipant.update({
        where: { id: current.id },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          lastActiveAt: now,
          ...(primaryProof ? { uploadedImageFileId: primaryProof.id, uploadedImageUrl: primaryProof.url } : {}),
          ...(dto.mediaAccountNo ? { mediaAccountNo: this.normalizeMediaAccountNo(dto.mediaAccountNo), proofOcrStatus: 'MANUAL_CONFIRMED' } : {}),
          settlementStatus: 'UNSETTLED',
          settlementAmount: null,
          settlementOrderNo: null,
          settlementProofFileId: null,
          settlementProofUrl: null,
          settlementRemark: null,
          rejectedAt: null,
          resubmitStartedAt: null,
          settledAt: null,
          settledById: null,
          ip: this.normalizeText(meta?.ip),
          userAgent: this.normalizeText(meta?.userAgent),
        },
      }),
      this.prisma.appUser.update({ where: { id: appUser.id }, data: { totalCompletedOrders: { increment: 1 } } }),
    ]);

    if (dto.mediaAccountNo) {
      await this.upsertAppUserMediaAccount(appUser.id, current.task.platform, dto.mediaAccountNo, primaryProof?.id, primaryProof?.url);
    }
    await this.recalculateTaskCounters(current.taskId);
    const refreshedTask = await this.findPublicTaskById(current.taskId);
    const proofImageUrls = await this.listParticipantProofUrls(current.id);
    return {
      success: true,
      participantId: current.id,
      commentId: comment.id,
      status: 'COMPLETED',
      nextStep: 'DONE',
      proofImageUrls,
      progress: this.toProgressCard(refreshedTask),
      task: await this.toDistributionTaskCard(refreshedTask),
    };
  }

  async retainDistributionHomepageProof(dto: DistributionHomepageProofRetainDto, authorization?: string, request?: Request) {
    const appUser = await this.requireDistributionAppUser(authorization);
    const platform = this.normalizePlatform(dto.platform);
    const file = await this.filesService.getFile(String(dto.fileId || '').trim());
    if (file.memberId !== appUser.id) throw new ForbiddenException('请选择当前成员上传的主页截图');
    this.assertDistributionHomepageProofFile(file);

    const current = await this.findCurrentDistributionParticipant(appUser.id);
    const taskAccountId = String(current?.taskAccountId || '').trim();
    const requestedTaskAccountId = String(dto.taskAccountId || '').trim();
    if (!current || !taskAccountId || this.normalizePlatform(String(current.task?.platform || '')) !== platform) {
      throw new ForbiddenException('当前任务与用户主页截图平台不匹配');
    }
    if (requestedTaskAccountId && requestedTaskAccountId !== taskAccountId) {
      throw new ForbiddenException('当前主页截图不属于所选任务账号');
    }
    const taskAccount = await this.getActiveDistributionTaskAccount(appUser, taskAccountId);
    await this.ensureDistributionHomepageProofBinding(file, appUser, taskAccount, platform);
    await this.upsertDistributionHomepageRecognition(taskAccount.id, platform, file.id);
    return this.toDistributionHomepageProofAccessResponse(file, platform, request);
  }

  async getDistributionHomepageProofAccess(
    fileId: string,
    platformInput: string,
    taskAccountIdInput?: string,
    authorization?: string,
    request?: Request,
  ) {
    const appUser = await this.requireDistributionAppUser(authorization);
    const platform = this.normalizePlatform(platformInput);
    const file = await this.filesService.getFile(String(fileId || '').trim());
    this.assertDistributionHomepageProofFile(file);
    const taskAccount = await this.getActiveDistributionTaskAccount(appUser, taskAccountIdInput);
    await this.ensureDistributionHomepageProofBinding(file, appUser, taskAccount, platform);
    await this.upsertDistributionHomepageRecognition(taskAccount.id, platform, file.id);
    return this.toDistributionHomepageProofAccessResponse(file, platform, request);
  }

  async requestDistributionHomepageProofRecognition(
    fileId: string,
    dto: DistributionHomepageProofRecognitionRequestDto,
    authorization?: string,
  ) {
    const resolved = await this.resolveDistributionHomepageRecognition(fileId, dto, authorization);
    const profile = await this.distributionHomepageOcrService.enqueue(resolved.profile.id);
    return this.toDistributionHomepageRecognitionSummary(profile ?? resolved.profile);
  }

  async getDistributionHomepageProofRecognition(
    fileId: string,
    dto: DistributionHomepageProofRecognitionRequestDto,
    authorization?: string,
  ) {
    const resolved = await this.resolveDistributionHomepageRecognition(fileId, dto, authorization);
    return this.toDistributionHomepageRecognitionSummary(resolved.profile);
  }

  async resubmitRejectedDistributionTask(participantId: string, authorization?: string, meta?: RequestMeta) {
    const appUser = await this.requireDistributionAppUser(authorization);
    await this.assertDistributionProfileCompleted(appUser);
    const taskAccount = await this.getActiveDistributionTaskAccount(appUser);
    const id = String(participantId ?? '').trim();
    if (!id) {
      throw new BadRequestException('任务记录不存在');
    }

    const target = await this.prisma.taskParticipant.findFirst({
      where: {
        id,
        appUserId: appUser.id,
        taskAccountId: taskAccount.id,
        settlementStatus: 'REJECTED',
        status: 'CLAIMED',
        task: { deletedAt: null },
      },
      include: {
        task: {
          include: {
            tenant: { select: { id: true, name: true, code: true } },
            mediaAccount: { select: { id: true, accountName: true, accountId: true, platform: true } },
            videoLinks: { orderBy: [{ isPrimary: 'desc' }, { sort: 'asc' }] },
          },
        },
        comments: {
          where: { status: { in: ['CLAIMED', 'COMPLETED'] } },
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
          take: 1,
        },
      },
    });
    if (!target) {
      throw new NotFoundException('未找到可重新提交的驳回任务');
    }
    this.assertDailyTaskNotDisabled(target.task);
    const comment = target.comments?.[0] ?? await this.findLatestParticipantComment(target.taskId, target.id);
    if (!comment) {
      throw new BadRequestException('该驳回任务没有已领取评论，请联系运营处理');
    }

    const otherCurrent = await this.prisma.taskParticipant.findFirst({
      where: {
        appUserId: appUser.id,
        taskAccountId: taskAccount.id,
        id: { not: target.id },
        status: { in: ['STARTED', 'CLAIMED'] },
        task: { deletedAt: null },
        OR: [{ settlementStatus: { not: 'REJECTED' } }, { resubmitStartedAt: { not: null } }],
      },
      select: { id: true },
    });
    if (otherCurrent) {
      throw new ConflictException('当前有正在进行中的任务，请先完成再提交');
    }

    const now = new Date();
    await this.prisma.taskParticipant.update({
      where: { id: target.id },
      data: {
        status: 'CLAIMED',
        lastActiveAt: now,
        resubmitStartedAt: now,
        ip: this.normalizeText(meta?.ip),
        userAgent: this.normalizeText(meta?.userAgent),
      },
    });

    const refreshed = await this.findCurrentDistributionParticipant(appUser.id, taskAccount.id);
    if (!refreshed) {
      throw new InternalServerErrorException('重新提交任务状态刷新失败');
    }
    return {
      success: true,
      currentTask: await this.toDistributionCurrentTask(refreshed),
      task: await this.toDistributionTaskCard(refreshed.task),
      visitor: this.toVisitorState(refreshed, refreshed.comments?.[0] ?? null, await this.listParticipantProofUrls(refreshed.id)),
      visitorToken: refreshed.visitorToken,
      commentId: refreshed.comments?.[0]?.id ?? null,
      commentContent: refreshed.comments?.[0]?.content ?? null,
      nextStep: 'STEP_3_CONFIRM',
    };
  }

  async abandonCurrentDistributionTask(dto: DistributionAbandonDto, authorization?: string, meta?: RequestMeta) {
    const appUser = await this.requireDistributionAppUser(authorization);
    const taskAccount = await this.getActiveDistributionTaskAccount(appUser);
    const todayAbandonCount = await this.countTodayAbandons(appUser.id);
    if (todayAbandonCount >= 2) {
      throw new BadRequestException('今日放弃任务次数已用完，明天可继续领取任务');
    }
    const current = await this.findCurrentDistributionParticipant(appUser.id, taskAccount.id);
    if (!current) {
      throw new BadRequestException('当前没有可放弃的任务');
    }
    if (current.status === 'COMPLETED') {
      throw new BadRequestException('已完成任务不能放弃');
    }
    const reason = String(dto.reason ?? '').trim() || '用户主动放弃任务';
    await this.prisma.$transaction(async (tx) => {
      await tx.taskComment.updateMany({
        where: { taskId: current.taskId, participantId: current.id, status: { in: ['CLAIMED'] } },
        data: { status: 'AVAILABLE', participantId: null, claimerName: null, assignedAt: null, completedAt: null },
      });
      await tx.taskParticipant.update({
        where: { id: current.id },
        data: {
          status: 'ABANDONED',
          abandonedAt: new Date(),
          abandonReason: reason,
          lastActiveAt: new Date(),
          ip: this.normalizeText(meta?.ip),
          userAgent: this.normalizeText(meta?.userAgent),
        },
      });
      await tx.taskAbandonLog.create({
        data: { appUserId: appUser.id, taskId: current.taskId, participantId: current.id, reason },
      });
    });
    await this.recalculateTaskCounters(current.taskId);
    const nextCount = todayAbandonCount + 1;
    return {
      success: true,
      todayAbandonCount: nextCount,
      todayRemainingAbandonCount: Math.max(0, 2 - nextCount),
    };
  }

  async createDistributionWithdrawal(dto: DistributionWithdrawDto, authorization?: string) {
    const appUser = await this.requireDistributionAppUser(authorization);
    if (appUser.balanceAmount < dto.amount) {
      throw new BadRequestException('可提现余额不足');
    }
    const withdrawal = await this.prisma.$transaction(async (tx) => {
      const updatedUser = await tx.appUser.update({
        where: { id: appUser.id },
        data: {
          balanceAmount: { decrement: dto.amount },
          withdrawnAmount: { increment: dto.amount },
        },
        select: { balanceAmount: true },
      });
      await tx.appUserWalletLedger.create({
        data: {
          appUserId: appUser.id,
          type: 'WITHDRAW',
          amount: -dto.amount,
          balanceAfter: updatedUser.balanceAmount,
          remark: dto.remark || '用户申请提现',
        },
      });
      return tx.appUserWithdrawal.create({
        data: {
          appUserId: appUser.id,
          amount: dto.amount,
          channel: 'WECHAT_TRANSFER',
          status: 'PENDING',
          remark: dto.remark,
        },
      });
    });
    return withdrawal;
  }

  async banDistributionUserByParticipant(taskId: string, participantId: string, dto: BanAppUserDto, user: CurrentUserPayload) {
    const task = await this.findAdminTaskByIdentifier(taskId, user);
    const participant = await this.prisma.taskParticipant.findFirst({
      where: { id: participantId, taskId: task.id },
      select: { id: true, appUserId: true, phone: true, visitorName: true },
    });
    if (!participant) {
      throw new NotFoundException('任务参与记录不存在');
    }
    let appUserId = participant.appUserId;
    if (!appUserId && participant.phone) {
      const appUser = await this.prisma.appUser.findUnique({ where: { phone: this.normalizePhone(participant.phone) } });
      appUserId = appUser?.id ?? null;
    }
    if (!appUserId) {
      throw new BadRequestException('当前订单未绑定 H5 用户，无法限制接单');
    }
    const screenshotFile = dto.screenshotFileId ? await this.filesService.getFile(dto.screenshotFileId) : null;
    const now = new Date();
    const endsAt = new Date(now.getTime() + dto.days * 24 * 60 * 60 * 1000);
    const result = await this.prisma.$transaction(async (tx) => {
      const restriction = await tx.appUserRestriction.create({
        data: {
          appUserId: appUserId!,
          operatorId: user.id,
          reason: dto.reason,
          screenshotFileId: screenshotFile?.id ?? null,
          screenshotUrl: screenshotFile?.url ?? null,
          days: dto.days,
          startedAt: now,
          endsAt,
          status: 'ACTIVE',
        },
      });
      const appUser = await tx.appUser.update({
        where: { id: appUserId! },
        data: { status: 'RESTRICTED', bannedUntil: endsAt, banReason: dto.reason },
      });
      return { restriction, appUser };
    });
    if (dto.screenshotFileId) {
      await this.bindFileToBizIfNeeded(dto.screenshotFileId, 'APP_USER_RESTRICTION', result.restriction.id, 'screenshot');
    }
    return result;
  }


  async legacyListPublicTasks(tenantRef?: string | null) {
    const trimmedTenantRef = String(tenantRef ?? '').trim();
    const where: Prisma.DailyTaskWhereInput = {
      deletedAt: null,
      ...(trimmedTenantRef
        ? {
            OR: [
              { tenantId: trimmedTenantRef },
              { tenant: { code: trimmedTenantRef } },
            ],
          }
        : {}),
    };

    const tasks = await this.prisma.dailyTask.findMany({
      where,
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        mediaAccount: true,
        videoLinks: { orderBy: [{ isPrimary: 'desc' }, { sort: 'asc' }, { createdAt: 'asc' }] },
      },
    });

    const posts = await Promise.all(
      tasks.map(async (task) => {
        const postId = await this.ensureNumericPostId(task);
        const videoUrls = this.toTaskVideoUrlArray(task);
        return {
          id: Number(postId),
          sourcePlatform: this.toLegacyPlatform(task.platform),
          accountName: task.authorName || task.mediaAccount.accountName,
          postTitle: task.title,
          videoDescription: task.copywriting || task.title,
          coverUrl: task.coverUrl,
          coverUrlSigned: task.coverUrl,
          postUrl: this.pickRandomVideoUrl(task),
          videoUrl: videoUrls,
          videoLinks: task.videoLinks.map((item) => ({
            id: item.id,
            url: item.url,
            isPrimary: item.isPrimary,
            sort: item.sort,
          })),
          commentCount: task.targetCommentCount,
          claimedCount: task.claimedCommentCount,
          completedCount: task.completedCommentCount,
          createdAt: task.publishedAt || task.createdAt,
          updatedAt: task.updatedAt,
          status: task.status,
        };
      }),
    );

    return { posts };
  }

  async legacyGetTaskDetail(postId: string, tenantRef?: string | null, meta?: RequestMeta) {
    const task = await this.findLegacyPublicTask({
      tenantRef,
      postId,
      platformHint: this.resolvePlatformHint(undefined, meta),
    });
    const comments = await this.prisma.taskComment.findMany({
      where: { taskId: task.id, status: { in: ['CLAIMED', 'COMPLETED'] } },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        content: true,
        status: true,
        claimerName: true,
        assignedAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const videoUrls = this.toTaskVideoUrlArray(task);
    const normalizedPostId = await this.ensureNumericPostId(task);
    return {
      id: Number(normalizedPostId),
      sourcePlatform: this.toLegacyPlatform(task.platform),
      postTitle: task.title,
      videoDescription: task.copywriting || task.title,
      postUrl: this.pickRandomVideoUrl(task),
      videoUrl: videoUrls,
      videoLinks: task.videoLinks.map((item) => ({
        id: item.id,
        url: item.url,
        isPrimary: item.isPrimary,
        sort: item.sort,
      })),
      commentCount: task.targetCommentCount,
      claimedCount: task.claimedCommentCount,
      completedCount: task.completedCommentCount,
      list: comments.map((comment) => ({
        id: comment.id,
        commentId: comment.id,
        content: comment.content,
        comment: { content: comment.content },
        claimName: comment.claimerName,
        status: comment.status,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        assignedAt: comment.assignedAt,
        completedAt: comment.completedAt,
      })),
    };
  }

  async legacyGetPostDetail(postId: string, tenantRef?: string | null, meta?: RequestMeta) {
    const task = await this.findLegacyPublicTask({
      tenantRef,
      postId,
      platformHint: this.resolvePlatformHint(undefined, meta),
    });
    const normalizedPostId = await this.ensureNumericPostId(task);
    const claims = await this.prisma.taskComment.findMany({
      where: { taskId: task.id, status: { in: ['CLAIMED', 'COMPLETED'] } },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        content: true,
        status: true,
        claimerName: true,
        assignedAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const videoUrls = this.toTaskVideoUrlArray(task);
    return {
      post: {
        id: Number(normalizedPostId),
        sourcePlatform: this.toLegacyPlatform(task.platform),
        accountName: task.authorName || task.mediaAccount.accountName,
        postTitle: task.title,
        videoDescription: task.copywriting || task.title,
        postUrl: this.pickRandomVideoUrl(task),
        videoUrl: videoUrls,
        videoLinks: task.videoLinks.map((item) => ({
          id: item.id,
          url: item.url,
          isPrimary: item.isPrimary,
          sort: item.sort,
        })),
        coverUrl: task.coverUrl,
        commentCount: task.targetCommentCount,
        claimedCount: task.claimedCommentCount,
        completedCount: task.completedCommentCount,
        status: task.status,
        createdAt: task.publishedAt || task.createdAt,
        updatedAt: task.updatedAt,
      },
      claims: claims.map((comment) => ({
        id: comment.id,
        commentId: comment.id,
        username: comment.claimerName,
        claimTime: comment.assignedAt,
        completedTime: comment.completedAt,
        commentContent: comment.content,
        status: comment.status,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      })),
    };
  }

  async legacyClaimComment(
    payload: { tenantRef?: string | null; postId: string; username: string },
    meta: RequestMeta,
  ) {
    const task = await this.findLegacyPublicTask({
      tenantRef: payload.tenantRef,
      postId: payload.postId,
      platformHint: this.resolvePlatformHint(undefined, meta),
    });
    this.assertDailyTaskNotDisabled(task);

    const visitorName = String(payload.username || '').trim();
    if (!visitorName) {
      throw new BadRequestException('用户名不能为空');
    }

    const existingComment = await this.prisma.taskComment.findFirst({
      where: {
        taskId: task.id,
        claimerName: visitorName,
        status: { in: ['CLAIMED', 'COMPLETED'] },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (existingComment) {
      throw new ConflictException(existingComment.status === 'COMPLETED' ? '当前访客已完成任务，无需重复领取' : '当前访客已领取评论，请勿重复领取');
    }

    const now = new Date();
    let participant = await this.prisma.taskParticipant.findFirst({
      where: { taskId: task.id, visitorName },
      orderBy: [{ updatedAt: 'desc' }],
    });

    if (!participant) {
      participant = await this.prisma.taskParticipant.create({
        data: {
          taskId: task.id,
          visitorToken: this.generateVisitorToken(),
          visitorName,
          status: 'STARTED',
          sourcePlatform: this.resolvePlatformHint(undefined, meta) || 'H5_LEGACY',
          ip: this.normalizeText(meta.ip),
          userAgent: this.normalizeText(meta.userAgent),
          startedAt: now,
          lastActiveAt: now,
        },
      });
    }

    let claimedCommentId: string | null = null;
    for (let attempt = 0; attempt < 3 && !claimedCommentId; attempt += 1) {
      claimedCommentId = await this.prisma.$transaction(async (tx) => {
        const availableComment = await tx.taskComment.findFirst({
          where: { taskId: task.id, status: 'AVAILABLE' },
          orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
        });
        if (!availableComment) return null;

        const updated = await tx.taskComment.updateMany({
          where: { id: availableComment.id, status: 'AVAILABLE' },
          data: {
            status: 'CLAIMED',
            participantId: participant.id,
            claimerName: visitorName,
            assignedAt: now,
            completedAt: null,
          },
        });
        if (!updated.count) return null;

        await tx.taskParticipant.update({
          where: { id: participant.id },
          data: {
            visitorName,
            status: 'CLAIMED',
            claimedAt: now,
            lastActiveAt: now,
            sourcePlatform: this.resolvePlatformHint(undefined, meta) || participant.sourcePlatform || 'H5_LEGACY',
            ip: this.normalizeText(meta.ip),
            userAgent: this.normalizeText(meta.userAgent),
          },
        });

        if (task.status === 'DISPATCHED') {
          await tx.dailyTask.update({ where: { id: task.id }, data: { status: 'RUNNING' } });
        }

        return availableComment.id;
      });
    }

    if (!claimedCommentId) {
      throw new ConflictException('评论已被领取完');
    }

    await this.recalculateTaskCounters(task.id);
    const claimedComment = await this.prisma.taskComment.findUnique({ where: { id: claimedCommentId } });
    if (!claimedComment) {
      throw new NotFoundException('任务评论不存在');
    }

    return {
      data: this.toLegacyClaimResult(task, claimedComment, visitorName, '领取成功'),
      message: '领取成功',
    };
  }

  async legacyConfirmComment(
    payload: { tenantRef?: string | null; postId: string; claimName: string; commentId: string },
    meta: RequestMeta,
  ) {
    const task = await this.findLegacyPublicTask({
      tenantRef: payload.tenantRef,
      postId: payload.postId,
      platformHint: this.resolvePlatformHint(undefined, meta),
    });

    const claimName = String(payload.claimName || '').trim();
    if (!claimName) {
      throw new BadRequestException('领取人姓名不能为空');
    }
    const commentId = String(payload.commentId || '').trim();
    if (!commentId) {
      throw new BadRequestException('评论 ID 不能为空');
    }

    const comment = await this.prisma.taskComment.findFirst({
      where: {
        id: commentId,
        taskId: task.id,
        OR: [
          { claimerName: claimName },
          { participant: { visitorName: claimName } },
        ],
      },
      include: { participant: true },
    });
    if (!comment) {
      throw new NotFoundException('评论领取记录不存在');
    }

    const now = new Date();
    if (comment.status !== 'COMPLETED') {
      await this.prisma.$transaction(async (tx) => {
        await tx.taskComment.update({
          where: { id: comment.id },
          data: { status: 'COMPLETED', completedAt: now },
        });
        if (comment.participantId) {
          await tx.taskParticipant.update({
            where: { id: comment.participantId },
            data: {
              visitorName: claimName,
              status: 'COMPLETED',
              completedAt: now,
              lastActiveAt: now,
              ip: this.normalizeText(meta.ip),
              userAgent: this.normalizeText(meta.userAgent),
            },
          });
        }
      });
    } else if (comment.participantId) {
      await this.touchParticipant(comment.participantId, { visitorName: claimName, status: 'COMPLETED' }, meta);
    }

    await this.recalculateTaskCounters(task.id);
    return {
      id: comment.id,
      commentId: comment.id,
      taskId: task.id,
      postId: task.postId || task.id,
      status: 'COMPLETED',
      claimName,
    };
  }

  private async ensureMediaAccount(mediaAccountId: string, tenantId: string, platform: string) {
    const account = await this.prisma.mediaAccount.findFirst({ where: { id: mediaAccountId, tenantId, platform: this.normalizePlatform(platform), deletedAt: null } });
    if (!account) throw new NotFoundException('媒体账号不存在');
    if (account.status !== 'ENABLED') throw new BadRequestException('媒体账号已停用');
    return account;
  }

  private async ensureTaskConfigType() {
    await this.prisma.dictType.upsert({
      where: { code: DAILY_TASK_MODULE_CONFIG_TYPE_CODE },
      create: {
        code: DAILY_TASK_MODULE_CONFIG_TYPE_CODE,
        name: '每日任务平台配置',
        status: 'ENABLED',
      },
      update: {
        name: '每日任务平台配置',
        status: 'ENABLED',
      },
    });
  }

  private async getResolvedConfigByPlatform(platform: string) {
    const normalizedPlatform = this.normalizePlatform(platform);
    const item = await this.prisma.dictItem.findUnique({
      where: { typeCode_value: { typeCode: DAILY_TASK_MODULE_CONFIG_TYPE_CODE, value: normalizedPlatform } },
      select: { remark: true },
    });
    return item?.remark ?? null;
  }

  private pickInputComments(dto: CreateDailyTaskDto | UpdateDailyTaskDto) {
    if (dto.comment !== undefined) return dto.comment;
    return dto.comments;
  }

  private normalizeInputComments(input?: DailyTaskCommentInputDto[]) {
    if (!input?.length) return [];
    return input.map((item) => {
      const content = String(item.text ?? item.content ?? '').trim();
      if (!content) {
        throw new BadRequestException('评论内容不能为空');
      }
      return {
        content,
        source: item.source?.trim() || 'MANUAL',
        regionCode: item.regionCode?.trim() || undefined,
      };
    });
  }

  private normalizeInputVideoUrls(input?: string[] | null) {
    if (!input?.length) return [];
    return input
      .map((item) => String(item ?? '').trim())
      .filter(Boolean);
  }

  private toTaskVideoUrlArray(task: { videoUrl?: string | null; videoLinks?: Array<{ url: string }> }) {
    const urls = this.normalizeInputVideoUrls([
      ...(task.videoLinks?.map((item) => item.url) ?? []),
      ...(task.videoUrl ? [task.videoUrl] : []),
    ]);
    return Array.from(new Set(urls));
  }

  private pickRandomVideoUrl(task: { videoUrl?: string | null; videoLinks?: Array<{ url: string }> }) {
    const urls = this.toTaskVideoUrlArray(task);
    if (!urls.length) {
      return '';
    }
    const randomIndex = Math.floor(Math.random() * urls.length);
    return urls[randomIndex] || urls[0];
  }

  private resolveTaskVideoLinks(params: {
    videoUrls?: string[] | null;
    extraLinks?: DailyTaskVideoLinkInputDto[];
    fallbackPrimaryUrl?: string | null;
  }) {
    const primaryCandidates = this.normalizeInputVideoUrls(
      params.videoUrls && params.videoUrls.length ? params.videoUrls : params.fallbackPrimaryUrl ? [params.fallbackPrimaryUrl] : [],
    );
    const extras = (params.extraLinks ?? [])
      .map((link) => ({
        url: String(link.url ?? '').trim(),
        isPrimary: Boolean(link.isPrimary),
      }))
      .filter((link) => link.url);

    const merged: Array<{ url: string; isPrimary: boolean; sort: number }> = [];
    const seen = new Set<string>();
    const pushLink = (url: string, isPrimary: boolean) => {
      const normalizedUrl = String(url ?? '').trim();
      if (!normalizedUrl || seen.has(normalizedUrl)) return;
      seen.add(normalizedUrl);
      merged.push({ url: normalizedUrl, isPrimary, sort: merged.length });
    };

    primaryCandidates.forEach((url, index) => pushLink(url, index === 0));
    extras.forEach((link) => pushLink(link.url, false));

    if (!merged.length) {
      throw new BadRequestException('至少需要提供一个视频链接');
    }

    return {
      primaryUrl: merged[0].url,
      links: merged.map((link, index) => ({
        ...link,
        isPrimary: index === 0,
        sort: index,
      })),
    };
  }

  private async recalculateTaskCounters(taskId: string) {
    const [grouped, total, task] = await Promise.all([
      this.prisma.taskComment.groupBy({ by: ['status'], where: { taskId }, _count: { id: true } }),
      this.prisma.taskComment.count({ where: { taskId } }),
      this.prisma.dailyTask.findUnique({ where: { id: taskId } }),
    ]);
    if (!task) {
      throw new NotFoundException('每日任务不存在');
    }

    const counts = grouped.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count.id;
      return acc;
    }, {});
    const claimed = (counts.CLAIMED ?? 0) + (counts.COMPLETED ?? 0);
    const completed = counts.COMPLETED ?? 0;
    const shouldComplete = task.targetCommentCount > 0 && completed >= task.targetCommentCount;

    let nextStatus = task.status;
    let completedAt: Date | null | undefined = task.completedAt;

    if (!['CANCELLED', 'DISABLED'].includes(task.status)) {
      if (shouldComplete) {
        nextStatus = 'COMPLETED';
        completedAt = task.completedAt ?? new Date();
      } else if (claimed > 0) {
        nextStatus = 'RUNNING';
        completedAt = null;
      } else if (task.dispatchedAt) {
        nextStatus = 'DISPATCHED';
        completedAt = null;
      } else {
        nextStatus = total >= task.targetCommentCount ? 'READY' : 'DRAFT';
        completedAt = null;
      }
    }

    await this.prisma.dailyTask.update({
      where: { id: taskId },
      data: {
        claimedCommentCount: claimed,
        completedCommentCount: completed,
        status: nextStatus,
        completedAt,
      },
    });
  }


  private async findLegacyPublicTask(params: { tenantRef?: string | null; postId: string; platformHint?: string | null }) {
    const trimmedTenantRef = String(params.tenantRef ?? '').trim();
    const trimmedPostId = String(params.postId ?? '').trim();
    const normalizedPlatform = params.platformHint ? this.normalizePlatform(params.platformHint) : null;

    const tasks = await this.prisma.dailyTask.findMany({
      where: {
        deletedAt: null,
        postId: trimmedPostId,
        ...(normalizedPlatform ? { platform: normalizedPlatform } : {}),
        ...(trimmedTenantRef
          ? {
              OR: [
                { tenantId: trimmedTenantRef },
                { tenant: { code: trimmedTenantRef } },
              ],
            }
          : {}),
      },
      include: {
        tenant: true,
        mediaAccount: true,
        videoLinks: { orderBy: [{ isPrimary: 'desc' }, { sort: 'asc' }, { createdAt: 'asc' }] },
      },
      take: 2,
    });

    if (!tasks.length) {
      throw new NotFoundException('公开任务不存在');
    }
    if (tasks.length > 1) {
      throw new BadRequestException('存在多个同 postId 任务，请在链接中补充正确的 type');
    }
    return tasks[0];
  }

  private toLegacyClaimResult(
    task: { id: string; postId: string | null },
    comment: { id: string; content: string },
    visitorName: string,
    _message: string,
  ) {
    return {
      id: comment.id,
      commentId: comment.id,
      taskId: task.id,
      postId: task.postId || task.id,
      username: visitorName,
      content: comment.content,
      commentContent: comment.content,
      comment: { content: comment.content },
    };
  }

  private toLegacyPlatform(platform: string) {
    const normalized = this.normalizePlatform(platform);
    if (normalized === 'WECHAT_VIDEO') return 'weixin';
    if (normalized === 'XIAOHONGSHU') return 'xiaohongshu';
    return 'douyin';
  }

  private resolvePlatformHint(explicitType?: string | null, meta?: RequestMeta) {
    const direct = String(explicitType ?? '').trim();
    if (direct) return direct;
    const referer = String(meta?.referer ?? '').trim();
    if (!referer) return null;
    try {
      const url = new URL(referer);
      const type = String(url.searchParams.get('type') ?? '').trim();
      if (type) return type;
    } catch {
      // ignore invalid referer
    }
    return null;
  }

  private resolveTenantRef(explicitTenantRef?: string | null, meta?: RequestMeta) {
    const direct = String(explicitTenantRef ?? '').trim();
    if (direct) return direct;

    const metaTenantRef = String(meta?.tenantRef ?? '').trim();
    if (metaTenantRef) return metaTenantRef;

    const referer = String(meta?.referer ?? '').trim();
    if (!referer) return null;
    try {
      const url = new URL(referer);
      const tenantRef = String(url.searchParams.get('tenantsId') ?? '').trim();
      if (tenantRef) return tenantRef;
    } catch {
      // ignore invalid referer
    }
    return null;
  }

  private async ensureUniquePublicPostId(
    params: { tenantId: string; platform: string; postId?: string | null; excludeTaskId?: string },
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (!params.postId) return;
    const exists = await client.dailyTask.findFirst({
      where: {
        postId: params.postId,
        ...(params.excludeTaskId ? { id: { not: params.excludeTaskId } } : {}),
      },
      select: { id: true },
    });
    if (exists) {
      throw new BadRequestException('帖子编号已存在，请使用未占用的递增编号');
    }
  }

  private async resolvePostIdForWrite(
    params: {
      tenantId: string;
      platform: string;
      preferredPostId?: string | null;
      excludeTaskId?: string;
    },
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const preferred = String(params.preferredPostId ?? '').trim();
    if (preferred) {
      if (!this.isSequentialPostId(preferred)) {
        throw new BadRequestException('帖子编号必须是正整数递增字符串');
      }
      await this.ensureUniquePublicPostId(
        {
          tenantId: params.tenantId,
          platform: params.platform,
          postId: preferred,
          excludeTaskId: params.excludeTaskId,
        },
        client,
      );
      return preferred;
    }

    const generated = await this.generateNumericPostId(params.tenantId, params.platform, params.excludeTaskId, client);
    await this.ensureUniquePublicPostId(
      {
        tenantId: params.tenantId,
        platform: params.platform,
        postId: generated,
        excludeTaskId: params.excludeTaskId,
      },
      client,
    );
    return generated;
  }

  private async ensureNumericPostId(task: { id: string; tenantId: string; platform: string; postId: string | null }) {
    const raw = String(task.postId ?? '').trim();
    if (this.isSequentialPostId(raw)) {
      return raw;
    }
    return this.prisma.$transaction(async (tx) => {
      await this.lockDailyTaskPostIdSequence(tx);
      const generated = await this.generateNumericPostId(task.tenantId, task.platform, task.id, tx);
      await tx.dailyTask.update({
        where: { id: task.id },
        data: { postId: generated },
      });
      return generated;
    });
  }

  private async generateNumericPostId(
    _tenantId: string,
    _platform: string,
    excludeTaskId?: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const rows = await client.dailyTask.findMany({
      where: {
        ...(excludeTaskId ? { id: { not: excludeTaskId } } : {}),
      },
      select: { postId: true },
    });
    const maxValue = rows.reduce((max, item) => {
      const raw = String(item.postId ?? '').trim();
      if (!this.isSequentialPostId(raw)) return max;
      return Math.max(max, Number(raw));
    }, 0);

    for (let i = 1; i <= 20; i += 1) {
      const generated = String(maxValue + i);
      const exists = await client.dailyTask.findFirst({
        where: {
          postId: generated,
          ...(excludeTaskId ? { id: { not: excludeTaskId } } : {}),
        },
        select: { id: true },
      });
      if (!exists) return generated;
    }
    throw new ConflictException('自动生成递增帖子编号失败，请重试');
  }

  private async lockDailyTaskPostIdSequence(client: Prisma.TransactionClient) {
    await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('daily_task_post_id_sequence'))`;
  }

  private isSequentialPostId(value: string) {
    if (!/^\d+$/.test(value)) return false;
    if (value.length > 9) return false;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 1;
  }

  private async findAdminTaskByIdentifier(identifier: string, user?: CurrentUserPayload) {
    const raw = String(identifier ?? '').trim();
    const clauses: Prisma.DailyTaskWhereInput[] = [{ id: raw }];
    if (/^\d+$/.test(raw)) {
      clauses.push({ postId: raw });
    }
    const tasks = await this.prisma.dailyTask.findMany({
      where: { deletedAt: null, OR: clauses },
      include: adminTaskInclude,
      take: 2,
    });
    if (!tasks.length) {
      throw new NotFoundException('每日任务不存在');
    }
    if (tasks.length > 1 && /^\d+$/.test(raw)) {
      throw new BadRequestException('检测到重复的帖子编号，请使用唯一的帖子编号');
    }
    const task = tasks[0];
    if (user && resolveTenantId(user, task.tenantId) !== task.tenantId) {
      throw new NotFoundException('每日任务不存在');
    }
    return task;
  }

  private async createTaskWithRelations(
    tx: Prisma.TransactionClient,
    params: {
      dto: CreateDailyTaskDto;
      userId: string;
      tenantId: string;
      platform: string;
      postId: string;
      coverUrl?: string | null;
      inputComments: Array<{ content: string; source?: string; regionCode?: string | null }>;
      commissionSnapshot: TaskCommissionSnapshot;
    },
  ) {
    const resolvedVideoLinks = this.resolveTaskVideoLinks({
      videoUrls: params.dto.videoUrl,
      extraLinks: params.dto.videoLinks,
    });
    const createData: Prisma.DailyTaskUncheckedCreateInput = {
      tenantId: params.tenantId,
      mediaAccountId: params.dto.mediaAccountId,
      platform: params.platform,
      postId: params.postId,
      title: params.dto.title,
      authorName: params.dto.authorName,
      videoUrl: resolvedVideoLinks.primaryUrl,
      publishedAt: this.parseOptionalDate(params.dto.publishedAt),
      coverFileId: params.dto.coverFileId,
      coverUrl: params.coverUrl,
      copywriting: params.dto.copywriting,
      commentRequirement: params.dto.commentRequirement,
      commentExample: params.dto.commentExample,
      targetCommentCount: params.dto.targetCommentCount,
      rewardAmount: params.commissionSnapshot.workerRewardAmount,
      taskBudgetAmount: params.commissionSnapshot.taskBudgetAmount,
      status: params.dto.status ?? 'DRAFT',
      distributionScope: params.commissionSnapshot.distributionScope,
      distributionGroupId: params.commissionSnapshot.distributionGroupId,
      allowGroupCollaboration: Boolean(params.dto.allowGroupCollaboration),
      commissionEnabled: params.commissionSnapshot.commissionEnabled,
      commissionRuleId: null,
      commissionMode: params.commissionSnapshot.commissionMode,
      commissionRuleType: params.commissionSnapshot.commissionRuleType,
      commissionRuleValue: params.commissionSnapshot.commissionRuleValue,
      commissionAmount: params.commissionSnapshot.commissionAmount,
      commissionGroupId: params.commissionSnapshot.commissionGroupId,
      commissionLeaderUserId: params.commissionSnapshot.commissionLeaderUserId,
      remark: params.dto.remark,
      createdById: params.userId,
    };

    const created = await tx.dailyTask.create({ data: createData });

    await tx.dailyTaskVideoLink.createMany({
      data: resolvedVideoLinks.links.map((link) => ({
        taskId: created.id,
        url: link.url,
        isPrimary: link.isPrimary,
        sort: link.sort,
      })),
    });

    if (params.inputComments.length) {
      await tx.taskComment.createMany({
        data: params.inputComments.map((comment, index) => ({
          taskId: created.id,
          content: comment.content,
          source: comment.source ?? 'MANUAL',
          status: 'AVAILABLE',
          regionCode: comment.regionCode,
          sort: index,
        })),
      });
    }

    return created;
  }

  private isPostIdUniqueConflict(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }
    if (error.code !== 'P2002') {
      return false;
    }
    const target = Array.isArray(error.meta?.target) ? error.meta.target.map(String) : [];
    return ['tenantId', 'platform', 'postId'].every((field) => target.includes(field));
  }

  private async findPublicTaskByLink(query: PublicTaskLinkQueryDto) {
    const platform = this.normalizePlatform(query.type);
    const task = await this.prisma.dailyTask.findFirst({
      where: {
        deletedAt: null,
        platform,
        postId: query.postId,
        OR: [{ tenantId: query.tenantsId }, { tenant: { code: query.tenantsId } }],
      },
      include: { mediaAccount: true },
    });
    if (!task) {
      throw new NotFoundException('公开任务不存在');
    }
    return task;
  }

  private async findPublicTaskById(taskId: string) {
    const task = await this.prisma.dailyTask.findFirst({
      where: { id: taskId, deletedAt: null },
      include: { tenant: { select: { id: true, name: true, code: true } }, mediaAccount: true, videoLinks: { orderBy: [{ isPrimary: 'desc' }, { sort: 'asc' }] } },
    });
    if (!task) {
      throw new NotFoundException('公开任务不存在');
    }
    return task;
  }

  private async findPublicTaskByPostId(postId: string, meta?: RequestMeta) {
    const trimmedPostId = String(postId ?? '').trim();
    if (!trimmedPostId) {
      throw new NotFoundException('公开任务不存在');
    }

    const tenantRef = this.resolveTenantRef(undefined, meta);
    const platformHint = this.resolvePlatformHint(undefined, meta);
    if (tenantRef || platformHint) {
      return this.findLegacyPublicTask({
        tenantRef,
        postId: trimmedPostId,
        platformHint,
      });
    }

    const tasks = await this.prisma.dailyTask.findMany({
      where: {
        deletedAt: null,
        postId: trimmedPostId,
      },
      include: { mediaAccount: true },
      take: 2,
    });
    if (!tasks.length) {
      throw new NotFoundException('公开任务不存在');
    }
    if (tasks.length > 1) {
      throw new BadRequestException('存在多个同 postId 任务，请在链接中补充 tenantsId/type');
    }
    return tasks[0];
  }

  private async getOrCreateParticipant(
    taskId: string,
    visitorToken: string | undefined,
    payload: {
      visitorName?: string;
      phone?: string;
      uploadedImageFileId?: string;
      uploadedImageUrl?: string;
      appUserId?: string | null;
      sourcePlatform?: string;
      ip?: string | null;
      userAgent?: string | string[] | null;
    },
  ) {
    const now = new Date();
    if (visitorToken) {
      const existing = await this.prisma.taskParticipant.findFirst({ where: { taskId, visitorToken } });
      if (existing) {
        const shouldReuseExistingToken = await this.shouldReuseParticipantByToken(taskId, existing, payload);
        if (!shouldReuseExistingToken) {
          return this.prisma.taskParticipant.create({
            data: {
              taskId,
              visitorToken: this.generateVisitorToken(),
              appUserId: payload.appUserId || undefined,
              visitorName: payload.visitorName,
              phone: payload.phone,
              uploadedImageFileId: payload.uploadedImageFileId,
              uploadedImageUrl: payload.uploadedImageUrl,
              status: 'STARTED',
              sourcePlatform: payload.sourcePlatform ?? 'H5',
              ip: this.normalizeText(payload.ip),
              userAgent: this.normalizeText(payload.userAgent),
              startedAt: now,
              lastActiveAt: now,
            },
          });
        }
        return this.prisma.taskParticipant.update({
          where: { id: existing.id },
          data: {
            appUserId: payload.appUserId ?? existing.appUserId,
            visitorName: payload.visitorName ?? existing.visitorName,
            phone: payload.phone ?? existing.phone,
            uploadedImageFileId: payload.uploadedImageFileId ?? existing.uploadedImageFileId,
            uploadedImageUrl: payload.uploadedImageUrl ?? existing.uploadedImageUrl,
            sourcePlatform: payload.sourcePlatform ?? existing.sourcePlatform ?? 'H5',
            startedAt: existing.startedAt ?? now,
            lastActiveAt: now,
            ip: this.normalizeText(payload.ip),
            userAgent: this.normalizeText(payload.userAgent),
          },
        });
      }
    }

    const reusable = await this.findReusablePendingParticipant(taskId, payload);
    if (reusable) {
      return this.prisma.taskParticipant.update({
        where: { id: reusable.id },
        data: {
          appUserId: payload.appUserId ?? reusable.appUserId,
          visitorName: payload.visitorName ?? reusable.visitorName,
          phone: payload.phone ?? reusable.phone,
          uploadedImageFileId: payload.uploadedImageFileId ?? reusable.uploadedImageFileId,
          uploadedImageUrl: payload.uploadedImageUrl ?? reusable.uploadedImageUrl,
          sourcePlatform: payload.sourcePlatform ?? reusable.sourcePlatform ?? 'H5',
          startedAt: reusable.startedAt ?? now,
          lastActiveAt: now,
          ip: this.normalizeText(payload.ip),
          userAgent: this.normalizeText(payload.userAgent),
        },
      });
    }

    return this.prisma.taskParticipant.create({
      data: {
        taskId,
        visitorToken: this.generateVisitorToken(),
        appUserId: payload.appUserId || undefined,
        visitorName: payload.visitorName,
        phone: payload.phone,
        uploadedImageFileId: payload.uploadedImageFileId,
        uploadedImageUrl: payload.uploadedImageUrl,
        status: 'STARTED',
        sourcePlatform: payload.sourcePlatform ?? 'H5',
        ip: this.normalizeText(payload.ip),
        userAgent: this.normalizeText(payload.userAgent),
        startedAt: now,
        lastActiveAt: now,
      },
    });
  }

  private async shouldReuseParticipantByToken(
    taskId: string,
    participant: {
      id: string;
      status: string;
      visitorName: string | null;
      phone: string | null;
    },
    payload: {
      visitorName?: string;
      phone?: string;
    },
  ) {
    const normalizedName = this.normalizeClaimIdentity(payload.visitorName);
    const normalizedPhone = this.normalizePhone(payload.phone);
    if (!normalizedName && !normalizedPhone) {
      return true;
    }

    const existingName = this.normalizeClaimIdentity(participant.visitorName);
    const existingPhone = this.normalizePhone(participant.phone);
    const hasStoredIdentity = Boolean(existingName || existingPhone);
    if (!hasStoredIdentity) {
      return true;
    }

    const sameName = normalizedName && existingName === normalizedName;
    const samePhone = normalizedPhone && existingPhone === normalizedPhone;
    if (sameName || samePhone) {
      return true;
    }

    const latestComment = await this.findLatestParticipantComment(taskId, participant.id);
    if (latestComment || ['CLAIMED', 'COMPLETED'].includes(participant.status)) {
      return false;
    }

    return participant.status === 'STARTED';
  }

  private async findReusablePendingParticipant(
    taskId: string,
    payload: {
      visitorName?: string;
      phone?: string;
      uploadedImageFileId?: string;
      uploadedImageUrl?: string;
      appUserId?: string | null;
      sourcePlatform?: string;
      ip?: string | null;
      userAgent?: string | string[] | null;
    },
  ) {
    const normalizedPhone = this.normalizePhone(payload.phone);
    const normalizedIp = this.normalizeText(payload.ip);
    const normalizedUserAgent = this.normalizeText(payload.userAgent);
    const normalizedSourcePlatform = String(payload.sourcePlatform ?? '').trim();

    if (!normalizedPhone && !normalizedIp && !normalizedUserAgent) {
      return null;
    }

    const candidates = await this.prisma.taskParticipant.findMany({
      where: {
        taskId,
        status: 'STARTED',
        comments: { none: { status: { in: ['CLAIMED', 'COMPLETED'] } } },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 20,
      select: {
        id: true,
        visitorName: true,
        phone: true,
        appUserId: true,
        uploadedImageFileId: true,
        uploadedImageUrl: true,
        sourcePlatform: true,
        startedAt: true,
        ip: true,
        userAgent: true,
      },
    });

    return (
      candidates.find((candidate) => {
        const samePhone = normalizedPhone && this.normalizePhone(candidate.phone) === normalizedPhone;
        if (samePhone) {
          return true;
        }

        if (!normalizedIp && !normalizedUserAgent) {
          return false;
        }

        const sameIp = normalizedIp ? candidate.ip === normalizedIp : true;
        const sameUserAgent = normalizedUserAgent ? candidate.userAgent === normalizedUserAgent : true;
        const sameSourcePlatform = normalizedSourcePlatform ? candidate.sourcePlatform === normalizedSourcePlatform : true;
        return sameIp && sameUserAgent && sameSourcePlatform;
      }) ?? null
    );
  }

  private async findParticipantByToken(taskId: string, visitorToken: string) {
    return this.prisma.taskParticipant.findFirst({ where: { taskId, visitorToken } });
  }

  private async findLatestParticipantComment(taskId: string, participantId: string) {
    return this.prisma.taskComment.findFirst({
      where: { taskId, participantId, status: { in: ['CLAIMED', 'COMPLETED'] } },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async assertPublicClaimIdentityAvailable(
    taskId: string,
    identity: { visitorName?: string | null; phone?: string | null },
    excludeParticipantId?: string,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const conflict = await this.findConflictingPublicParticipant(taskId, identity, excludeParticipantId, db);
    if (conflict) {
      throw new ConflictException(this.getPublicClaimIdentityConflictMessage(identity, conflict));
    }
  }

  private async findConflictingPublicParticipant(
    taskId: string,
    identity: { visitorName?: string | null; phone?: string | null },
    excludeParticipantId?: string,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const normalizedName = this.normalizeClaimIdentity(identity.visitorName);
    const normalizedPhone = this.normalizePhone(identity.phone);
    if (!normalizedName && !normalizedPhone) {
      return null;
    }

    const participants = await db.taskParticipant.findMany({
      where: {
        taskId,
        ...(excludeParticipantId ? { id: { not: excludeParticipantId } } : {}),
        OR: [{ status: { in: ['CLAIMED', 'COMPLETED'] } }, { comments: { some: { status: { in: ['CLAIMED', 'COMPLETED'] } } } }],
      },
      select: {
        id: true,
        visitorName: true,
        phone: true,
      },
    });

    return (
      participants.find((participant) => {
        const sameName = normalizedName && this.normalizeClaimIdentity(participant.visitorName) === normalizedName;
        const samePhone = normalizedPhone && this.normalizePhone(participant.phone) === normalizedPhone;
        return Boolean(sameName || samePhone);
      }) ?? null
    );
  }

  private async touchParticipant(
    participantId: string,
    payload: { visitorName?: string; phone?: string; uploadedImageFileId?: string; uploadedImageUrl?: string; status?: string },
    meta: RequestMeta,
  ) {
    const now = new Date();
    return this.prisma.taskParticipant.update({
      where: { id: participantId },
      data: {
        ...(payload.visitorName !== undefined ? { visitorName: payload.visitorName } : {}),
        ...(payload.phone !== undefined ? { phone: payload.phone } : {}),
        ...(payload.uploadedImageFileId !== undefined ? { uploadedImageFileId: payload.uploadedImageFileId } : {}),
        ...(payload.uploadedImageUrl !== undefined ? { uploadedImageUrl: payload.uploadedImageUrl } : {}),
        ...(payload.status ? { status: payload.status } : {}),
        lastActiveAt: now,
        ip: this.normalizeText(meta.ip),
        userAgent: this.normalizeText(meta.userAgent),
      },
    });
  }

  private isExactClaimIdentityMatch(
    participant: { visitorName?: string | null; phone?: string | null },
    identity: { visitorName?: string | null; phone?: string | null },
  ) {
    const normalizedName = this.normalizeClaimIdentity(identity.visitorName);
    const normalizedPhone = this.normalizePhone(identity.phone);
    return (
      Boolean(normalizedName) &&
      Boolean(normalizedPhone) &&
      this.normalizeClaimIdentity(participant.visitorName) === normalizedName &&
      this.normalizePhone(participant.phone) === normalizedPhone
    );
  }

  private getPublicClaimIdentityConflictMessage(
    identity: { visitorName?: string | null; phone?: string | null },
    participant: { visitorName?: string | null; phone?: string | null },
  ) {
    const normalizedName = this.normalizeClaimIdentity(identity.visitorName);
    const normalizedPhone = this.normalizePhone(identity.phone);
    const sameName = normalizedName && this.normalizeClaimIdentity(participant.visitorName) === normalizedName;
    const samePhone = normalizedPhone && this.normalizePhone(participant.phone) === normalizedPhone;
    if (samePhone && !sameName) {
      return '当前手机号已领取过评论，请更换手机号';
    }
    if (sameName && !samePhone) {
      return '当前姓名已领取过评论，请更换姓名';
    }
    return '同一姓名和手机号在当前帖子下只能领取一次';
  }

  private toProgressCard(task: { targetCommentCount: number; claimedCommentCount: number; completedCommentCount: number }) {
    return {
      targetCommentCount: task.targetCommentCount,
      claimedCommentCount: task.claimedCommentCount,
      completedCommentCount: task.completedCommentCount,
      completionRate: task.targetCommentCount ? Number(((task.completedCommentCount / task.targetCommentCount) * 100).toFixed(2)) : 0,
    };
  }

  private toVisitorState(
    visitor: {
      visitorToken: string;
      visitorName: string | null;
      phone: string | null;
      uploadedImageUrl: string | null;
      status: string;
      claimedAt: Date | null;
      completedAt: Date | null;
    } | null,
    currentComment: { id: string; content: string } | null,
    proofImageUrls: string[],
  ) {
    if (!visitor) {
      return {
        visitorToken: null,
        visitorName: null,
        phone: null,
        uploadedImageUrl: null,
        proofImageUrls: [],
        status: 'NOT_STARTED',
        currentStep: 'STEP_1_START',
        currentCommentId: null,
        currentCommentContent: null,
        claimedAt: null,
        completedAt: null,
      };
    }

    return {
      visitorToken: visitor.visitorToken,
      visitorName: visitor.visitorName,
      phone: visitor.phone,
      uploadedImageUrl: proofImageUrls[0] ?? visitor.uploadedImageUrl,
      proofImageUrls,
      status: visitor.status,
      currentStep: this.getNextStep(visitor.status),
      currentCommentId: currentComment?.id ?? null,
      currentCommentContent: currentComment?.content ?? null,
      claimedAt: visitor.claimedAt,
      completedAt: visitor.completedAt,
    };
  }


  async listDistributionGroups(query: AdminDistributionGroupQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query);
    // 平台管理员在未选择租户时查询全部团长组；租户管理员仍只能看到本租户。
    const requestedTenantId = String(query.tenantId ?? '').trim();
    const tenantId = isPlatformUser(user) ? requestedTenantId || undefined : resolveTenantId(user, requestedTenantId);
    const keyword = String(query.keyword ?? '').trim();
    const explicitIds = this.parseScopeIds(query.ids, '团长档案');
    const where: Prisma.DistributionGroupWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      ...(explicitIds.length ? { id: { in: explicitIds } } : {}),
      ...(query.includeDeleted ? {} : { deletedAt: null }),
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword, mode: 'insensitive' } },
              { leaderName: { contains: keyword, mode: 'insensitive' } },
              { leaderPhone: { contains: keyword, mode: 'insensitive' } },
              { memberInviteCode: { contains: keyword, mode: 'insensitive' } },
              { leaderBindCode: { contains: keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.distributionGroup.findMany({ where, skip, take, orderBy: [{ createdAt: 'desc' }] }),
      this.prisma.distributionGroup.count({ where }),
    ]);
    const tenantIds = Array.from(new Set(items.map((item) => item.tenantId).filter(Boolean)));
    const tenants = tenantIds.length ? await this.prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true, code: true } }) : [];
    const tenantMap = new Map(tenants.map((item) => [item.id, item]));
    const groupIds = items.map((item) => item.id);
    const [memberCounts, taskCounts] = groupIds.length
      ? await Promise.all([
          this.prisma.distributionUserBinding.groupBy({ by: ['groupId'], where: { groupId: { in: groupIds }, status: 'ENABLED', bindSource: 'INVITE' }, _count: { _all: true } }),
          this.prisma.dailyTask.groupBy({ by: ['distributionGroupId'], where: { distributionGroupId: { in: groupIds }, deletedAt: null }, _count: { _all: true } }),
        ])
      : [[], []];
    const memberCountMap = new Map(memberCounts.map((item) => [item.groupId, item._count._all]));
    const taskCountMap = new Map(taskCounts.map((item) => [item.distributionGroupId || '', item._count._all]));
    return {
      items: items.map((item) => ({
        ...item,
        tenant: tenantMap.get(item.tenantId) || null,
        memberCount: memberCountMap.get(item.id) || 0,
        taskCount: taskCountMap.get(item.id) || 0,
        memberInviteUrl: this.buildDistributionInviteUrl('invite', item.memberInviteCode),
        leaderBindUrl: this.buildDistributionInviteUrl('leaderCode', item.leaderBindCode),
      })),
      page,
      pageSize,
      total,
    };
  }

  async createDistributionGroup(dto: AdminCreateDistributionGroupDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    await this.ensureTenantExists(tenantId);
    const memberInviteCode = await this.resolveDistributionCodeForCreate('member', dto.memberInviteCode);
    const leaderBindCode = await this.resolveDistributionCodeForCreate('leader', dto.leaderBindCode);
    const group = await this.prisma.distributionGroup.create({
      data: {
        id: this.generateCuidLike('dg'),
        tenantId,
        name: String(dto.name).trim(),
        leaderName: this.normalizeText(dto.leaderName),
        leaderPhone: this.normalizePhone(dto.leaderPhone),
        memberInviteCode,
        leaderBindCode,
        isTestData: Boolean(dto.isTestData),
        ...this.resolveDistributionGroupCommissionConfig(dto),
        remark: this.normalizeText(dto.remark),
        createdById: user.id,
      },
    });
    return {
      ...group,
      memberInviteUrl: this.buildDistributionInviteUrl('invite', group.memberInviteCode),
      leaderBindUrl: this.buildDistributionInviteUrl('leaderCode', group.leaderBindCode),
    };
  }

  /**
   * H5 申请团长。申请必须依附当前所在团队，从而确保审核记录有明确租户归属。
   */
  async applyDistributionLeader(dto: DistributionLeaderApplicationDto, authorization?: string) {
    const appUser = await this.requireDistributionAppUser(authorization);
    const [binding, leaderGroup, pendingApplication] = await Promise.all([
      this.prisma.distributionUserBinding.findFirst({
        where: { userId: appUser.id, status: 'ENABLED' },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.distributionGroup.findFirst({
        where: { leaderUserId: appUser.id, status: { in: ['ENABLED', 'DISABLED'] }, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.distributionLeaderApplication.findFirst({
        where: { appUserId: appUser.id, status: 'PENDING' },
        select: { id: true },
      }),
    ]);
    if (leaderGroup) throw new ConflictException('当前账号已经是团长，无需重复申请');
    if (!binding) throw new BadRequestException('请先使用邀请码加入一个团队后再申请成为团长');
    if (pendingApplication) throw new ConflictException('你已有一条团长申请正在审核，请耐心等待');
    const requestedGroupName = String(dto.requestedGroupName || '').trim();
    if (!requestedGroupName) throw new BadRequestException('团队名称不能为空');

    return this.prisma.distributionLeaderApplication.create({
      data: {
        id: this.generateCuidLike('dla'),
        tenantId: binding.tenantId,
        appUserId: appUser.id,
        currentGroupId: binding.groupId,
        requestedGroupName,
        reason: this.normalizeText(dto.reason),
        status: 'PENDING',
      },
      select: {
        id: true,
        status: true,
        requestedGroupName: true,
        reason: true,
        createdAt: true,
      },
    });
  }

  async listDistributionLeaderApplications(query: AdminLeaderApplicationQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query);
    const requestedTenantId = String(query.tenantId ?? '').trim();
    const tenantId = isPlatformUser(user) ? requestedTenantId || undefined : resolveTenantId(user, requestedTenantId);
    const keyword = String(query.keyword ?? '').trim();
    const matchedUsers = keyword
      ? await this.prisma.appUser.findMany({
          where: {
            deletedAt: null,
            OR: [
              { nickname: { contains: keyword, mode: 'insensitive' } },
              { phone: { contains: keyword, mode: 'insensitive' } },
            ],
          },
          select: { id: true },
          take: 500,
        })
      : [];
    const matchedUserIds = matchedUsers.map((item) => item.id);
    const where: Prisma.DistributionLeaderApplicationWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(keyword
        ? {
            OR: [
              { requestedGroupName: { contains: keyword, mode: 'insensitive' } },
              ...(matchedUserIds.length ? [{ appUserId: { in: matchedUserIds } }] : []),
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.distributionLeaderApplication.findMany({ where, skip, take, orderBy: [{ createdAt: 'desc' }] }),
      this.prisma.distributionLeaderApplication.count({ where }),
    ]);
    const appUserIds = Array.from(new Set(items.map((item) => item.appUserId).filter(Boolean)));
    const groupIds = Array.from(
      new Set(
        items
          .flatMap((item) => [item.currentGroupId, item.groupId])
          .filter((item): item is string => Boolean(item)),
      ),
    );
    const tenantIds = Array.from(
      new Set(items.map((item) => item.tenantId).filter((item): item is string => Boolean(item))),
    );
    const reviewerIds = Array.from(
      new Set(items.map((item) => item.reviewedById).filter((item): item is string => Boolean(item))),
    );
    const [appUsers, groups, tenants, reviewers] = await Promise.all([
      appUserIds.length
        ? this.prisma.appUser.findMany({
            where: { id: { in: appUserIds } },
            select: { id: true, nickname: true, phone: true, createdAt: true },
          })
        : [],
      groupIds.length
        ? this.prisma.distributionGroup.findMany({
            where: { id: { in: groupIds } },
            select: { id: true, name: true, tenantId: true },
          })
        : [],
      tenantIds.length
        ? this.prisma.tenant.findMany({
            where: { id: { in: tenantIds } },
            select: { id: true, name: true, code: true },
          })
        : [],
      reviewerIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: reviewerIds } },
            select: { id: true, username: true, displayName: true },
          })
        : [],
    ]);
    const appUserMap = new Map(appUsers.map((item) => [item.id, item]));
    const groupMap = new Map(groups.map((item) => [item.id, item]));
    const tenantMap = new Map(tenants.map((item) => [item.id, item]));
    const reviewerMap = new Map(reviewers.map((item) => [item.id, item]));
    return {
      items: items.map((item) => ({
        ...item,
        appUser: appUserMap.get(item.appUserId) || null,
        tenant: item.tenantId ? tenantMap.get(item.tenantId) || null : null,
        currentGroup: item.currentGroupId ? groupMap.get(item.currentGroupId) || null : null,
        group: item.groupId ? groupMap.get(item.groupId) || null : null,
        reviewer: item.reviewedById ? reviewerMap.get(item.reviewedById) || null : null,
      })),
      page,
      pageSize,
      total,
    };
  }

  async approveDistributionLeaderApplication(
    id: string,
    dto: AdminApproveLeaderApplicationDto,
    user: CurrentUserPayload,
  ) {
    const tenantScope = resolveVisibleTenantId(user);
    const application = await this.prisma.distributionLeaderApplication.findFirst({
      where: { id, ...(tenantScope ? { tenantId: tenantScope } : {}) },
    });
    if (!application) throw new NotFoundException('团长申请不存在');
    if (application.status !== 'PENDING') throw new BadRequestException('该申请已处理，不能重复审核');

    const appUser = await this.prisma.appUser.findFirst({
      where: { id: application.appUserId, deletedAt: null },
    });
    if (!appUser) throw new NotFoundException('申请用户不存在或已注销');
    const phone = this.normalizePhone(appUser.phone);
    if (!this.isValidNormalizedPhone(phone)) throw new BadRequestException('申请用户尚未完善手机号，不能升级为团长');
    const existingLeader = await this.prisma.distributionGroup.findFirst({
      where: { leaderUserId: appUser.id, status: { in: ['ENABLED', 'DISABLED'] }, deletedAt: null },
      select: { id: true },
    });
    if (existingLeader) throw new ConflictException('该 H5 用户已经是团长');

    const tenantId = String(application.tenantId || '').trim();
    if (!tenantId) throw new BadRequestException('申请缺少所属租户，无法审核通过');
    await this.ensureTenantExists(tenantId);
    const memberInviteCode = await this.resolveDistributionCodeForCreate('member');
    const leaderBindCode = await this.resolveDistributionCodeForCreate('leader');
    const commissionConfig = this.resolveDistributionGroupCommissionConfig(dto);
    const groupName = String(dto.groupName || application.requestedGroupName || '').trim();
    if (!groupName) throw new BadRequestException('团长团队名称不能为空');

    const result = await this.prisma.$transaction(async (tx) => {
      const group = await tx.distributionGroup.create({
        data: {
          id: this.generateCuidLike('dg'),
          tenantId,
          name: groupName,
          leaderName: appUser.nickname || `用户${phone.slice(-4)}`,
          leaderPhone: phone,
          leaderUserId: appUser.id,
          memberInviteCode,
          leaderBindCode,
          isTestData: Boolean(dto.isTestData),
          ...commissionConfig,
          remark: 'H5 自主申请，PC 审核通过创建',
          createdById: user.id,
        },
      });

      await tx.distributionUserBinding.updateMany({
        where: { userId: appUser.id, status: 'ENABLED' },
        data: { status: 'DISABLED', unbindAt: new Date() },
      });
      await tx.distributionTaskAccount.updateMany({
        where: { userId: appUser.id },
        data: { isDefault: false },
      });
      const existingAccount = await tx.distributionTaskAccount.findFirst({
        where: { userId: appUser.id, phone },
        orderBy: [{ updatedAt: 'desc' }],
      });
      const taskAccount = existingAccount
        ? await tx.distributionTaskAccount.update({
            where: { id: existingAccount.id },
            data: {
              tenantId,
              groupId: group.id,
              nickname: appUser.nickname || existingAccount.nickname,
              status: 'ENABLED',
              isDefault: true,
              smsVerified: true,
            },
          })
        : await tx.distributionTaskAccount.create({
            data: {
              id: this.generateCuidLike('dta'),
              userId: appUser.id,
              tenantId,
              groupId: group.id,
              phone,
              nickname: appUser.nickname || `用户${phone.slice(-4)}`,
              smsVerified: true,
              status: 'ENABLED',
              isDefault: true,
            },
          });
      await tx.distributionUserBinding.create({
        data: {
          id: this.generateCuidLike('dub'),
          userId: appUser.id,
          tenantId,
          groupId: group.id,
          status: 'ENABLED',
          bindSource: 'LEADER_APPLICATION',
          inviteCode: leaderBindCode,
        },
      });
      const updatedGroup = await tx.distributionGroup.update({
        where: { id: group.id },
        data: { leaderTaskAccountId: taskAccount.id },
      });
      const updatedApplication = await tx.distributionLeaderApplication.update({
        where: { id: application.id },
        data: {
          status: 'APPROVED',
          groupId: group.id,
          reviewedById: user.id,
          reviewedAt: new Date(),
          reviewRemark: this.normalizeText(dto.reviewRemark),
        },
      });
      return { group: updatedGroup, application: updatedApplication };
    });

    return {
      ...result,
      memberInviteUrl: this.buildDistributionInviteUrl('invite', result.group.memberInviteCode),
      leaderBindUrl: this.buildDistributionInviteUrl('leaderCode', result.group.leaderBindCode),
    };
  }

  async rejectDistributionLeaderApplication(id: string, dto: AdminRejectLeaderApplicationDto, user: CurrentUserPayload) {
    const tenantScope = resolveVisibleTenantId(user);
    const application = await this.prisma.distributionLeaderApplication.findFirst({
      where: { id, ...(tenantScope ? { tenantId: tenantScope } : {}) },
      select: { id: true, status: true },
    });
    if (!application) throw new NotFoundException('团长申请不存在');
    if (application.status !== 'PENDING') throw new BadRequestException('该申请已处理，不能重复审核');
    return this.prisma.distributionLeaderApplication.update({
      where: { id: application.id },
      data: {
        status: 'REJECTED',
        reviewRemark: String(dto.reviewRemark || '').trim(),
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
    });
  }

  async updateDistributionGroupCommissionConfig(
    id: string,
    dto: AdminUpdateDistributionGroupCommissionDto,
    user: CurrentUserPayload,
  ) {
    const group = await this.requireAdminDistributionGroup(id, user);
    this.assertDistributionGroupOperational(group);
    return this.prisma.distributionGroup.update({
      where: { id: group.id },
      data: this.resolveDistributionGroupCommissionConfig(dto),
    });
  }

  async listLeaderCommissionSettlements(query: AdminLeaderCommissionSettlementQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query);
    const requestedTenantId = String(query.tenantId ?? '').trim();
    const tenantId = isPlatformUser(user) ? requestedTenantId || undefined : resolveTenantId(user, requestedTenantId);
    const keyword = String(query.keyword ?? '').trim();
    const baseWhere: Prisma.LeaderCommissionSettlementWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      ...(query.groupId ? { groupId: query.groupId } : {}),
    };

    let where: Prisma.LeaderCommissionSettlementWhereInput = baseWhere;
    if (keyword) {
      const [matchedUsers, matchedGroups, matchedTasks] = await Promise.all([
        this.prisma.appUser.findMany({
          where: {
            deletedAt: null,
            OR: [
              { nickname: { contains: keyword, mode: 'insensitive' } },
              { phone: { contains: keyword, mode: 'insensitive' } },
            ],
          },
          select: { id: true },
          take: 500,
        }),
        this.prisma.distributionGroup.findMany({
          where: { ...(tenantId ? { tenantId } : {}), name: { contains: keyword, mode: 'insensitive' } },
          select: { id: true },
          take: 500,
        }),
        this.prisma.dailyTask.findMany({
          where: { ...(tenantId ? { tenantId } : {}), title: { contains: keyword, mode: 'insensitive' } },
          select: { id: true },
          take: 500,
        }),
      ]);
      const userIds = matchedUsers.map((item) => item.id);
      const groupIds = matchedGroups.map((item) => item.id);
      const taskIds = matchedTasks.map((item) => item.id);
      const keywordOr: Prisma.LeaderCommissionSettlementWhereInput[] = [
        ...(userIds.length ? [{ leaderUserId: { in: userIds } }, { workerUserId: { in: userIds } }] : []),
        ...(groupIds.length ? [{ groupId: { in: groupIds } }] : []),
        ...(taskIds.length ? [{ taskId: { in: taskIds } }] : []),
      ];
      if (!keywordOr.length) {
        return { items: [], page, pageSize, total: 0 };
      }
      where = { ...baseWhere, OR: keywordOr };
    }

    const [items, total] = await Promise.all([
      this.prisma.leaderCommissionSettlement.findMany({ where, skip, take, orderBy: [{ settledAt: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.leaderCommissionSettlement.count({ where }),
    ]);
    const userIds = Array.from(
      new Set(items.flatMap((item) => [item.leaderUserId, item.workerUserId]).filter((item): item is string => Boolean(item))),
    );
    const groupIds = Array.from(new Set(items.map((item) => item.groupId)));
    const taskIds = Array.from(new Set(items.map((item) => item.taskId)));
    const [users, groups, tasks] = await Promise.all([
      userIds.length
        ? this.prisma.appUser.findMany({ where: { id: { in: userIds } }, select: { id: true, nickname: true, phone: true } })
        : [],
      groupIds.length
        ? this.prisma.distributionGroup.findMany({ where: { id: { in: groupIds } }, select: { id: true, name: true } })
        : [],
      taskIds.length
        ? this.prisma.dailyTask.findMany({ where: { id: { in: taskIds } }, select: { id: true, title: true } })
        : [],
    ]);
    const userMap = new Map(users.map((item) => [item.id, item]));
    const groupMap = new Map(groups.map((item) => [item.id, item]));
    const taskMap = new Map(tasks.map((item) => [item.id, item]));
    return {
      items: items.map((item) => ({
        ...item,
        leader: userMap.get(item.leaderUserId) || null,
        worker: item.workerUserId ? userMap.get(item.workerUserId) || null : null,
        group: groupMap.get(item.groupId) || null,
        task: taskMap.get(item.taskId) || null,
      })),
      page,
      pageSize,
      total,
    };
  }

  async getDistributionGroupUnbindCheck(id: string, user: CurrentUserPayload) {
    const group = await this.requireAdminDistributionGroup(id, user);
    return this.buildDistributionGroupUnbindCheck(group);
  }

  async getDistributionGroupTestResetPreview(id: string, user: CurrentUserPayload) {
    const group = await this.requireAdminDistributionGroup(id, user);
    return this.buildDistributionGroupTestResetPreview(group);
  }


  async getDistributionGroupForceUnbindDeletePreview(id: string, user: CurrentUserPayload) {
    const group = await this.requireAdminDistributionGroup(id, user);
    return this.buildDistributionGroupForceUnbindDeletePlan(this.prisma, group.id);
  }

  /**
   * 测试团长的管理员强制出口。
   * 与普通解绑刻意分离：普通解绑保留历史并要求业务收口；本方法只允许明确标记的测试团长，
   * 会在同一事务中清理直接关联任务/订单/佣金/账户资金记录、解绑成员并逻辑删除团长档案。
   */
  async forceUnbindDeleteDistributionGroupTestData(
    id: string,
    dto: AdminForceUnbindDeleteDistributionGroupDto,
    user: CurrentUserPayload,
  ) {
    const group = await this.requireAdminDistributionGroup(id, user);
    this.assertDistributionTestDataPurgeEnabled();
    if (!group.isTestData) throw new BadRequestException('当前团长未标记为测试数据，禁止强制解绑删除');
    if (!['ENABLED', 'DISABLED'].includes(String(group.status || '')) || group.deletedAt) {
      throw new BadRequestException('当前团长已解绑、已删除或正在处理，不能执行强制解绑删除');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`distribution_group_force_unbind_delete:${group.id}`}))`;
      const current = await tx.distributionGroup.findFirst({
        where: { id: group.id, tenantId: group.tenantId, deletedAt: null, isTestData: true },
        select: { id: true, tenantId: true, name: true, status: true, leaderUserId: true, remark: true },
      });
      if (!current || !['ENABLED', 'DISABLED'].includes(current.status)) {
        throw new ConflictException('测试团长状态已变化，请刷新后重试');
      }

      const plan = await this.buildDistributionGroupForceUnbindDeletePlan(tx, current.id);
      if (!plan.canForceUnbindDelete) {
        throw new BadRequestException(`当前测试团长不能强制清理：${plan.blockers.join('；')}`);
      }
      if (String(dto.confirmForceText || '').trim() !== plan.confirmForceText) {
        throw new BadRequestException(`确认文本不匹配，请输入“${plan.confirmForceText}”`);
      }

      const now = new Date();
      const lock = await tx.distributionGroup.updateMany({
        where: { id: current.id, status: current.status, deletedAt: null, isTestData: true },
        data: { status: 'RESETTING', disabledAt: now },
      });
      if (!lock.count) throw new ConflictException('团长状态已变化，请刷新后重试');

      const taskIds = plan.scopeTaskIds;
      const participantIds = plan.scopeParticipantIds;
      const userIds = plan.scopeUserIds;

      if (taskIds.length) {
        await tx.fileUsage.deleteMany({ where: { bizType: 'DAILY_TASK', bizId: { in: taskIds } } });
        await tx.taskAbandonLog.deleteMany({ where: { taskId: { in: taskIds } } });
      }
      if (participantIds.length) {
        await tx.fileUsage.deleteMany({ where: { bizType: 'TASK_PARTICIPANT', bizId: { in: participantIds } } });
      }
      if (taskIds.length || participantIds.length) {
        await tx.leaderCommissionSettlement.deleteMany({
          where: {
            OR: [
              ...(taskIds.length ? [{ taskId: { in: taskIds } }] : []),
              ...(participantIds.length ? [{ participantId: { in: participantIds } }] : []),
            ],
          },
        });
      }

      // 测试团长强制删除的语义是：本预演直接列出的专用测试账号完整回到零状态。
      // 提现与人工调账无任务外键，故按账号范围删除并重置财务统计，避免残余余额与流水不一致。
      if (userIds.length) {
        await tx.appUserWalletLedger.deleteMany({ where: { appUserId: { in: userIds } } });
        await tx.appUserWithdrawal.deleteMany({ where: { appUserId: { in: userIds } } });
      }
      if (taskIds.length) {
        await tx.dailyTask.deleteMany({ where: { id: { in: taskIds }, tenantId: current.tenantId } });
      }
      if (userIds.length) {
        await tx.appUser.updateMany({
          where: { id: { in: userIds } },
          data: { balanceAmount: 0, totalSettledAmount: 0, totalCompletedOrders: 0, withdrawnAmount: 0 },
        });
      }

      await tx.distributionUserBinding.updateMany({
        where: { groupId: current.id, status: 'ENABLED' },
        data: { status: 'DISABLED', unbindAt: now },
      });
      await tx.distributionTaskAccount.updateMany({
        where: { groupId: current.id },
        data: { status: 'DISABLED', isDefault: false },
      });
      const updated = await tx.distributionGroup.update({
        where: { id: current.id },
        data: {
          status: 'DELETED',
          deletedAt: now,
          deletedById: user.id,
          disabledAt: now,
          leaderUnboundAt: now,
          leaderUnboundById: user.id,
          leaderUserId: null,
          leaderTaskAccountId: null,
          commissionEnabled: false,
          commissionRuleType: null,
          commissionRuleValue: null,
          testResetAt: now,
          testResetById: user.id,
          remark: this.appendDistributionGroupRemark(current.remark, `管理员强制解绑并删除测试团长：${dto.reason?.trim() || '未填写原因'}；${now.toISOString()}`),
        },
      });

      await tx.operationLog.create({
        data: {
          operatorId: user.id,
          tenantId: current.tenantId,
          module: 'DISTRIBUTION_GROUP',
          action: 'ADMIN_FORCE_UNBIND_DELETE_TEST_DATA',
          bizId: current.id,
          description: `管理员强制解绑并删除测试团长“${current.name}”`,
          beforeData: {
            groupId: current.id,
            groupName: current.name,
            status: current.status,
            taskIds,
            participantIds,
            userIds,
            confirmForceText: plan.confirmForceText,
          },
          afterData: {
            status: updated.status,
            deletedAt: updated.deletedAt?.toISOString() || null,
            deletedTaskCount: taskIds.length,
            deletedParticipantCount: participantIds.length,
            resetTestAccountCount: userIds.length,
            deletedCommissionSettlementCount: plan.commissionSettlementCount,
            deletedWalletLedgerCount: plan.walletLedgerCount,
            deletedWithdrawalCount: plan.withdrawalCount,
          },
        },
      });

      return {
        success: true,
        mode: 'ADMIN_FORCE_UNBIND_DELETE_TEST_GROUP',
        deletedGroupId: current.id,
        deletedTaskCount: taskIds.length,
        deletedParticipantCount: participantIds.length,
        deletedCommissionSettlementCount: plan.commissionSettlementCount,
        deletedWalletLedgerCount: plan.walletLedgerCount,
        deletedWithdrawalCount: plan.withdrawalCount,
        resetTestAccountCount: userIds.length,
      };
    }, {
      maxWait: 5_000,
      timeout: 45_000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  async unbindDistributionGroupLeader(
    id: string,
    dto: AdminUnbindDistributionGroupLeaderDto,
    user: CurrentUserPayload,
  ) {
    const group = await this.requireAdminDistributionGroup(id, user);
    if (group.deletedAt || group.status === 'DELETED') throw new BadRequestException('已删除团长不能解绑');
    const leaderUserId = group.leaderUserId;
    if (group.status === 'UNBOUND' || !leaderUserId) throw new BadRequestException('当前团长已经解绑，无需重复操作');
    if (!['ENABLED', 'DISABLED'].includes(group.status)) throw new BadRequestException('当前团长正在处理其他高危操作，请稍后重试');

    const check = await this.buildDistributionGroupUnbindCheck(group);
    if (check.inFlightOrderCount > 0) {
      throw new BadRequestException(`当前团长存在 ${check.inFlightOrderCount} 个进行中或待结算订单，暂不能解绑`);
    }
    if (check.pendingWithdrawalCount > 0) {
      throw new BadRequestException(`当前团长或成员存在 ${check.pendingWithdrawalCount} 笔处理中提现，暂不能解绑`);
    }
    if (check.externalCommissionActiveTaskCount > 0) {
      throw new BadRequestException(`当前有 ${check.externalCommissionActiveTaskCount} 个外部归属任务仍会向本团长产生新佣金。请先由任务归属方停止任务或调整分佣后再解绑`);
    }
    if (check.unclaimedTaskCount > 0 && !dto.stopUnclaimedTasks) {
      throw new BadRequestException(`当前团长仍有 ${check.unclaimedTaskCount} 个未领取任务。请确认“停止未领取任务”后再解绑`);
    }

    const memberHandling = dto.memberHandling;
    let targetGroup: any = null;
    if (memberHandling === 'TRANSFER_TO_GROUP') {
      const targetGroupId = String(dto.targetGroupId || '').trim();
      if (!targetGroupId) throw new BadRequestException('转移成员时必须选择目标团长');
      if (targetGroupId === group.id) throw new BadRequestException('目标团长不能与当前团长相同');
      targetGroup = await this.requireDistributionGroupById(targetGroupId, group.tenantId);
      if (!targetGroup.leaderUserId) throw new BadRequestException('目标团队尚未绑定团长，不能接收成员');
    }

    const originalStatus = group.status;
    const result = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const lock = await tx.distributionGroup.updateMany({
        where: { id: group.id, status: originalStatus, deletedAt: null, leaderUserId },
        data: { status: 'UNBINDING', disabledAt: now },
      });
      if (!lock.count) throw new ConflictException('团长状态已变化，请刷新后重试');
      if (targetGroup) {
        const activeTargetGroup = await tx.distributionGroup.findFirst({
          where: { id: targetGroup.id, tenantId: group.tenantId, status: 'ENABLED', deletedAt: null, leaderUserId: { not: null } },
        });
        if (!activeTargetGroup) throw new BadRequestException('目标团长已停用、解绑或删除，请重新选择');
        targetGroup = activeTargetGroup;
      }
      const externalCommissionActiveTaskCount = await tx.dailyTask.count({
        where: this.getDistributionGroupExternalCommissionActiveTaskWhere(group.id),
      });
      if (externalCommissionActiveTaskCount > 0) {
        throw new BadRequestException('存在外部归属任务仍会向本团长产生新佣金，请先停止任务或调整分佣后再解绑');
      }
      const activeBindings = await tx.distributionUserBinding.findMany({
          where: { groupId: group.id, status: 'ENABLED' },
          select: { id: true, userId: true },
        });
        const memberUserIds = Array.from(
          new Set(activeBindings.map((item) => item.userId).filter((userId) => userId !== group.leaderUserId)),
        );
        const ownedTaskRows = await tx.dailyTask.findMany({
          where: this.getDistributionGroupOwnedActiveTaskWhere(group.id),
          select: { id: true },
        });
        const ownedTaskIds = ownedTaskRows.map((item) => item.id);
        if (dto.stopUnclaimedTasks && ownedTaskIds.length) {
          const participantCounts = await tx.taskParticipant.groupBy({
            by: ['taskId'],
            where: { taskId: { in: ownedTaskIds } },
            _count: { _all: true },
          });
          const participantCountMap = new Map(participantCounts.map((item) => [item.taskId, item._count._all]));
          const unclaimedTaskIds = ownedTaskIds.filter((taskId) => (participantCountMap.get(taskId) || 0) === 0);
          if (unclaimedTaskIds.length) {
            await tx.dailyTask.updateMany({
              where: { id: { in: unclaimedTaskIds }, deletedAt: null },
              data: { status: 'CANCELLED', deletedAt: now },
            });
          }
        }

        await tx.distributionUserBinding.updateMany({
          where: { groupId: group.id, status: 'ENABLED' },
          data: { status: 'DISABLED', unbindAt: now },
        });

        if (targetGroup && memberUserIds.length) {
          const existingTargetBindings = await tx.distributionUserBinding.findMany({
            where: { groupId: targetGroup.id, userId: { in: memberUserIds }, status: 'ENABLED' },
            select: { userId: true },
          });
          const existingTargetUserIds = new Set(existingTargetBindings.map((item) => item.userId));
          const bindingsToCreate = memberUserIds
            .filter((userId) => !existingTargetUserIds.has(userId))
            .map((userId) => ({
              id: this.generateCuidLike('dub'),
              userId,
              tenantId: targetGroup.tenantId,
              groupId: targetGroup.id,
              status: 'ENABLED',
              bindSource: 'LEADER_UNBIND_TRANSFER',
              inviteCode: null,
            }));
          if (bindingsToCreate.length) await tx.distributionUserBinding.createMany({ data: bindingsToCreate });

          await tx.distributionTaskAccount.updateMany({
            where: { groupId: group.id, userId: { in: memberUserIds } },
            data: { groupId: targetGroup.id, tenantId: targetGroup.tenantId, status: 'ENABLED', isDefault: false },
          });
          for (const memberUserId of memberUserIds) {
            const defaultAccount = await tx.distributionTaskAccount.findFirst({
              where: { userId: memberUserId, groupId: targetGroup.id, status: 'ENABLED' },
              orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
              select: { id: true },
            });
            if (defaultAccount) {
              await tx.distributionTaskAccount.updateMany({ where: { userId: memberUserId }, data: { isDefault: false } });
              await tx.distributionTaskAccount.update({ where: { id: defaultAccount.id }, data: { isDefault: true } });
            }
          }
        } else if (memberUserIds.length) {
          await tx.distributionTaskAccount.updateMany({
            where: { groupId: group.id, userId: { in: memberUserIds } },
            data: { status: 'DISABLED', isDefault: false },
          });
        }

        await tx.distributionTaskAccount.updateMany({
          where: { groupId: group.id, userId: leaderUserId },
          data: { status: 'DISABLED', isDefault: false },
        });
        await tx.groupCollaboration.updateMany({
          where: { tenantId: group.tenantId, status: 'APPROVED', OR: [{ sourceGroupId: group.id }, { targetGroupId: group.id }] },
          data: { status: 'REVOKED', revokedAt: now },
        });
        await tx.distributionLeaderApplication.updateMany({
          where: { currentGroupId: group.id, status: 'PENDING' },
          data: { status: 'CANCELLED', reviewRemark: '所属团长团队已解绑，申请自动取消', reviewedById: user.id, reviewedAt: now },
        });
        const updated = await tx.distributionGroup.update({
          where: { id: group.id },
          data: {
            status: 'UNBOUND',
            disabledAt: now,
            leaderUserId: null,
            leaderTaskAccountId: null,
            leaderName: null,
            leaderPhone: null,
            commissionEnabled: false,
            commissionRuleType: null,
            commissionRuleValue: null,
            leaderUnboundAt: now,
            leaderUnboundById: user.id,
            remark: this.appendDistributionGroupRemark(group.remark, `团长已解绑：${this.normalizeText(dto.reason) || '未填写原因'}`),
          },
        });
        await tx.operationLog.create({
          data: {
            operatorId: user.id,
            tenantId: group.tenantId,
            module: 'DISTRIBUTION_GROUP',
            action: 'UNBIND_LEADER',
            bizId: group.id,
            description: `解绑团长“${group.name}”`,
            beforeData: { status: group.status, leaderUserId: group.leaderUserId, activeMemberCount: memberUserIds.length },
            afterData: {
              status: updated.status,
              memberHandling,
              targetGroupId: targetGroup?.id || null,
              stoppedUnclaimedTasks: Boolean(dto.stopUnclaimedTasks),
              transferredMemberCount: targetGroup ? memberUserIds.length : 0,
              unboundMemberCount: targetGroup ? 0 : memberUserIds.length,
            },
          },
        });
        return { group: updated, memberHandling, transferredMemberCount: targetGroup ? memberUserIds.length : 0, unboundMemberCount: targetGroup ? 0 : memberUserIds.length };
    }, { maxWait: 5_000, timeout: 30_000 });
    return result;
  }

  async markDistributionGroupAsTestData(
    id: string,
    dto: AdminMarkDistributionGroupTestDataDto,
    user: CurrentUserPayload,
  ) {
    const group = await this.requireAdminDistributionGroup(id, user);
    this.assertDistributionTestDataPurgeEnabled();
    this.assertDistributionGroupOperational(group);
    if (String(dto.confirmName || '').trim() !== group.name) {
      throw new BadRequestException('确认团队名称不正确，测试标记未更新');
    }
    if (group.isTestData) return group;

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.distributionGroup.update({
        where: { id: group.id },
        data: {
          isTestData: true,
          remark: this.appendDistributionGroupRemark(group.remark, `已标记为测试团长：${now.toISOString()}`),
        },
      });
      if (group.leaderUserId) {
        await tx.appUser.updateMany({
          where: { id: group.leaderUserId, deletedAt: null, isTestData: false },
          data: { isTestData: true, testMarkedAt: now, testMarkedById: user.id },
        });
      }
      await tx.operationLog.create({
        data: {
          operatorId: user.id,
          tenantId: group.tenantId,
          module: 'DISTRIBUTION_GROUP',
          action: 'MARK_TEST_DATA',
          bizId: group.id,
          description: `将团长“${group.name}”标记为测试数据`,
          beforeData: { isTestData: false, status: group.status },
          afterData: { isTestData: true, status: updated.status },
        },
      });
      return updated;
    });
  }

  async deleteDistributionGroup(id: string, dto: AdminDeleteDistributionGroupDto, user: CurrentUserPayload) {
    const group = await this.requireAdminDistributionGroup(id, user);
    if (group.deletedAt || group.status === 'DELETED') throw new BadRequestException('该团长已删除');
    if (group.status !== 'UNBOUND' || group.leaderUserId || group.leaderTaskAccountId) {
      throw new BadRequestException('请先完成“解绑团长”，再删除团长档案');
    }
    if (String(dto.confirmName || '').trim() !== group.name) throw new BadRequestException('确认团队名称不正确，删除已取消');
    const enabledBindingCount = await this.prisma.distributionUserBinding.count({ where: { groupId: group.id, status: 'ENABLED' } });
    if (enabledBindingCount > 0) throw new BadRequestException('当前仍有启用中的成员关系，无法删除，请先解绑或转移成员');

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.distributionGroup.update({
        where: { id: group.id },
        data: { status: 'DELETED', deletedAt: now, deletedById: user.id, disabledAt: now },
      });
      await tx.operationLog.create({
        data: {
          operatorId: user.id,
          tenantId: group.tenantId,
          module: 'DISTRIBUTION_GROUP',
          action: 'LOGICAL_DELETE',
          bizId: group.id,
          description: `逻辑删除已解绑团长“${group.name}”`,
          beforeData: { status: group.status, leaderUnboundAt: group.leaderUnboundAt ? group.leaderUnboundAt.toISOString() : null },
          afterData: { status: updated.status, deletedAt: updated.deletedAt ? updated.deletedAt.toISOString() : null },
        },
      });
      return updated;
    });
  }

  async resetDistributionGroupTestData(
    id: string,
    dto: AdminResetDistributionGroupTestDataDto,
    user: CurrentUserPayload,
  ) {
    const group = await this.requireAdminDistributionGroup(id, user);
    if (String(dto.confirmName || '').trim() !== group.name) throw new BadRequestException('确认团队名称不正确，测试数据清理已取消');
    this.assertDistributionTestDataPurgeEnabled();
    const preview = await this.buildDistributionGroupTestResetPreview(group);
    if (!preview.isTestData) throw new BadRequestException('当前团长未标记为测试数据，禁止使用测试清理');
    if (!preview.canReset) throw new BadRequestException(`当前测试数据不能清理：${preview.blockers.join('；')}`);
    if (!['ENABLED', 'DISABLED'].includes(group.status)) throw new BadRequestException('当前团长正在处理其他高危操作，请稍后重试');

    const originalStatus = group.status;
    const result = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const lock = await tx.distributionGroup.updateMany({
        where: { id: group.id, status: originalStatus, deletedAt: null },
        data: { status: 'RESETTING', disabledAt: now },
      });
      if (!lock.count) throw new ConflictException('团长状态已变化，请刷新后重试');
      const externalCommissionTaskCount = await tx.dailyTask.count({
        where: this.getDistributionGroupExternalCommissionTaskWhere(group.id),
      });
      if (externalCommissionTaskCount > 0) {
        throw new BadRequestException('存在仅关联本团长分佣、但归属其他团队的任务，无法安全重置');
      }
      const taskRows = await tx.dailyTask.findMany({ where: this.getDistributionGroupOwnedTaskWhere(group.id), select: { id: true } });
        const taskIds = taskRows.map((item) => item.id);
        const participants = taskIds.length
          ? await tx.taskParticipant.findMany({
              where: { taskId: { in: taskIds } },
              select: { id: true, appUserId: true, status: true, primaryGroupId: true, taskOwnerGroupId: true, participantGroupId: true, leaderCommissionGroupId: true },
            })
          : [];
        const participantIds = participants.map((item) => item.id);
        const workerCompletedCount = new Map<string, number>();
        for (const participant of participants) {
          if (participant.status === 'COMPLETED' && participant.appUserId) {
            workerCompletedCount.set(participant.appUserId, (workerCompletedCount.get(participant.appUserId) || 0) + 1);
          }
        }

        const [settlements, ledgers] = await Promise.all([
          participantIds.length
            ? tx.leaderCommissionSettlement.findMany({ where: { participantId: { in: participantIds } }, select: { id: true, participantId: true, leaderUserId: true, commissionAmount: true } })
            : [],
          participantIds.length
            ? tx.appUserWalletLedger.findMany({ where: { participantId: { in: participantIds } }, select: { id: true, appUserId: true, participantId: true, type: true, amount: true } })
            : [],
        ]);
        const impactedUserIds = Array.from(new Set([
          group.leaderUserId || '',
          ...participants.map((item) => item.appUserId || ''),
          ...ledgers.map((item) => item.appUserId),
          ...settlements.map((item) => item.leaderUserId),
        ].filter((item): item is string => Boolean(item))));
        let impactedUsers: Array<{ id: string; balanceAmount: number; totalSettledAmount: number; totalCompletedOrders: number }> = [];
        let pendingWithdrawalCount = 0;
        let paidWithdrawalCount = 0;
        let manualAdjustmentCount = 0;
        if (impactedUserIds.length) {
          [impactedUsers, pendingWithdrawalCount, paidWithdrawalCount, manualAdjustmentCount] = await Promise.all([
            tx.appUser.findMany({ where: { id: { in: impactedUserIds } }, select: { id: true, balanceAmount: true, totalSettledAmount: true, totalCompletedOrders: true } }),
            tx.appUserWithdrawal.count({
              where: { appUserId: { in: impactedUserIds }, status: { notIn: ['PAID', 'REJECTED', 'FAILED', 'CANCELLED', 'EXPIRED'] } },
            }),
            tx.appUserWithdrawal.count({ where: { appUserId: { in: impactedUserIds }, status: 'PAID' } }),
            tx.appUserWalletLedger.count({ where: { appUserId: { in: impactedUserIds }, type: 'ADJUST' } }),
          ]);
        }
        if (pendingWithdrawalCount > 0 || paidWithdrawalCount > 0 || manualAdjustmentCount > 0) {
          throw new BadRequestException('存在提现或人工调账记录，无法安全重置测试业务数据');
        }
        const userMap = new Map(impactedUsers.map((item) => [item.id, item]));
        const ledgerNetByUser = new Map<string, number>();
        const settledIncomeByUser = new Map<string, number>();
        for (const ledger of ledgers) {
          ledgerNetByUser.set(ledger.appUserId, (ledgerNetByUser.get(ledger.appUserId) || 0) + ledger.amount);
          if (['SETTLEMENT', 'LEADER_COMMISSION'].includes(ledger.type)) {
            settledIncomeByUser.set(ledger.appUserId, (settledIncomeByUser.get(ledger.appUserId) || 0) + ledger.amount);
          }
        }
        for (const [appUserId, netAmount] of ledgerNetByUser) {
          const appUser = userMap.get(appUserId);
          if (!appUser || (netAmount > 0 && appUser.balanceAmount < netAmount)) {
            throw new BadRequestException('存在已被提现、扣减或人工调整的测试收益，无法安全重置');
          }
          const settledIncome = settledIncomeByUser.get(appUserId) || 0;
          if (appUser.totalSettledAmount < settledIncome) throw new BadRequestException('测试收益累计金额异常，无法安全重置');
        }
        for (const [appUserId, completedCount] of workerCompletedCount) {
          const appUser = userMap.get(appUserId);
          if (!appUser || appUser.totalCompletedOrders < completedCount) {
            throw new BadRequestException('测试订单完成数异常，无法安全重置');
          }
        }

        if (taskIds.length) {
          await tx.fileUsage.deleteMany({ where: { bizType: 'DAILY_TASK', bizId: { in: taskIds } } });
          if (participantIds.length) {
            await tx.fileUsage.deleteMany({ where: { bizType: 'TASK_PARTICIPANT', bizId: { in: participantIds } } });
            await tx.leaderCommissionSettlement.deleteMany({ where: { participantId: { in: participantIds } } });
            await tx.appUserWalletLedger.deleteMany({ where: { id: { in: ledgers.map((item) => item.id) } } });
          }
          await tx.dailyTask.deleteMany({ where: { id: { in: taskIds } } });
        }

        for (const appUserId of impactedUserIds) {
          const appUser = userMap.get(appUserId);
          if (!appUser) continue;
          const removedNet = ledgerNetByUser.get(appUserId) || 0;
          const removedSettledIncome = settledIncomeByUser.get(appUserId) || 0;
          const completedCount = workerCompletedCount.get(appUserId) || 0;
          const remainingLedgers = await tx.appUserWalletLedger.findMany({
            where: { appUserId },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: { id: true, amount: true },
          });
          const nextBalance = appUser.balanceAmount - removedNet;
          const nextTotalSettledAmount = appUser.totalSettledAmount - removedSettledIncome;
          const remainingLedgerTotal = remainingLedgers.reduce((sum, item) => sum + item.amount, 0);
          let runningBalance = nextBalance - remainingLedgerTotal;
          await tx.appUser.update({
            where: { id: appUserId },
            data: {
              balanceAmount: nextBalance,
              totalSettledAmount: nextTotalSettledAmount,
              ...(completedCount > 0 ? { totalCompletedOrders: { decrement: completedCount } } : {}),
            },
          });
          for (const ledger of remainingLedgers) {
            runningBalance += ledger.amount;
            await tx.appUserWalletLedger.update({ where: { id: ledger.id }, data: { balanceAfter: runningBalance } });
          }
        }

        const resetAt = new Date();
        await tx.distributionGroup.update({
          where: { id: group.id },
          data: { status: originalStatus, disabledAt: originalStatus === 'DISABLED' ? group.disabledAt || resetAt : null, testResetAt: resetAt, testResetById: user.id },
        });
        await tx.operationLog.create({
          data: {
            operatorId: user.id,
            tenantId: group.tenantId,
            module: 'DISTRIBUTION_GROUP',
            action: 'RESET_TEST_DATA',
            bizId: group.id,
            description: `重置测试团长“${group.name}”的业务数据`,
            beforeData: { taskCount: taskIds.length, participantCount: participantIds.length, commissionSettlementCount: settlements.length, walletLedgerCount: ledgers.length },
            afterData: { status: originalStatus, affectedUserCount: impactedUserIds.length },
          },
        });
        return {
          groupId: group.id,
          deletedTaskCount: taskIds.length,
          deletedParticipantCount: participantIds.length,
          deletedCommissionSettlementCount: settlements.length,
          deletedWalletLedgerCount: ledgers.length,
          affectedUserCount: impactedUserIds.length,
        };
    }, { maxWait: 5_000, timeout: 30_000 });
    return result;
  }

  async setDistributionGroupStatus(id: string, status: 'ENABLED' | 'DISABLED', user: CurrentUserPayload) {
    const group = await this.requireAdminDistributionGroup(id, user);
    if (group.deletedAt || ['UNBOUND', 'DELETED'].includes(group.status)) {
      throw new BadRequestException('已解绑或已删除的团长不能再启用/停用');
    }
    if (!['ENABLED', 'DISABLED'].includes(group.status)) throw new BadRequestException('当前团长正在处理其他高危操作，请稍后重试');
    return this.prisma.distributionGroup.update({
      where: { id: group.id },
      data: { status, disabledAt: status === 'DISABLED' ? new Date() : null },
    });
  }

  async resetDistributionGroupCode(id: string, type: 'member' | 'leader', user: CurrentUserPayload) {
    const group = await this.requireAdminDistributionGroup(id, user);
    this.assertDistributionGroupOperational(group);
    const code = await this.generateUniqueDistributionCode(type);
    const updated = await this.prisma.distributionGroup.update({
      where: { id: group.id },
      data: type === 'member' ? { memberInviteCode: code } : { leaderBindCode: code },
    });
    return {
      ...updated,
      memberInviteUrl: this.buildDistributionInviteUrl('invite', updated.memberInviteCode),
      leaderBindUrl: this.buildDistributionInviteUrl('leaderCode', updated.leaderBindCode),
    };
  }

  async updateDistributionGroupCode(id: string, type: 'member' | 'leader', dto: AdminUpdateDistributionGroupCodeDto, user: CurrentUserPayload) {
    const group = await this.requireAdminDistributionGroup(id, user);
    this.assertDistributionGroupOperational(group);
    const code = await this.resolveDistributionCodeForUpdate(type, dto.code, group.id);
    const updated = await this.prisma.distributionGroup.update({
      where: { id: group.id },
      data: type === 'member' ? { memberInviteCode: code } : { leaderBindCode: code },
    });
    return {
      ...updated,
      memberInviteUrl: this.buildDistributionInviteUrl('invite', updated.memberInviteCode),
      leaderBindUrl: this.buildDistributionInviteUrl('leaderCode', updated.leaderBindCode),
    };
  }

  async adminBindDistributionGroupLeader(id: string, dto: AdminBindGroupLeaderDto, user: CurrentUserPayload) {
    const group = await this.requireAdminDistributionGroup(id, user);
    this.assertDistributionGroupOperational(group);
    const phone = this.normalizePhone(dto.phone);
    const appUser = await this.prisma.appUser.findFirst({ where: { phone, deletedAt: null } });
    if (!appUser) throw new NotFoundException('未找到该手机号对应的 H5 用户，请先让团长登录 H5 并绑定手机号');
    return this.promoteDistributionUserToLeader({
      appUser,
      group,
      operatorId: user.id,
      bindSource: 'ADMIN_BIND_LEADER',
      phone,
      leaderName: appUser.nickname || group.leaderName || `用户${phone.slice(-4)}`,
    });
  }

  async listGroupCollaborations(query: AdminGroupCollaborationQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query);
    const tenantId = resolveVisibleTenantId(user, query.tenantId);
    const where: Prisma.GroupCollaborationWhereInput = { ...(tenantId ? { tenantId } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.groupCollaboration.findMany({ where, skip, take, orderBy: [{ createdAt: 'desc' }] }),
      this.prisma.groupCollaboration.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  async createGroupCollaboration(dto: AdminCreateGroupCollaborationDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    const [source, target] = await Promise.all([
      this.requireDistributionGroupById(dto.sourceGroupId, tenantId),
      this.requireDistributionGroupById(dto.targetGroupId, tenantId),
    ]);
    if (source.id === target.id) throw new BadRequestException('来源团长和协作团长不能相同');
    return this.prisma.groupCollaboration.create({
      data: {
        id: this.generateCuidLike('gc'),
        tenantId,
        sourceGroupId: source.id,
        targetGroupId: target.id,
        status: 'APPROVED',
        approvedById: user.id,
        approvedAt: new Date(),
        createdById: user.id,
        startAt: this.parseOptionalDate(dto.startAt),
        endAt: this.parseOptionalDate(dto.endAt),
      },
    });
  }

  async revokeGroupCollaboration(id: string, user: CurrentUserPayload) {
    const tenantId = resolveVisibleTenantId(user);
    const item = await this.prisma.groupCollaboration.findFirst({ where: { id, tenantId } });
    if (!item) throw new NotFoundException('协作授权不存在');
    return this.prisma.groupCollaboration.update({ where: { id }, data: { status: 'REVOKED', revokedAt: new Date() } });
  }

  async getDistributionInviteDetail(code: string) {
    const group = await this.findDistributionGroupByInvite(code);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: group.tenantId }, select: { id: true, name: true, code: true, status: true } });
    return { valid: true, tenantId: group.tenantId, tenantName: tenant?.name || '', tenant, groupId: group.id, groupName: group.name, status: group.status };
  }

  async bindDistributionInvite(dto: DistributionInviteBindDto, authorization?: string) {
    const appUser = await this.requireDistributionAppUser(authorization);
    const group = await this.findDistributionGroupByInvite(dto.inviteCode);
    const binding = await this.ensureUserBinding(appUser.id, group, 'INVITE', group.memberInviteCode);
    const phone = this.normalizePhone(appUser.phone);
    let taskAccount = null;
    if (this.isValidNormalizedPhone(phone)) {
      taskAccount = await this.ensureTaskAccountForUser(appUser, group, appUser.nickname || `用户${phone.slice(-4)}`, phone, false);
    }
    return { binding, taskAccount, group: await this.toDistributionGroupPublic(group) };
  }

  async getDistributionLeaderCodeDetail(code: string) {
    const group = await this.findDistributionGroupByLeaderCode(code);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: group.tenantId }, select: { id: true, name: true, code: true, status: true } });
    return { valid: true, tenantId: group.tenantId, tenantName: tenant?.name || '', tenant, groupId: group.id, groupName: group.name, leaderName: group.leaderName, status: group.status };
  }

  async bindDistributionLeaderCode(dto: DistributionLeaderBindDto, authorization?: string) {
    const appUser = await this.requireDistributionAppUser(authorization);
    const group = await this.findDistributionGroupByLeaderCode(dto.leaderCode);
    const phone = this.normalizePhone(dto.phone);
    if (!this.isValidNormalizedPhone(phone)) throw new BadRequestException('手机号格式不正确');
    await this.smsService.verifyCode(phone, 'leader_bind', dto.smsCode);
    const nickname = String(dto.nickname || '').trim() || group.leaderName || `用户${phone.slice(-4)}`;
    const updatedUser = await this.bindDistributionAppUserPhone(appUser, phone, nickname, authorization);
    const binding = await this.ensureUserBinding(updatedUser.id, group, 'LEADER_CODE', group.leaderBindCode);
    const taskAccount = await this.ensureTaskAccountForUser(updatedUser, group, nickname, phone, true);
    const updatedGroup = await this.prisma.distributionGroup.update({
      where: { id: group.id },
      data: { leaderUserId: updatedUser.id, leaderTaskAccountId: taskAccount.id, leaderPhone: phone, leaderName: nickname },
    });
    return { binding, taskAccount, group: await this.toDistributionGroupPublic(updatedGroup) };
  }

  async listDistributionTaskAccounts(authorization?: string) {
    const appUser = await this.requireDistributionAppUser(authorization);
    const items = await this.prisma.distributionTaskAccount.findMany({ where: { userId: appUser.id, status: 'ENABLED' }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
    return { items, active: items.find((item) => item.isDefault) || items[0] || null };
  }

  async createDistributionTaskAccount(dto: DistributionTaskAccountDto, authorization?: string) {
    const appUser = await this.requireDistributionAppUser(authorization);
    const binding = await this.requireDistributionBinding(appUser.id);
    const group = await this.requireDistributionGroupById(binding.groupId, binding.tenantId);
    const phone = this.normalizePhone(dto.phone);
    if (!this.isValidNormalizedPhone(phone)) throw new BadRequestException('手机号格式不正确');
    await this.smsService.verifyCode(phone, 'task_account', dto.smsCode);
    const nickname = String(dto.nickname || '').trim();
    if (!nickname) throw new BadRequestException('昵称不能为空');
    const item = await this.ensureTaskAccountForUser(appUser, group, nickname, phone, false);
    return item;
  }

  async switchDistributionTaskAccount(id: string, authorization?: string) {
    const appUser = await this.requireDistributionAppUser(authorization);
    const account = await this.prisma.distributionTaskAccount.findFirst({ where: { id, userId: appUser.id, status: 'ENABLED' } });
    if (!account) throw new NotFoundException('任务账号不存在');
    await this.prisma.$transaction([
      this.prisma.distributionTaskAccount.updateMany({ where: { userId: appUser.id }, data: { isDefault: false } }),
      this.prisma.distributionTaskAccount.update({ where: { id: account.id }, data: { isDefault: true } }),
    ]);
    return { ...account, isDefault: true };
  }


  private generateCuidLike(prefix = 'id') {
    return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  }

  private resolveDistributionLeaderCenterRange(query: DistributionLeaderCenterQueryDto) {
    const startDate = String(query.startDate ?? '').trim();
    const endDate = String(query.endDate ?? '').trim();
    if (!startDate && !endDate) {
      return { startDate: null, endDate: null, startAt: null as Date | null, endExclusive: null as Date | null };
    }
    if (!startDate || !endDate) {
      throw new BadRequestException('开始日期和结束日期必须同时填写');
    }

    const parseBusinessDate = (value: string, label: string) => {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      if (!match) throw new BadRequestException(`${label}必须为 YYYY-MM-DD 格式`);
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const utcCheck = new Date(Date.UTC(year, month - 1, day));
      if (utcCheck.getUTCFullYear() !== year || utcCheck.getUTCMonth() !== month - 1 || utcCheck.getUTCDate() !== day) {
        throw new BadRequestException(`${label}不是有效日期`);
      }
      // 团长中心按北京时间自然日统计，避免服务器以 UTC 运行时跨天统计错误。
      return new Date(`${value}T00:00:00.000+08:00`);
    };

    const startAt = parseBusinessDate(startDate, '开始日期');
    const endAt = parseBusinessDate(endDate, '结束日期');
    if (startAt.getTime() > endAt.getTime()) {
      throw new BadRequestException('开始日期不能晚于结束日期');
    }

    return {
      startDate,
      endDate,
      startAt,
      endExclusive: new Date(endAt.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  private buildDistributionInviteUrl(param: 'invite' | 'leaderCode', code: string) {
    const base = String(this.configService.get('app.h5BaseUrl') || process.env.DISTRIBUTION_H5_BASE_URL || process.env.H5_BASE_URL || '').trim().replace(/\/$/, '');
    return base ? `${base}/?${param}=${encodeURIComponent(code)}` : `/?${param}=${encodeURIComponent(code)}`;
  }

  private async generateUniqueDistributionCode(type: 'member' | 'leader') {
    const prefix = type === 'leader' ? 'L' : '';
    for (let i = 0; i < 8; i += 1) {
      const code = `${prefix}${randomUUID().replace(/-/g, '').slice(0, type === 'leader' ? 10 : 6).toUpperCase()}`;
      const exists = await this.prisma.distributionGroup.findFirst({
        where: type === 'member' ? { memberInviteCode: code } : { leaderBindCode: code },
        select: { id: true },
      });
      if (!exists) return code;
    }
    return `${prefix}${Date.now().toString(36).toUpperCase()}`;
  }

  private normalizeDistributionCode(value?: string | null) {
    return String(value || '').trim().toUpperCase();
  }

  private async resolveDistributionCodeForCreate(type: 'member' | 'leader', input?: string | null) {
    const code = this.normalizeDistributionCode(input);
    if (!code) return this.generateUniqueDistributionCode(type);
    if (!/^[A-Z0-9_-]+$/.test(code)) {
      throw new BadRequestException(type === 'member' ? '成员邀请码只能包含字母、数字、下划线或短横线' : '团长身份码只能包含字母、数字、下划线或短横线');
    }
    const exists = await this.prisma.distributionGroup.findFirst({
      where: type === 'member' ? { memberInviteCode: code } : { leaderBindCode: code },
      select: { id: true },
    });
    if (exists) {
      throw new ConflictException(type === 'member' ? '成员邀请码已存在，请换一个' : '团长身份码已存在，请换一个');
    }
    return code;
  }

  private async resolveDistributionCodeForUpdate(type: 'member' | 'leader', input: string, currentGroupId: string) {
    const code = this.normalizeDistributionCode(input);
    if (!code) throw new BadRequestException(type === 'member' ? '成员邀请码不能为空' : '团长身份码不能为空');
    if ((type === 'member' && code.length > 32) || code.length > 64) {
      throw new BadRequestException(type === 'member' ? '成员邀请码长度不能超过 32 位' : '团长身份码长度不能超过 64 位');
    }
    if (!/^[A-Z0-9_-]+$/.test(code)) {
      throw new BadRequestException(type === 'member' ? '成员邀请码只能包含字母、数字、下划线或短横线' : '团长身份码只能包含字母、数字、下划线或短横线');
    }
    const exists = await this.prisma.distributionGroup.findFirst({
      where: {
        id: { not: currentGroupId },
        ...(type === 'member' ? { memberInviteCode: code } : { leaderBindCode: code }),
      },
      select: { id: true },
    });
    if (exists) {
      throw new ConflictException(type === 'member' ? '成员邀请码已存在，请换一个' : '团长身份码已存在，请换一个');
    }
    return code;
  }

  private async ensureTenantExists(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId, deletedAt: null }, select: { id: true } });
    if (!tenant) throw new BadRequestException('所属租户不存在');
    return tenant;
  }

  /**
   * 与团长有关的任务：包含该团长作为任务归属方，或仅作为团长分佣接收方的任务。
   * 仅用于业务阻断、历史核查；不能据此物理删除任务。
   */
  private getDistributionGroupRelatedTaskWhere(groupId: string): Prisma.DailyTaskWhereInput {
    return {
      deletedAt: null,
      OR: [{ distributionGroupId: groupId }, { commissionGroupId: groupId }],
    };
  }

  /** 该团长真正拥有的任务；测试重置只允许作用于此范围。 */
  private getDistributionGroupOwnedTaskWhere(groupId: string): Prisma.DailyTaskWhereInput {
    return { deletedAt: null, distributionGroupId: groupId };
  }

  /** 仍处于可发布/可领取生命周期的自有任务；解绑时只能停止其中尚无人领取的任务。 */
  private getDistributionGroupOwnedActiveTaskWhere(groupId: string): Prisma.DailyTaskWhereInput {
    return {
      ...this.getDistributionGroupOwnedTaskWhere(groupId),
      status: { in: ['DRAFT', 'READY', 'DISPATCHED', 'RUNNING'] },
    };
  }

  /** 团长仅参与分佣、但任务归属于其他团队/全租户的关联任务，不能安全物理重置。 */
  private getDistributionGroupExternalCommissionTaskWhere(groupId: string): Prisma.DailyTaskWhereInput {
    return {
      deletedAt: null,
      commissionGroupId: groupId,
      OR: [{ distributionGroupId: null }, { distributionGroupId: { not: groupId } }],
    };
  }

  /**
   * 外部归属任务若仍在发布/领取周期，解绑后仍可能按旧分佣快照向原团长产生新佣金。
   * 这类任务不能由本团长删除，必须先由任务归属方停止或调整分佣，随后才允许解绑。
   */
  private getDistributionGroupExternalCommissionActiveTaskWhere(groupId: string): Prisma.DailyTaskWhereInput {
    return {
      ...this.getDistributionGroupExternalCommissionTaskWhere(groupId),
      status: { in: ['DRAFT', 'READY', 'DISPATCHED', 'RUNNING'] },
    };
  }

  private appendDistributionGroupRemark(current: string | null | undefined, message: string) {
    const base = String(current || '').trim();
    const normalized = String(message || '').trim();
    if (!normalized) return base || null;
    return `${base ? `${base}\n` : ''}${normalized}`.slice(0, 2000);
  }

  private assertDistributionGroupOperational(group: any) {
    if (group?.deletedAt || !['ENABLED', 'DISABLED'].includes(String(group?.status || ''))) {
      throw new BadRequestException('当前团长已解绑、已删除或正在处理，不能继续修改运营配置');
    }
  }

  private parseScopeIds(raw: unknown, label: string) {
    const ids = Array.from(new Set(String(raw || '').split(',').map((item) => item.trim()).filter(Boolean)));
    if (ids.length > 100) throw new BadRequestException(`${label}范围最多支持 100 条`);
    return ids;
  }

  private isDistributionTestDataPurgeEnabled() {
    const configured = String(this.configService.get<string>('ALLOW_TEST_DATA_PURGE') ?? process.env.ALLOW_TEST_DATA_PURGE ?? '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(configured);
  }

  private assertDistributionTestDataPurgeEnabled() {
    if (!this.isDistributionTestDataPurgeEnabled()) {
      throw new ForbiddenException('测试数据清理未开启。请仅在需要清理独立测试账号数据的环境中设置 ALLOW_TEST_DATA_PURGE=true 后使用。');
    }
  }

  /**
   * 计算测试团长的“直接业务范围”。
   * 范围只从团长本身出发：任务归属、分佣归属、订单记录与当前成员关系；不会按成员的其他历史任务无限递归，
   * 这样管理员看到的数量就是本团长真正关联的清理对象，不会出现难以理解的范围膨胀。
   */
  private async buildDistributionGroupForceUnbindDeletePlan(
    db: Prisma.TransactionClient | PrismaService,
    groupId: string,
  ) {
    const group = await db.distributionGroup.findFirst({
      where: { id: groupId },
      select: { id: true, tenantId: true, name: true, status: true, isTestData: true, deletedAt: true, leaderUserId: true },
    });
    if (!group) throw new NotFoundException('团长档案不存在');

    const purgeEnabled = this.isDistributionTestDataPurgeEnabled();
    const directParticipantRows = await db.taskParticipant.findMany({
      where: {
        OR: [
          { primaryGroupId: group.id },
          { taskOwnerGroupId: group.id },
          { participantGroupId: group.id },
          { leaderCommissionGroupId: group.id },
        ],
      },
      select: { taskId: true },
    });
    const relatedTasks = await db.dailyTask.findMany({
      where: {
        tenantId: group.tenantId,
        deletedAt: null,
        OR: [
          { distributionGroupId: group.id },
          { commissionGroupId: group.id },
          ...(directParticipantRows.length ? [{ id: { in: directParticipantRows.map((item) => item.taskId) } }] : []),
        ],
      },
      select: {
        id: true,
        title: true,
        status: true,
        isTestData: true,
        distributionGroupId: true,
        commissionGroupId: true,
        commissionLeaderUserId: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
    const scopeTaskIds = relatedTasks.map((item) => item.id);
    const participants = scopeTaskIds.length
      ? await db.taskParticipant.findMany({
          where: { taskId: { in: scopeTaskIds } },
          select: {
            id: true,
            taskId: true,
            appUserId: true,
            visitorName: true,
            phone: true,
            status: true,
            settlementStatus: true,
            primaryGroupId: true,
            taskOwnerGroupId: true,
            participantGroupId: true,
            leaderCommissionGroupId: true,
          },
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        })
      : [];
    const scopeParticipantIds = participants.map((item) => item.id);
    const settlements = (scopeTaskIds.length || scopeParticipantIds.length)
      ? await db.leaderCommissionSettlement.findMany({
          where: {
            OR: [
              ...(scopeTaskIds.length ? [{ taskId: { in: scopeTaskIds } }] : []),
              ...(scopeParticipantIds.length ? [{ participantId: { in: scopeParticipantIds } }] : []),
            ],
          },
          select: { id: true, groupId: true, leaderUserId: true, workerUserId: true },
        })
      : [];
    const enabledBindings = await db.distributionUserBinding.findMany({
      where: { groupId: group.id, status: 'ENABLED' },
      select: { userId: true },
    });
    const scopeUserIds = Array.from(new Set([
      group.leaderUserId || '',
      ...enabledBindings.map((item) => item.userId),
      ...relatedTasks.map((item) => item.commissionLeaderUserId || ''),
      ...participants.map((item) => item.appUserId || ''),
      ...settlements.flatMap((item) => [item.leaderUserId || '', item.workerUserId || '']),
    ].filter((item): item is string => Boolean(item))));
    const users = scopeUserIds.length
      ? await db.appUser.findMany({
          where: { id: { in: scopeUserIds }, deletedAt: null },
          select: { id: true, nickname: true, phone: true, isTestData: true },
        })
      : [];
    const userMap = new Map(users.map((item) => [item.id, item]));
    const taskMap = new Map(relatedTasks.map((item) => [item.id, item]));
    const formatUser = (userId?: string | null, fallback?: string | null) => {
      const account = userId ? userMap.get(userId) : null;
      return account?.nickname || account?.phone || fallback || '未识别成员';
    };
    const relationLabel = (task: typeof relatedTasks[number], participant?: typeof participants[number]) => {
      const labels: string[] = [];
      if (task.distributionGroupId === group.id) labels.push('任务归属');
      if (task.commissionGroupId === group.id) labels.push('团长分佣');
      if (participant && [participant.primaryGroupId, participant.taskOwnerGroupId, participant.participantGroupId, participant.leaderCommissionGroupId].includes(group.id)) labels.push('订单归属');
      return Array.from(new Set(labels)).join(' / ') || '直接关联';
    };
    const inFlightOrders = participants
      .filter((item) => item.status === 'STARTED' || item.status === 'CLAIMED' || (item.status === 'COMPLETED' && item.settlementStatus !== 'SETTLED'))
      .slice(0, 50)
      .map((item) => ({
        id: item.id,
        taskId: item.taskId,
        taskTitle: taskMap.get(item.taskId)?.title || item.taskId,
        participantLabel: formatUser(item.appUserId, item.visitorName || item.phone),
        status: item.status,
        settlementStatus: item.settlementStatus,
        relation: relationLabel(taskMap.get(item.taskId)!, item),
      }));
    const [walletLedgerCount, withdrawalCount, manualAdjustmentCount] = scopeUserIds.length
      ? await Promise.all([
          db.appUserWalletLedger.count({ where: { appUserId: { in: scopeUserIds } } }),
          db.appUserWithdrawal.count({ where: { appUserId: { in: scopeUserIds } } }),
          db.appUserWalletLedger.count({ where: { appUserId: { in: scopeUserIds }, type: 'ADJUST' } }),
        ])
      : [0, 0, 0];

    const blockers: string[] = [];
    if (!group.isTestData) blockers.push('当前团长未标记为测试团长');
    if (!purgeEnabled) blockers.push('服务端未开启 ALLOW_TEST_DATA_PURGE=true');
    if (group.deletedAt || !['ENABLED', 'DISABLED'].includes(String(group.status || ''))) blockers.push('团长已解绑、已删除或正在处理');
    if (scopeTaskIds.length > 100 || scopeParticipantIds.length > 2_000 || scopeUserIds.length > 100) {
      blockers.push('关联任务、订单或账号数量过大，不能一次管理员强制清理');
    }
    const confirmForceText = `确认强制解绑并删除「${group.name}」及${scopeTaskIds.length}个关联任务`;

    return {
      groupId: group.id,
      groupName: group.name,
      isTestData: group.isTestData,
      purgeEnabled,
      activeMemberCount: enabledBindings.filter((item) => item.userId !== group.leaderUserId).length,
      scopeTaskIds,
      scopeParticipantIds,
      scopeUserIds,
      taskCount: scopeTaskIds.length,
      participantCount: scopeParticipantIds.length,
      accountCount: scopeUserIds.length,
      commissionSettlementCount: settlements.length,
      walletLedgerCount,
      withdrawalCount,
      manualAdjustmentCount,
      tasks: relatedTasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        isTestData: task.isTestData,
        relation: relationLabel(task),
      })),
      accounts: users.map((account) => ({
        id: account.id,
        label: account.nickname || account.phone || account.id,
        phone: account.phone || null,
        isTestData: account.isTestData,
        role: account.id === group.leaderUserId ? '团长' : '关联成员',
      })),
      inFlightOrders,
      inFlightOrderCount: participants.filter((item) => item.status === 'STARTED' || item.status === 'CLAIMED' || (item.status === 'COMPLETED' && item.settlementStatus !== 'SETTLED')).length,
      confirmForceText,
      blockers,
      canForceUnbindDelete: blockers.length === 0,
    };
  }

  private async buildDistributionGroupUnbindCheck(group: any) {
    const taskRows = await this.prisma.dailyTask.findMany({
      where: this.getDistributionGroupRelatedTaskWhere(group.id),
      select: { id: true },
    });
    const taskIds = taskRows.map((item) => item.id);
    const ownedTaskRows = await this.prisma.dailyTask.findMany({
      where: this.getDistributionGroupOwnedActiveTaskWhere(group.id),
      select: { id: true },
    });
    const ownedTaskIds = ownedTaskRows.map((item) => item.id);
    const participantScope: Prisma.TaskParticipantWhereInput[] = [
      { participantGroupId: group.id },
      { primaryGroupId: group.id },
      { taskOwnerGroupId: group.id },
      { leaderCommissionGroupId: group.id },
      ...(taskIds.length ? [{ taskId: { in: taskIds } }] : []),
    ];
    const inFlightOrderWhere: Prisma.TaskParticipantWhereInput = {
      OR: participantScope,
      AND: [
        {
          OR: [
            { status: { in: ['STARTED', 'CLAIMED'] } },
            { status: 'COMPLETED', settlementStatus: { not: 'SETTLED' } },
          ],
        },
      ],
    };
    const [inFlightOrderCount, inFlightOrders] = await Promise.all([
      this.prisma.taskParticipant.count({ where: inFlightOrderWhere }),
      this.prisma.taskParticipant.findMany({
        where: inFlightOrderWhere,
        take: 30,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, taskId: true, appUserId: true, visitorName: true, phone: true, status: true, settlementStatus: true },
      }),
    ]);
    const inFlightOrderUserIds = Array.from(new Set(inFlightOrders.map((item) => item.appUserId).filter((item): item is string => Boolean(item))));
    const inFlightOrderTaskIds = Array.from(new Set(inFlightOrders.map((item) => item.taskId)));
    const [inFlightUsers, inFlightTasks] = await Promise.all([
      inFlightOrderUserIds.length
        ? this.prisma.appUser.findMany({ where: { id: { in: inFlightOrderUserIds } }, select: { id: true, nickname: true, phone: true } })
        : [],
      inFlightOrderTaskIds.length
        ? this.prisma.dailyTask.findMany({ where: { id: { in: inFlightOrderTaskIds } }, select: { id: true, title: true } })
        : [],
    ]);
    const inFlightUserMap = new Map(inFlightUsers.map((item) => [item.id, item]));
    const inFlightTaskMap = new Map(inFlightTasks.map((item) => [item.id, item]));
    const participantCounts = ownedTaskIds.length
      ? await this.prisma.taskParticipant.groupBy({ by: ['taskId'], where: { taskId: { in: ownedTaskIds } }, _count: { _all: true } })
      : [];
    const participantCountByTask = new Map(participantCounts.map((item) => [item.taskId, item._count._all]));
    const unclaimedTaskCount = ownedTaskIds.filter((taskId) => (participantCountByTask.get(taskId) || 0) === 0).length;
    const [externalCommissionTaskCount, externalCommissionActiveTaskCount] = await Promise.all([
      this.prisma.dailyTask.count({ where: this.getDistributionGroupExternalCommissionTaskWhere(group.id) }),
      this.prisma.dailyTask.count({ where: this.getDistributionGroupExternalCommissionActiveTaskWhere(group.id) }),
    ]);
    const activeBindings = await this.prisma.distributionUserBinding.findMany({
      where: { groupId: group.id, status: 'ENABLED' },
      select: { userId: true, bindSource: true },
    });
    const affectedUserIds = Array.from(new Set([group.leaderUserId || '', ...activeBindings.map((item) => item.userId)].filter((item): item is string => Boolean(item))));
    const pendingWithdrawalCount = affectedUserIds.length
      ? await this.prisma.appUserWithdrawal.count({
          where: { appUserId: { in: affectedUserIds }, status: { notIn: ['PAID', 'REJECTED', 'FAILED', 'CANCELLED', 'EXPIRED'] } },
        })
      : 0;
    const activeMemberCount = activeBindings.filter((item) => item.userId !== group.leaderUserId).length;
    return {
      groupId: group.id,
      status: group.status,
      activeMemberCount,
      ownedTaskCount: ownedTaskIds.length,
      commissionAssociatedTaskCount: externalCommissionTaskCount,
      externalCommissionActiveTaskCount,
      unclaimedTaskCount,
      inFlightOrderCount,
      pendingWithdrawalCount,
      inFlightOrders: inFlightOrders.map((item) => ({
        id: item.id,
        taskId: item.taskId,
        taskTitle: inFlightTaskMap.get(item.taskId)?.title || item.taskId,
        participantLabel: (item.appUserId ? inFlightUserMap.get(item.appUserId)?.nickname || inFlightUserMap.get(item.appUserId)?.phone : null) || item.visitorName || item.phone || '未识别成员',
        status: item.status,
        settlementStatus: item.settlementStatus,
      })),
      canUnbind: inFlightOrderCount === 0 && pendingWithdrawalCount === 0 && externalCommissionActiveTaskCount === 0,
    };
  }

  private async buildDistributionGroupTestResetPreview(group: any) {
    const blockers: string[] = [];
    const isTestData = Boolean(group.isTestData);
    const purgeEnabled = ['1', 'true', 'yes', 'on'].includes(String(this.configService.get<string>('ALLOW_TEST_DATA_PURGE') ?? process.env.ALLOW_TEST_DATA_PURGE ?? '').trim().toLowerCase());
    if (!isTestData) blockers.push('该团长未标记为测试数据');
    if (!purgeEnabled) blockers.push('服务端未开启 ALLOW_TEST_DATA_PURGE');
    if (group.deletedAt || ['UNBOUND', 'DELETED'].includes(String(group.status || ''))) blockers.push('已解绑或已删除团长不能重置测试数据');

    const [taskRows, externalCommissionTaskCount] = await Promise.all([
      this.prisma.dailyTask.findMany({ where: this.getDistributionGroupOwnedTaskWhere(group.id), select: { id: true } }),
      this.prisma.dailyTask.count({ where: this.getDistributionGroupExternalCommissionTaskWhere(group.id) }),
    ]);
    const taskIds = taskRows.map((item) => item.id);
    if (externalCommissionTaskCount > 0) {
      blockers.push(`存在 ${externalCommissionTaskCount} 个仅关联本团长分佣、但归属其他团队的任务，不能安全重置`);
    }
    const participants = taskIds.length
      ? await this.prisma.taskParticipant.findMany({
          where: { taskId: { in: taskIds } },
          select: { id: true, appUserId: true, status: true, primaryGroupId: true, taskOwnerGroupId: true, participantGroupId: true, leaderCommissionGroupId: true },
        })
      : [];
    const participantIds = participants.map((item) => item.id);
    const [commissionSettlementCount, walletLedgerCount, outsideGroupParticipantCount, crossGroupParticipantCount] = await Promise.all([
      participantIds.length ? this.prisma.leaderCommissionSettlement.count({ where: { participantId: { in: participantIds } } }) : 0,
      participantIds.length ? this.prisma.appUserWalletLedger.count({ where: { participantId: { in: participantIds } } }) : 0,
      this.prisma.taskParticipant.count({
        where: {
          OR: [
            { primaryGroupId: group.id },
            { taskOwnerGroupId: group.id },
            { participantGroupId: group.id },
            { leaderCommissionGroupId: group.id },
          ],
          ...(taskIds.length ? { taskId: { notIn: taskIds } } : {}),
        },
      }),
      taskIds.length
        ? this.prisma.taskParticipant.count({
            where: {
              taskId: { in: taskIds },
              OR: [
                { primaryGroupId: { not: null, notIn: [group.id] } },
                { taskOwnerGroupId: { not: null, notIn: [group.id] } },
                { participantGroupId: { not: null, notIn: [group.id] } },
                { leaderCommissionGroupId: { not: null, notIn: [group.id] } },
              ],
            },
          })
        : 0,
    ]);
    if (outsideGroupParticipantCount > 0) blockers.push(`存在 ${outsideGroupParticipantCount} 条本团长参与了外部任务的订单`);
    if (crossGroupParticipantCount > 0) blockers.push(`存在 ${crossGroupParticipantCount} 条其他团队参与了本测试任务的订单`);

    const ledgers = participantIds.length
      ? await this.prisma.appUserWalletLedger.findMany({ where: { participantId: { in: participantIds } }, select: { appUserId: true, amount: true, type: true } })
      : [];
    const impactedUserIds = Array.from(new Set([group.leaderUserId || '', ...participants.map((item) => item.appUserId || ''), ...ledgers.map((item) => item.appUserId)].filter((item): item is string => Boolean(item))));
    const users = impactedUserIds.length
      ? await this.prisma.appUser.findMany({ where: { id: { in: impactedUserIds } }, select: { id: true, balanceAmount: true, totalSettledAmount: true, totalCompletedOrders: true } })
      : [];
    const userMap = new Map(users.map((item) => [item.id, item]));
    const ledgerNetByUser = new Map<string, number>();
    const settledIncomeByUser = new Map<string, number>();
    for (const ledger of ledgers) {
      ledgerNetByUser.set(ledger.appUserId, (ledgerNetByUser.get(ledger.appUserId) || 0) + ledger.amount);
      if (['SETTLEMENT', 'LEADER_COMMISSION'].includes(ledger.type)) settledIncomeByUser.set(ledger.appUserId, (settledIncomeByUser.get(ledger.appUserId) || 0) + ledger.amount);
    }
    for (const [appUserId, netAmount] of ledgerNetByUser) {
      const appUser = userMap.get(appUserId);
      if (!appUser || (netAmount > 0 && appUser.balanceAmount < netAmount) || appUser.totalSettledAmount < (settledIncomeByUser.get(appUserId) || 0)) {
        blockers.push('存在已被提现、扣减或人工调整的测试收益');
        break;
      }
    }
    const completedCountByUser = new Map<string, number>();
    for (const participant of participants) {
      if (participant.status === 'COMPLETED' && participant.appUserId) {
        completedCountByUser.set(participant.appUserId, (completedCountByUser.get(participant.appUserId) || 0) + 1);
      }
    }
    for (const [appUserId, completedCount] of completedCountByUser) {
      const appUser = userMap.get(appUserId);
      if (!appUser || appUser.totalCompletedOrders < completedCount) {
        blockers.push('测试订单完成数异常，无法安全重置');
        break;
      }
    }
    const [pendingWithdrawalCount, paidWithdrawalCount, manualAdjustmentCount] = impactedUserIds.length
      ? await Promise.all([
          this.prisma.appUserWithdrawal.count({
            where: { appUserId: { in: impactedUserIds }, status: { notIn: ['PAID', 'REJECTED', 'FAILED', 'CANCELLED', 'EXPIRED'] } },
          }),
          this.prisma.appUserWithdrawal.count({
            where: { appUserId: { in: impactedUserIds }, status: 'PAID' },
          }),
          this.prisma.appUserWalletLedger.count({
            where: { appUserId: { in: impactedUserIds }, type: 'ADJUST' },
          }),
        ])
      : [0, 0, 0];
    if (pendingWithdrawalCount > 0) blockers.push(`存在 ${pendingWithdrawalCount} 笔处理中的提现`);
    if (paidWithdrawalCount > 0) blockers.push(`存在 ${paidWithdrawalCount} 笔已打款提现，不能安全回退测试收益`);
    if (manualAdjustmentCount > 0) blockers.push(`存在 ${manualAdjustmentCount} 条人工调账流水，不能安全重置`);

    return {
      groupId: group.id,
      isTestData,
      purgeEnabled,
      taskCount: taskIds.length,
      participantCount: participantIds.length,
      commissionSettlementCount,
      walletLedgerCount,
      impactedUserCount: impactedUserIds.length,
      outsideGroupParticipantCount,
      crossGroupParticipantCount,
      externalCommissionTaskCount,
      pendingWithdrawalCount,
      paidWithdrawalCount,
      manualAdjustmentCount,
      blockers,
      canReset: blockers.length === 0,
    };
  }

  private async requireDistributionGroupById(groupId: string | null | undefined, tenantId?: string | null) {
    const id = String(groupId || '').trim();
    if (!id) throw new BadRequestException('团长/分发组不能为空');
    const group = await this.prisma.distributionGroup.findFirst({ where: { id, deletedAt: null, ...(tenantId ? { tenantId } : {}) } });
    if (!group) throw new NotFoundException('团长/分发组不存在');
    if (group.status !== 'ENABLED') throw new BadRequestException('团长/分发组已停用');
    return group;
  }

  private resolveDistributionGroupCommissionConfig(input: {
    commissionEnabled?: boolean;
    commissionRuleType?: string;
    commissionRuleValue?: number;
  }) {
    const commissionEnabled = Boolean(input.commissionEnabled);
    if (!commissionEnabled) {
      return {
        commissionEnabled: false,
        commissionRuleType: null,
        commissionRuleValue: null,
      };
    }
    const commissionRuleType = String(input.commissionRuleType || '').toUpperCase();
    const commissionRuleValue = Number(input.commissionRuleValue || 0);
    if (!['PERCENT', 'FIXED'].includes(commissionRuleType)) {
      throw new BadRequestException('启用团长分佣时，必须选择按比例或固定金额');
    }
    if (!Number.isFinite(commissionRuleValue) || !Number.isInteger(commissionRuleValue) || commissionRuleValue <= 0) {
      throw new BadRequestException('团长分佣规则值必须是大于 0 的整数');
    }
    if (commissionRuleType === 'PERCENT' && commissionRuleValue > 10_000) {
      throw new BadRequestException('比例分佣不能超过 100%');
    }
    return {
      commissionEnabled: true,
      commissionRuleType,
      commissionRuleValue,
    };
  }

  /**
   * 管理员直接绑定团长时也走与申请审核一致的“解绑旧成员关系 → 绑定团长团队”事务，
   * 避免旧的任务账号仍指向原团队。
   */
  private async promoteDistributionUserToLeader(params: {
    appUser: any;
    group: any;
    operatorId: string;
    bindSource: string;
    phone: string;
    leaderName: string;
  }) {
    const normalizedPhone = this.normalizePhone(params.phone);
    const existingLeaderGroup = await this.prisma.distributionGroup.findFirst({
      where: {
        leaderUserId: params.appUser.id,
        status: { in: ['ENABLED', 'DISABLED'] },
        deletedAt: null,
        NOT: { id: params.group.id },
      },
      select: { id: true, name: true },
    });
    if (existingLeaderGroup) {
      throw new ConflictException(`该 H5 用户已是团长「${existingLeaderGroup.name}」，不能重复绑定`);
    }
    if (params.group.leaderUserId && params.group.leaderUserId !== params.appUser.id) {
      throw new ConflictException('当前团队已经绑定其他团长，请先停用或调整原团长');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.distributionUserBinding.updateMany({
        where: { userId: params.appUser.id, status: 'ENABLED' },
        data: { status: 'DISABLED', unbindAt: new Date() },
      });
      await tx.distributionTaskAccount.updateMany({
        where: { userId: params.appUser.id },
        data: { isDefault: false },
      });

      const phoneAccount = await tx.distributionTaskAccount.findUnique({ where: { phone: normalizedPhone } });
      if (phoneAccount && phoneAccount.userId !== params.appUser.id) {
        throw new ConflictException('该手机号已绑定其他微信账号，请使用原微信账号登录或联系管理员处理');
      }
      const taskAccount = phoneAccount
        ? await tx.distributionTaskAccount.update({
            where: { id: phoneAccount.id },
            data: {
              tenantId: params.group.tenantId,
              groupId: params.group.id,
              nickname: params.leaderName || phoneAccount.nickname,
              status: 'ENABLED',
              isDefault: true,
              smsVerified: true,
            },
          })
        : await tx.distributionTaskAccount.create({
            data: {
              id: this.generateCuidLike('dta'),
              userId: params.appUser.id,
              tenantId: params.group.tenantId,
              groupId: params.group.id,
              phone: normalizedPhone,
              nickname: params.leaderName || params.appUser.nickname || `用户${normalizedPhone.slice(-4)}`,
              status: 'ENABLED',
              isDefault: true,
              smsVerified: true,
            },
          });

      await tx.distributionUserBinding.create({
        data: {
          id: this.generateCuidLike('dub'),
          userId: params.appUser.id,
          tenantId: params.group.tenantId,
          groupId: params.group.id,
          status: 'ENABLED',
          bindSource: params.bindSource,
          inviteCode: params.group.leaderBindCode,
        },
      });
      return tx.distributionGroup.update({
        where: { id: params.group.id },
        data: {
          leaderUserId: params.appUser.id,
          leaderTaskAccountId: taskAccount.id,
          leaderPhone: normalizedPhone,
          leaderName: params.leaderName,
        },
      });
    });
  }

  private async requireAdminDistributionGroup(id: string, user: CurrentUserPayload) {
    const tenantId = resolveVisibleTenantId(user);
    const group = await this.prisma.distributionGroup.findFirst({ where: { id, ...(tenantId ? { tenantId } : {}) } });
    if (!group) throw new NotFoundException('团长/分发组不存在');
    return group;
  }

  private async ensureDistributionGroupForTask(tenantId: string, scope?: string | null, groupId?: string | null) {
    const resolvedScope = String(scope || 'TENANT').toUpperCase() === 'GROUP' ? 'GROUP' : 'TENANT';
    if (resolvedScope !== 'GROUP') return null;
    return this.requireDistributionGroupById(groupId, tenantId);
  }

  /**
   * 将任务金额和团长默认规则收敛为不可变快照。
   * rewardAmount 始终是成员端可见及结算的金额，绝不把团长佣金混入成员金额。
   */
  private async resolveTaskCommissionSnapshot(params: {
    tenantId: string;
    input: any;
    distributionScope?: string | null;
    distributionGroup?: any | null;
  }): Promise<TaskCommissionSnapshot> {
    const distributionScope: 'TENANT' | 'GROUP' =
      String(params.distributionScope || 'TENANT').toUpperCase() === 'GROUP' ? 'GROUP' : 'TENANT';
    const distributionGroupId =
      distributionScope === 'GROUP' ? String(params.distributionGroup?.id || '').trim() || null : null;
    const taskBudgetAmount = this.normalizeMoneyCent(
      params.input?.taskBudgetAmount ?? params.input?.rewardAmount ?? 0,
      '任务金额',
    );
    const commissionEnabled = Boolean(params.input?.commissionEnabled);

    if (!commissionEnabled) {
      return {
        distributionScope,
        distributionGroupId,
        taskBudgetAmount,
        workerRewardAmount: taskBudgetAmount,
        commissionEnabled: false,
        commissionMode: null,
        commissionRuleType: null,
        commissionRuleValue: null,
        commissionAmount: 0,
        commissionGroupId: null,
        commissionLeaderUserId: null,
      };
    }

    if (distributionScope !== 'GROUP' || !params.distributionGroup) {
      throw new BadRequestException('启用团长分佣时，任务范围必须选择已启用的指定团长');
    }
    const group = params.distributionGroup;
    if (!String(group.leaderUserId || '').trim()) {
      throw new BadRequestException('指定团长尚未绑定 H5 账号，不能启用团长分佣');
    }
    // Commission rules are configured and frozen by the current task only.
    // Group-level default commission flags and rules are legacy data and must not gate task creation.
    const ruleType = String(params.input?.commissionRuleType || '').toUpperCase();
    const ruleValue = Number(params.input?.commissionRuleValue || 0);
    if (!['PERCENT', 'FIXED'].includes(ruleType) || !Number.isInteger(ruleValue) || ruleValue <= 0) {
      throw new BadRequestException('启用团长分佣时，必须在当前任务选择分佣方式并填写分佣值');
    }
    if (ruleType === 'PERCENT' && ruleValue > 10_000) {
      throw new BadRequestException('比例分佣不能超过 100%');
    }
    const commissionAmount =
      ruleType === 'PERCENT' ? Math.floor((taskBudgetAmount * ruleValue) / 10_000) : ruleValue;
    if (commissionAmount <= 0) {
      throw new BadRequestException('按当前任务金额计算出的团长佣金为 0，请提高任务金额或调整团长规则');
    }

    const mode: 'INCLUDED' | 'EXTRA' =
      String(params.input?.commissionMode || 'EXTRA').toUpperCase() === 'INCLUDED' ? 'INCLUDED' : 'EXTRA';
    if (mode === 'INCLUDED' && commissionAmount >= taskBudgetAmount) {
      throw new BadRequestException('包含团长分佣时，团长佣金必须小于任务金额，成员端金额必须大于 0');
    }

    return {
      distributionScope,
      distributionGroupId,
      taskBudgetAmount,
      workerRewardAmount: mode === 'INCLUDED' ? taskBudgetAmount - commissionAmount : taskBudgetAmount,
      commissionEnabled: true,
      commissionMode: mode,
      commissionRuleType: ruleType as 'PERCENT' | 'FIXED',
      commissionRuleValue: ruleValue,
      commissionAmount,
      commissionGroupId: group.id,
      commissionLeaderUserId: group.leaderUserId,
    };
  }

  private normalizeMoneyCent(value: unknown, label: string) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue) || !Number.isInteger(numberValue) || numberValue < 0) {
      throw new BadRequestException(`${label}必须是大于或等于 0 的整数分`);
    }
    return numberValue;
  }

  private isSameTaskCommissionSnapshot(task: any, snapshot: TaskCommissionSnapshot) {
    const originalBudget =
      Number(task.taskBudgetAmount) > 0 ? Number(task.taskBudgetAmount) : Number(task.rewardAmount || 0);
    return (
      Number(task.rewardAmount || 0) === snapshot.workerRewardAmount &&
      originalBudget === snapshot.taskBudgetAmount &&
      Boolean(task.commissionEnabled) === snapshot.commissionEnabled &&
      String(task.distributionScope || 'TENANT') === snapshot.distributionScope &&
      String(task.distributionGroupId || '') === String(snapshot.distributionGroupId || '') &&
      String(task.commissionMode || '') === String(snapshot.commissionMode || '') &&
      String(task.commissionRuleType || '') === String(snapshot.commissionRuleType || '') &&
      Number(task.commissionRuleValue || 0) === Number(snapshot.commissionRuleValue || 0) &&
      Number(task.commissionAmount || 0) === snapshot.commissionAmount &&
      String(task.commissionGroupId || '') === String(snapshot.commissionGroupId || '') &&
      String(task.commissionLeaderUserId || '') === String(snapshot.commissionLeaderUserId || '')
    );
  }

  private async findDistributionGroupByInvite(code: string) {
    const normalized = String(code || '').trim().toUpperCase();
    const group = await this.prisma.distributionGroup.findFirst({ where: { memberInviteCode: normalized, deletedAt: null } });
    if (!group) throw new NotFoundException('邀请码不存在');
    if (group.status !== 'ENABLED') throw new BadRequestException('该邀请码已停用，请联系管理员');
    return group;
  }

  private async findDistributionGroupByLeaderCode(code: string) {
    const normalized = String(code || '').trim().toUpperCase();
    const group = await this.prisma.distributionGroup.findFirst({ where: { leaderBindCode: normalized, deletedAt: null } });
    if (!group) throw new NotFoundException('团长身份绑定码不存在');
    if (group.status !== 'ENABLED') throw new BadRequestException('该团长已停用，请联系管理员');
    return group;
  }

  private async toDistributionGroupPublic(group: any) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: group.tenantId }, select: { id: true, name: true, code: true } });
    return { id: group.id, name: group.name, tenantId: group.tenantId, tenantName: tenant?.name || '', tenant, leaderUserId: group.leaderUserId || null };
  }

  private async ensureUserBinding(userId: string, group: any, bindSource: string, inviteCode?: string | null) {
    const exists = await this.prisma.distributionUserBinding.findFirst({ where: { userId, status: 'ENABLED' } });
    if (exists && exists.groupId !== group.id) {
      throw new ConflictException('当前账号已加入其他团队，暂不支持自行切换，请联系管理员处理');
    }
    if (exists) return exists;
    return this.prisma.distributionUserBinding.create({
      data: { id: this.generateCuidLike('dub'), userId, tenantId: group.tenantId, groupId: group.id, status: 'ENABLED', bindSource, inviteCode: inviteCode || null },
    });
  }

  private async requireDistributionBinding(userId: string) {
    const binding = await this.prisma.distributionUserBinding.findFirst({ where: { userId, status: 'ENABLED' }, orderBy: { createdAt: 'desc' } });
    if (!binding) {
      throw new BadRequestException({ code: 'NEED_BIND_INVITE', message: '请先输入邀请码加入团队' });
    }
    const group = await this.prisma.distributionGroup.findFirst({ where: { id: binding.groupId, status: 'ENABLED' } });
    if (!group) throw new BadRequestException({ code: 'NEED_BIND_INVITE', message: '当前团队已停用，请联系管理员' });
    return binding;
  }

  private async ensureTaskAccountForUser(appUser: any, group: any, nickname: string, phone: string, markDefault: boolean, smsVerified = true) {
    const normalizedPhone = this.normalizePhone(phone);
    let existing = await this.prisma.distributionTaskAccount.findUnique({ where: { phone: normalizedPhone } });
    if (existing && existing.userId !== appUser.id) {
      const owner = await this.prisma.appUser.findUnique({
        where: { id: existing.userId },
        select: { deletedAt: true },
      });
      if (owner?.deletedAt) {
        await this.prisma.$transaction([
          this.prisma.distributionGroup.updateMany({ where: { leaderTaskAccountId: existing.id }, data: { leaderTaskAccountId: null } }),
          this.prisma.distributionTaskAccount.delete({ where: { id: existing.id } }),
        ]);
        existing = null;
      } else {
        throw new ConflictException('该手机号已绑定其他微信账号，请使用原微信账号登录或联系管理员处理');
      }
    }
    if (existing) {
      // 团长解绑后，原任务账号会被停用；用户随后通过邀请码加入新团队时，必须在这里
      // 重新启用并切换账号归属，不能只改默认标识，否则 H5 会持续拿到旧团队的停用账号。
      const shouldBeDefault = markDefault || !existing.isDefault;
      if (shouldBeDefault) {
        await this.prisma.distributionTaskAccount.updateMany({ where: { userId: appUser.id }, data: { isDefault: false } });
      }
      return this.prisma.distributionTaskAccount.update({
        where: { id: existing.id },
        data: {
          tenantId: group.tenantId,
          groupId: group.id,
          status: 'ENABLED',
          isDefault: shouldBeDefault,
          nickname: nickname || existing.nickname,
          smsVerified: smsVerified || existing.smsVerified,
        },
      });
    }
    const hasDefault = await this.prisma.distributionTaskAccount.findFirst({ where: { userId: appUser.id, isDefault: true, status: 'ENABLED' }, select: { id: true } });
    if (markDefault || !hasDefault) await this.prisma.distributionTaskAccount.updateMany({ where: { userId: appUser.id }, data: { isDefault: false } });
    return this.prisma.distributionTaskAccount.create({
      data: {
        id: this.generateCuidLike('dta'),
        userId: appUser.id,
        tenantId: group.tenantId,
        groupId: group.id,
        phone: normalizedPhone,
        nickname: nickname || appUser.nickname || `用户${normalizedPhone.slice(-4)}`,
        smsVerified,
        status: 'ENABLED',
        isDefault: markDefault || !hasDefault,
      },
    });
  }

  private async getActiveDistributionTaskAccount(appUser: any, requestedTaskAccountId?: string | null) {
    const requested = String(requestedTaskAccountId || '').trim();
    const account = requested
      ? await this.prisma.distributionTaskAccount.findFirst({ where: { id: requested, userId: appUser.id, status: 'ENABLED' } })
      : await this.prisma.distributionTaskAccount.findFirst({ where: { userId: appUser.id, status: 'ENABLED', isDefault: true }, orderBy: { updatedAt: 'desc' } })
        ?? await this.prisma.distributionTaskAccount.findFirst({ where: { userId: appUser.id, status: 'ENABLED' }, orderBy: { createdAt: 'asc' } });
    if (account) {
      const accountGroup = await this.prisma.distributionGroup.findFirst({ where: { id: account.groupId, status: 'ENABLED', deletedAt: null }, select: { id: true } });
      if (!accountGroup) throw new BadRequestException({ code: 'NEED_BIND_INVITE', message: '当前团队已停用或正在处理，请联系管理员' });
      return account;
    }
    const binding = await this.requireDistributionBinding(appUser.id);
    const group = await this.requireDistributionGroupById(binding.groupId, binding.tenantId);
    const phone = this.normalizePhone(appUser.phone);
    if (!this.isValidNormalizedPhone(phone)) throw new BadRequestException('请先完善手机号后再领取任务');
    return this.ensureTaskAccountForUser(appUser, group, appUser.nickname || `用户${phone.slice(-4)}`, phone, true);
  }

  private async getAccessibleGroupIdsForAccount(account: any) {
    const now = new Date();
    const collabs = await this.prisma.groupCollaboration.findMany({
      where: {
        tenantId: account.tenantId,
        targetGroupId: account.groupId,
        status: 'APPROVED',
        OR: [{ startAt: null }, { startAt: { lte: now } }],
        AND: [{ OR: [{ endAt: null }, { endAt: { gte: now } }] }],
      },
      select: { id: true, sourceGroupId: true },
    });
    return { directGroupId: account.groupId, sourceGroupIds: collabs.map((item) => item.sourceGroupId), collaborations: collabs };
  }


  private async resolveDistributionTenantId(tenantRef?: string | null) {
    const ref = String(tenantRef ?? '').trim();
    if (!ref || ref === '0' || ref === 'null' || ref === 'undefined') return null;
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        deletedAt: null,
        OR: [{ id: ref }, { code: ref }],
      },
      select: { id: true },
    });
    return tenant?.id ?? null;
  }

  private async releaseDeletedAppUserIdentity(where: Prisma.AppUserWhereUniqueInput) {
    const existing = await this.prisma.appUser.findUnique({
      where,
      select: { id: true, deletedAt: true },
    });
    if (!existing?.deletedAt) return existing;
    await this.prisma.appUser.update({
      where: { id: existing.id },
      data: {
        phone: null,
        serviceOpenid: null,
        wechatOpenid: null,
        unionid: null,
        status: 'DISABLED',
      },
    });
    return existing;
  }


  private readDistributionBearerToken(authorization?: string) {
    const raw = String(authorization ?? '').trim();
    if (!raw) return '';
    return raw.replace(/^Bearer\s+/i, '').trim();
  }

  private readMetaAuthorization(meta?: RequestMeta) {
    const authorization = meta?.authorization;
    return Array.isArray(authorization) ? authorization[0] : authorization ?? undefined;
  }

  private async tryDistributionAppUser(authorization?: string) {
    const token = this.readDistributionBearerToken(authorization);
    if (!token) return null;
    const raw = await this.redisService.get(`distribution:session:${token}`);
    if (!raw) return null;
    const payload = JSON.parse(raw) as { appUserId?: string };
    if (!payload.appUserId) return null;
    return this.prisma.appUser.findFirst({ where: { id: payload.appUserId, deletedAt: null } });
  }

  private async bindDistributionAppUserPhone(
    appUser: {
      id: string;
      phone: string | null;
      nickname: string | null;
      serviceOpenid: string | null;
      unionid: string | null;
      avatarUrl: string | null;
    },
    phone: string,
    nickname: string,
    authorization?: string,
  ) {
    const normalizedPhone = this.normalizePhone(phone);
    if (!this.isValidNormalizedPhone(normalizedPhone)) {
      throw new BadRequestException('手机号格式不正确');
    }
    if (appUser.phone === normalizedPhone) {
      return this.prisma.appUser.update({
        where: { id: appUser.id },
        data: { nickname: nickname || appUser.nickname || undefined },
      });
    }
    if (appUser.phone && appUser.phone !== normalizedPhone) {
      throw new BadRequestException('当前微信账号已绑定其他手机号，请使用已绑定手机号');
    }

    let phoneUser = await this.prisma.appUser.findUnique({ where: { phone: normalizedPhone } });
    if (phoneUser?.deletedAt && phoneUser.id !== appUser.id) {
      await this.releaseDeletedAppUserIdentity({ phone: normalizedPhone });
      phoneUser = null;
    }
    if (phoneUser && phoneUser.id !== appUser.id) {
      const merged = await this.prisma.$transaction(async (tx) => {
        await tx.taskParticipant.updateMany({
          where: { appUserId: appUser.id },
          data: { appUserId: phoneUser.id },
        });
        await tx.appUser.update({
          where: { id: appUser.id },
          data: {
            serviceOpenid: null,
            wechatOpenid: null,
            unionid: null,
            deletedAt: new Date(),
            status: 'DISABLED',
          },
        });
        return tx.appUser.update({
          where: { id: phoneUser.id },
          data: {
            serviceOpenid: phoneUser.serviceOpenid || appUser.serviceOpenid || undefined,
            unionid: phoneUser.unionid || appUser.unionid || undefined,
            avatarUrl: phoneUser.avatarUrl || appUser.avatarUrl || undefined,
            nickname: nickname || phoneUser.nickname || appUser.nickname || undefined,
            deletedAt: null,
            status: 'ENABLED',
            lastLoginAt: new Date(),
          },
        });
      });
      await this.rewriteDistributionSessionAppUser(authorization, merged.id, merged.phone);
      return merged;
    }

    const updated = await this.prisma.appUser.update({
      where: { id: appUser.id },
      data: {
        phone: normalizedPhone,
        nickname: nickname || appUser.nickname || undefined,
        lastLoginAt: new Date(),
      },
    });
    await this.rewriteDistributionSessionAppUser(authorization, updated.id, updated.phone);
    return updated;
  }

  private async rewriteDistributionSessionAppUser(authorization: string | undefined, appUserId: string, phone?: string | null) {
    const token = this.readDistributionBearerToken(authorization);
    if (!token) return;
    const key = `distribution:session:${token}`;
    const raw = await this.redisService.get(key);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      await this.redisService.set(key, JSON.stringify({ ...parsed, appUserId, phone, updatedAt: new Date().toISOString() }), 7 * 24 * 60 * 60);
    } catch {
      await this.redisService.set(key, JSON.stringify({ appUserId, phone, updatedAt: new Date().toISOString() }), 7 * 24 * 60 * 60);
    }
  }

  private async requireDistributionAppUser(authorization?: string) {
    const appUser = await this.tryDistributionAppUser(authorization);
    if (!appUser) {
      throw new BadRequestException('请先登录后再操作');
    }
    return appUser;
  }

  private resolveAppUserStatus(appUser: { status: string; bannedUntil: Date | null; banReason: string | null }) {
    const now = new Date();
    const stillInBanWindow = appUser.bannedUntil ? appUser.bannedUntil.getTime() > now.getTime() : false;
    const disabled = appUser.status === 'DISABLED';
    const banned = disabled || stillInBanWindow;
    return {
      status: banned ? 'RESTRICTED' : 'ENABLED',
      canClaim: !banned,
      bannedUntil: banned ? appUser.bannedUntil : null,
      banReason: banned ? appUser.banReason : null,
      message: banned ? (appUser.banReason || '当前账号处于限制接单状态') : null,
    };
  }

  private async assertAppUserCanClaim(appUser: { status: string; bannedUntil: Date | null; banReason: string | null }) {
    const status = this.resolveAppUserStatus(appUser);
    if (!status.canClaim) {
      throw new BadRequestException(status.message || '当前账号不可接单');
    }
  }

  private async assertDistributionProfileCompleted(appUser: { phone: string | null; nickname: string | null }) {
    if (!this.isValidNormalizedPhone(this.normalizePhone(appUser.phone))) {
      throw new BadRequestException('请先完善手机号后再领取任务');
    }
    if (!String(appUser.nickname || '').trim()) {
      throw new BadRequestException('请先完善姓名后再领取任务');
    }
  }

  private toAppUserProfile(appUser: {
    id: string;
    phone: string | null;
    nickname: string | null;
    avatarUrl: string | null;
    status: string;
    bannedUntil: Date | null;
    banReason: string | null;
    totalCompletedOrders: number;
    totalSettledAmount: number;
    balanceAmount: number;
    withdrawnAmount: number;
  }) {
    const resolvedStatus = this.resolveAppUserStatus(appUser);
    return {
      id: appUser.id,
      phone: appUser.phone,
      nickname: appUser.nickname,
      avatarUrl: appUser.avatarUrl,
      status: resolvedStatus.status,
      bannedUntil: resolvedStatus.bannedUntil,
      banReason: resolvedStatus.banReason,
      totalCompletedOrders: appUser.totalCompletedOrders,
      totalSettledAmount: appUser.totalSettledAmount,
      balanceAmount: appUser.balanceAmount,
      withdrawnAmount: appUser.withdrawnAmount,
      isProfileCompleted: this.isValidNormalizedPhone(this.normalizePhone(appUser.phone)) && Boolean(String(appUser.nickname || '').trim()),
    };
  }

  private async findCurrentDistributionParticipant(appUserId: string, taskAccountId?: string | null) {
    return this.prisma.taskParticipant.findFirst({
      where: {
        appUserId,
        ...(taskAccountId ? { taskAccountId } : {}),
        status: { in: ['STARTED', 'CLAIMED'] },
        OR: [{ settlementStatus: { not: 'REJECTED' } }, { resubmitStartedAt: { not: null } }],
        task: { deletedAt: null },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        task: {
          include: {
            tenant: { select: { id: true, name: true, code: true } },
            mediaAccount: { select: { id: true, accountName: true, accountId: true, platform: true } },
            videoLinks: { orderBy: [{ isPrimary: 'desc' }, { sort: 'asc' }] },
          },
        },
        comments: {
          where: { status: { in: ['CLAIMED', 'COMPLETED'] } },
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
          take: 1,
        },
      },
    });
  }

  private async toDistributionCurrentTask(participant: any) {
    const proofImageUrls = await this.listParticipantProofUrls(participant.id);
    const latestComment = participant.comments?.[0] ?? null;
    return {
      participantId: participant.id,
      taskAccountId: participant.taskAccountId || null,
      taskAccountPhone: participant.taskAccountPhone || null,
      taskAccountNickname: participant.taskAccountNickname || null,
      visitorToken: participant.visitorToken,
      status: participant.status,
      settlementStatus: participant.settlementStatus,
      rejectReason: participant.settlementStatus === 'REJECTED' ? participant.settlementRemark : null,
      rejectedAt: participant.rejectedAt ?? null,
      resubmitStartedAt: participant.resubmitStartedAt ?? null,
      task: await this.toDistributionTaskCard(participant.task),
      visitor: this.toVisitorState(participant, latestComment, proofImageUrls),
      commentId: latestComment?.id ?? null,
      commentContent: latestComment?.content ?? null,
    };
  }

  private getTodayRange() {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    return { start, end };
  }

  private async countTodayAbandons(appUserId: string) {
    const { start, end } = this.getTodayRange();
    return this.prisma.taskAbandonLog.count({
      where: {
        appUserId,
        createdAt: { gte: start, lt: end },
      },
    });
  }

  private async pickDistributionClaimTask(dto: DistributionClaimDto, appUserId?: string, taskAccount?: any) {
    const platform = dto.platform ? this.normalizePlatform(dto.platform) : undefined;
    const taskId = String(dto.taskId ?? '').trim();
    if (!taskAccount) return null;
    const access = await this.getAccessibleGroupIdsForAccount(taskAccount);
    const collaborationGroupIds = Array.from(new Set(access.sourceGroupIds.filter(Boolean)));
    const visibilityWhere: Prisma.DailyTaskWhereInput[] = [
      { distributionScope: 'TENANT' },
      { distributionGroupId: access.directGroupId },
      ...(collaborationGroupIds.length ? [{ distributionGroupId: { in: collaborationGroupIds }, allowGroupCollaboration: true }] : []),
    ];
    const excludedByPhoneWhere: Prisma.DailyTaskWhereInput = {
      participants: { none: { taskAccountPhone: taskAccount.phone, status: { in: ['STARTED', 'CLAIMED', 'COMPLETED'] } } },
    };
    const baseWhere: Prisma.DailyTaskWhereInput = {
      tenantId: taskAccount.tenantId,
      deletedAt: null,
      status: { in: ['READY', 'DISPATCHED', 'RUNNING'] },
      dispatchedAt: { not: null },
      ...(platform ? { platform } : {}),
      OR: visibilityWhere,
      comments: { some: { status: 'AVAILABLE' } },
      ...excludedByPhoneWhere,
    };
    if (taskId) {
      return this.prisma.dailyTask.findFirst({
        where: { ...baseWhere, id: taskId },
        include: { tenant: { select: { id: true, name: true, code: true } }, mediaAccount: true, videoLinks: { orderBy: [{ isPrimary: 'desc' }, { sort: 'asc' }] } },
      });
    }
    const candidates = await this.prisma.dailyTask.findMany({
      where: baseWhere,
      take: 50,
      orderBy: [{ createdAt: 'desc' }],
      include: { tenant: { select: { id: true, name: true, code: true } }, mediaAccount: true, videoLinks: { orderBy: [{ isPrimary: 'desc' }, { sort: 'asc' }] } },
    });
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private async getDistributionUserTaskStatusMap(appUserId: string, taskIds: string[], taskAccountId?: string | null, taskAccountPhone?: string | null) {
    const ids = Array.from(new Set(taskIds.map((id) => String(id || '').trim()).filter(Boolean)));
    const map = new Map<string, 'CURRENT' | 'COMPLETED'>();
    if (!appUserId || !ids.length) return map;
    const participants = await this.prisma.taskParticipant.findMany({
      where: {
        appUserId,
        taskId: { in: ids },
        ...(taskAccountId ? { taskAccountId } : taskAccountPhone ? { taskAccountPhone } : {}),
        status: { in: ['STARTED', 'CLAIMED', 'COMPLETED'] },
      },
      select: { taskId: true, status: true, updatedAt: true },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
    for (const participant of participants) {
      const taskId = participant.taskId;
      const status = String(participant.status || '').toUpperCase();
      if (status === 'STARTED' || status === 'CLAIMED') {
        map.set(taskId, 'CURRENT');
        continue;
      }
      if (status === 'COMPLETED' && !map.has(taskId)) {
        map.set(taskId, 'COMPLETED');
      }
    }
    return map;
  }

  private async toDistributionTaskCard(task: any, userTaskStatus?: 'CURRENT' | 'COMPLETED') {
    const availableCount = await this.prisma.taskComment.count({ where: { taskId: task.id, status: 'AVAILABLE' } });
    return {
      id: task.id,
      postId: task.postId,
      tenantId: task.tenantId,
      tenant: task.tenant ?? null,
      platform: task.platform,
      title: task.title,
      authorName: task.authorName || task.mediaAccount?.accountName || null,
      videoUrl: this.toTaskVideoUrlArray(task),
      coverUrl: task.coverUrl,
      copywriting: task.copywriting,
      rewardAmount: task.rewardAmount ?? 0,
      targetCommentCount: task.targetCommentCount,
      claimedCommentCount: task.claimedCommentCount,
      completedCommentCount: task.completedCommentCount,
      availableCommentCount: availableCount,
      status: task.status,
      distributionScope: task.distributionScope || 'TENANT',
      distributionGroupId: task.distributionGroupId || null,
      allowGroupCollaboration: Boolean(task.allowGroupCollaboration),
      userTaskStatus: userTaskStatus ?? 'CLAIMABLE',
      isCurrentForMe: userTaskStatus === 'CURRENT',
      isCompletedByMe: userTaskStatus === 'COMPLETED',
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  private buildDistributionHomepageProofBizId(appUserId: string, taskAccountId: string, platform: string) {
    return `${appUserId}:${taskAccountId}:${platform}`;
  }

  private buildLegacyDistributionHomepageProofBizId(appUserId: string, platform: string) {
    return `${appUserId}:${platform}`;
  }

  private assertDistributionHomepageProofFile(file: Pick<UploadFile, 'scene' | 'mimeType'>) {
    if (file.scene !== 'TASK_CLAIM_PROOF' || !String(file.mimeType || '').toLowerCase().startsWith('image/')) {
      throw new BadRequestException('用户主页截图必须是任务凭证图片');
    }
  }

  private toDistributionHomepageRecognitionSummary(value: any) {
    if (!value) return null;
    return {
      expectedPlatform: value.expectedPlatform || null,
      detectedPlatform: value.detectedPlatform || null,
      platformConfidence: value.platformConfidence ?? null,
      nicknameCandidate: value.nicknameCandidate || null,
      accountIdCandidate: value.accountIdCandidate || null,
      status: value.ocrStatus || 'NOT_REQUESTED',
      error: value.ocrError || null,
      requestedAt: value.ocrRequestedAt || null,
      completedAt: value.ocrCompletedAt || null,
    };
  }

  private async ensureDistributionHomepageProofBinding(file: OrderMediaFile, appUser: any, taskAccount: any, platform: string) {
    const scopedBizId = this.buildDistributionHomepageProofBizId(appUser.id, taskAccount.id, platform);
    const legacyBizId = this.buildLegacyDistributionHomepageProofBizId(appUser.id, platform);
    const existingBindings = await this.prisma.fileUsage.findMany({
      where: {
        fileId: file.id,
        bizType: DISTRIBUTION_HOMEPAGE_PROOF_BIZ_TYPE,
        fieldName: DISTRIBUTION_HOMEPAGE_PROOF_FIELD,
      },
      select: { bizId: true },
      take: 20,
    });
    if (existingBindings.some((item) => item.bizId !== scopedBizId && item.bizId !== legacyBizId)) {
      throw new ForbiddenException('该用户主页截图已归属其他任务账号');
    }

    const hasScopedBinding = existingBindings.some((item) => item.bizId === scopedBizId);
    if (!hasScopedBinding) {
      const participantUsages = await this.prisma.fileUsage.findMany({
        where: { fileId: file.id, bizType: 'TASK_PARTICIPANT', fieldName: 'confirmProof' },
        select: { bizId: true },
        take: 10,
      });
      if (participantUsages.length) {
        const ownerParticipant = await this.prisma.taskParticipant.findFirst({
          where: {
            id: { in: participantUsages.map((item) => item.bizId) },
            appUserId: appUser.id,
            taskAccountId: taskAccount.id,
            task: { deletedAt: null, platform },
          },
          select: { id: true },
        });
        if (!ownerParticipant) {
          throw new ForbiddenException('该用户主页截图不属于当前任务账号');
        }
      } else if (existingBindings.some((item) => item.bizId === legacyBizId)) {
        // 历史绑定只有“用户 + 平台”维度。一个用户有多个手机号任务账号时无法安全推断归属，不能猜测并串用。
        const taskAccountCount = await this.prisma.distributionTaskAccount.count({
          where: { userId: appUser.id, status: 'ENABLED' },
        });
        if (taskAccountCount > 1) {
          throw new BadRequestException('该主页截图为旧缓存，无法确认归属手机号任务账号，请在当前账号下重新上传');
        }
      } else {
        // 上传后、任务尚未完成时仅允许当前进行中任务账号保留该截图。
        const current = await this.findCurrentDistributionParticipant(appUser.id, taskAccount.id);
        if (!current || this.normalizePlatform(String(current.task?.platform || '')) !== platform) {
          throw new ForbiddenException('当前任务账号没有可绑定的主页截图');
        }
      }
      await this.bindFileToBizIfNeeded(file.id, DISTRIBUTION_HOMEPAGE_PROOF_BIZ_TYPE, scopedBizId, DISTRIBUTION_HOMEPAGE_PROOF_FIELD);
    }
  }

  private async upsertDistributionHomepageRecognition(taskAccountId: string, platform: string, fileId: string) {
    const existing = await this.prisma.distributionTaskAccountHomepageRecognition.findUnique({
      where: { taskAccountId_expectedPlatform: { taskAccountId, expectedPlatform: platform } },
    });
    if (existing?.homepageProofFileId === fileId) return existing;
    return this.prisma.distributionTaskAccountHomepageRecognition.upsert({
      where: { taskAccountId_expectedPlatform: { taskAccountId, expectedPlatform: platform } },
      create: {
        taskAccountId,
        expectedPlatform: platform,
        homepageProofFileId: fileId,
        ocrStatus: 'NOT_REQUESTED',
      },
      update: {
        homepageProofFileId: fileId,
        detectedPlatform: null,
        platformConfidence: null,
        nicknameCandidate: null,
        accountIdCandidate: null,
        ocrStatus: 'NOT_REQUESTED',
        ocrText: null,
        ocrError: null,
        ocrAttemptCount: 0,
        ocrRequestedAt: null,
        ocrStartedAt: null,
        ocrCompletedAt: null,
      },
    });
  }

  private async resolveDistributionHomepageRecognition(
    fileId: string,
    dto: DistributionHomepageProofRecognitionRequestDto,
    authorization?: string,
  ) {
    const appUser = await this.requireDistributionAppUser(authorization);
    const platform = this.normalizePlatform(dto.platform);
    const file = await this.filesService.getFile(String(fileId || '').trim());
    this.assertDistributionHomepageProofFile(file);
    const taskAccount = await this.getActiveDistributionTaskAccount(appUser, dto.taskAccountId);
    await this.ensureDistributionHomepageProofBinding(file, appUser, taskAccount, platform);
    const profile = await this.upsertDistributionHomepageRecognition(taskAccount.id, platform, file.id);
    return { appUser, taskAccount, platform, file, profile };
  }

  private async toDistributionHomepageProofAccessResponse(file: OrderMediaFile, platform: string, request?: Request) {
    // 只有用户主页截图的缓存续签路径做实体存在性校验：可精确区分“图片已删除”和“签名过期”。
    // 普通订单图片列表不走此检查，避免为列表加载额外产生对象存储 HEAD 请求。
    await this.filesService.assertStoredObjectExists(file);
    const access = await this.filesService.getReadAccess(file, 'original');
    const url = this.filesService.makeFullUrl(access.url, request);
    return {
      fileId: file.id,
      platform,
      url,
      fullUrl: url,
      expiresAt: access.expiresAt,
    };
  }

  private async bindFileToBizIfNeeded(fileId: string, bizType: string, bizId: string, fieldName: string) {
    const exists = await this.prisma.fileUsage.findFirst({
      where: { fileId, bizType, bizId, fieldName },
      select: { id: true },
    });
    if (exists) return;
    await this.filesService.activateAndBind(fileId, { bizType, bizId, fieldName });
  }

  private async bindFilesToBizIfNeeded(fileIds: string[], bizType: string, bizId: string, fieldName: string) {
    const uniqueFileIds = Array.from(new Set(fileIds.filter(Boolean)));
    for (const fileId of uniqueFileIds) {
      await this.bindFileToBizIfNeeded(fileId, bizType, bizId, fieldName);
    }
  }

  private async resolveProofFiles(
    dto: Pick<PublicConfirmCompleteDto, 'proofFileIds' | 'proofFileId' | 'uploadedImageFileId' | 'uploadedImageUrl'>,
  ) {
    const uniqueFileIds = Array.from(
      new Set(
        [...(dto.proofFileIds ?? []), dto.proofFileId, dto.uploadedImageFileId]
          .map((fileId) => String(fileId ?? '').trim())
          .filter(Boolean),
      ),
    );
    if (uniqueFileIds.length) {
      return Promise.all(uniqueFileIds.map((fileId) => this.filesService.getFile(fileId)));
    }

    const uploadedImageUrl = String(dto.uploadedImageUrl ?? '').trim();
    if (uploadedImageUrl) {
      return [await this.filesService.getFileByUrl(uploadedImageUrl)];
    }

    throw new BadRequestException('上传凭证不能为空');
  }

  private async listParticipantProofUrls(participantId: string) {
    const proofImageUrlsMap = await this.listParticipantProofUrlsMap([participantId]);
    return proofImageUrlsMap.get(participantId) ?? [];
  }

  private async listParticipantProofUrlsMap(participantIds: string[]) {
    return this.resolveProofUrlsMap(await this.listParticipantProofFilesMap(participantIds));
  }

  private async listParticipantProofFilesMap(participantIds: string[]) {
    const uniqueParticipantIds = Array.from(new Set((participantIds ?? []).map((item) => String(item).trim()).filter(Boolean)));
    const proofFilesMap = new Map<string, OrderMediaFile[]>();
    for (const participantId of uniqueParticipantIds) {
      proofFilesMap.set(participantId, []);
    }
    if (!uniqueParticipantIds.length) {
      return proofFilesMap;
    }

    const usages = await this.prisma.fileUsage.findMany({
      where: { bizType: 'TASK_PARTICIPANT', bizId: { in: uniqueParticipantIds }, fieldName: 'confirmProof' },
      orderBy: [{ bizId: 'asc' }, { createdAt: 'asc' }],
      select: {
        bizId: true,
        file: {
          select: {
            id: true,
            storageDriver: true,
            bucket: true,
            objectKey: true,
            thumbnailObjectKey: true,
            thumbnailMimeType: true,
            thumbnailSize: true,
            imageWidth: true,
            imageHeight: true,
            url: true,
            status: true,
          },
        },
      },
    });

    for (const usage of usages) {
      const file = usage.file as OrderMediaFile | null;
      if (!file || file.status === 'DELETED') continue;
      proofFilesMap.get(usage.bizId)?.push(file);
    }

    return proofFilesMap;
  }

  private emptyProofUrlMap(participantIds: string[]) {
    const result = new Map<string, string[]>();
    for (const participantId of participantIds) {
      result.set(participantId, []);
    }
    return result;
  }

  private async resolveProofUrlsMap(proofFilesMap: Map<string, OrderMediaFile[]>) {
    const result = new Map<string, string[]>();
    for (const [participantId, files] of proofFilesMap.entries()) {
      const urls = await Promise.all(files.map((file) => this.resolveFileUrlSafely(file)));
      result.set(participantId, urls.filter((url): url is string => Boolean(url)));
    }
    return result;
  }

  private async findActiveFilesByIds(fileIds: Array<string | null | undefined>) {
    const uniqueFileIds = Array.from(new Set(fileIds.map((fileId) => String(fileId ?? '').trim()).filter(Boolean)));
    if (!uniqueFileIds.length) return [] as OrderMediaFile[];

    return this.prisma.uploadFile.findMany({
      where: { id: { in: uniqueFileIds }, status: { not: 'DELETED' } },
      select: {
        id: true,
        storageDriver: true,
        bucket: true,
        objectKey: true,
        thumbnailObjectKey: true,
        thumbnailMimeType: true,
        thumbnailSize: true,
        imageWidth: true,
        imageHeight: true,
        url: true,
        status: true,
      },
    }) as Promise<OrderMediaFile[]>;
  }

  private async resolveFileUrlsById(files: OrderMediaFile[]) {
    const result = new Map<string, string | null>();
    for (const file of files) {
      result.set(file.id, await this.resolveFileUrlSafely(file));
    }
    return result;
  }

  private async resolveFileUrlSafely(file: OrderMediaFile) {
    try {
      return await this.filesService.getReadUrl(file);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`订单凭证访问地址生成失败，fileId=${file.id}，reason=${reason}`);
      return null;
    }
  }

  private toLegacyMediaUrls(value?: string | null) {
    const url = this.toLegacyMediaUrl(value);
    return url ? [url] : [];
  }

  private toLegacyMediaUrl(value?: string | null) {
    const url = String(value ?? '').trim();
    // 私有 COS 内部引用绝不能下发给前端；正常新文件应通过 fileId 走受控 access 接口。
    if (!url || /^tencent-cos:\/\//i.test(url)) return null;
    return url;
  }

  private toOrderMediaDescriptor(file: OrderMediaFile) {
    return {
      fileId: file.id,
      storageDriver: file.storageDriver,
      hasThumbnail: Boolean(file.thumbnailObjectKey),
      thumbnailMimeType: file.thumbnailMimeType,
      thumbnailSize: file.thumbnailSize,
      imageWidth: file.imageWidth,
      imageHeight: file.imageHeight,
    };
  }

  private async requestDeepSeekGeneratedComments(dto: AiGenerateCommentsDto & { count: number }) {
    const rows: Record<string, unknown>[] = [];
    const batchSize = 40;
    const batchCount = Math.ceil(dto.count / batchSize);
    for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
      const requestedCount = Math.min(batchSize, dto.count - rows.length);
      const context = {
        requestedCount,
        batchIndex: batchIndex + 1,
        batchCount,
        platform: dto.platform,
        videoTitle: dto.videoTitle,
        videoUrl: dto.videoUrl || '',
        videoContent: dto.videoContent,
        accountPositioning: dto.accountPositioning,
        videoStyle: dto.videoStyle,
        videoScript: dto.videoScript,
        targetAudience: dto.targetAudience,
        audiencePainPoint: dto.audiencePainPoint,
        operationGoal: dto.operationGoal,
        userRequest: dto.messageContent,
        customInstructions: dto.customUserPrompt,
      };
      const result = await this.deepSeekService.chat({
        messages: [
          {
            role: 'system',
            content: [
              'Generate a diverse set of natural Simplified-Chinese social-platform comment drafts for the supplied video context.',
              'Return JSON only as {"rows":[{"content":"..."}]}. Return exactly requestedCount rows.',
              'Each comment must be relevant to explicit video facts, concise, distinct in wording and perspective, and suitable for human review before publishing.',
              'Do not fabricate personal experience, transactions, results, identities, or endorsements. Do not include illegal, abusive, discriminatory, or misleading claims.',
              'Do not mention prompts, automation, workflows, or AI.',
              dto.customSystemPrompt,
            ].filter(Boolean).join('\n'),
          },
          { role: 'user', content: JSON.stringify(context) },
        ],
        jsonMode: true,
        thinkingMode: 'DISABLED',
        temperature: 0.75,
        maxTokens: 4000,
        timeoutMs: this.getCozeGenerateCommentsTimeoutMs(),
      });
      const parsed = this.safeJsonParse(this.unwrapJsonCodeBlock(result.content));
      const generated = this.normalizeCommentRows(parsed).slice(0, requestedCount);
      if (!generated.length) throw new BadGatewayException('DeepSeek did not return valid comment rows');
      rows.push(...generated);
    }
    if (!rows.length) throw new BadGatewayException('DeepSeek did not return valid comment rows');
    return { conversationId: '', rows };
  }

  private async requestCozeGeneratedComments(dto: AiGenerateCommentsDto & { count: number }, user: CurrentUserPayload) {
    const cozeApiBaseUrl = this.configService.get<string>('COZE_API_BASE_URL') || 'https://api.coze.cn';
    const cozePat = String(this.configService.get<string>('COZE_API_PAT') ?? '').trim();
    const workflowId = String(this.configService.get<string>('COZE_WORKFLOW_ID') ?? '').trim();
    const botId = String(this.configService.get<string>('COZE_BOT_ID') ?? '').trim();

    if (!cozePat || !workflowId || !botId) {
      throw new InternalServerErrorException('Coze 配置缺失，请先补充 COZE_API_PAT、COZE_WORKFLOW_ID、COZE_BOT_ID');
    }

    const shouldUseConversationContext = Boolean(dto.useConversationContext);
    const cachedConversationId = shouldUseConversationContext ? await this.getCachedCozeConversationId(dto, user) : '';

    const payload = {
      workflow_id: workflowId,
      bot_id: botId,
      ...(shouldUseConversationContext && cachedConversationId ? { conversation_id: cachedConversationId } : {}),
      additional_messages: [
        {
          role: 'user',
          type: 'question',
          content: dto.messageContent,
          content_type: 'text',
        },
      ],
      parameters: {
        COMMENT_COUNT: dto.count,
        VIDEO_TITLE: dto.videoTitle,
        VIDEO_URL: dto.videoUrl ?? '',
        VIDEO_CONTENT: dto.videoContent,
        ACCOUNT_POSITIONING: dto.accountPositioning,
        VIDEO_STYLE: dto.videoStyle,
        VIDEO_SCRIPT: dto.videoScript,
        TARGET_AUDIENCE: dto.targetAudience,
        AUDIENCE_PAIN_POINT: dto.audiencePainPoint,
        OPERATION_GOAL: dto.operationGoal,
        PLATFORM: dto.platform,
        CUSTOM_SYSTEM_PROMPT: dto.customSystemPrompt,
        CUSTOM_USER_PROMPT: dto.customUserPrompt,
      },
    };

    let response: Response;
    try {
      response = await fetch(`${cozeApiBaseUrl.replace(/\/$/, '')}/v1/workflows/chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cozePat}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.getCozeGenerateCommentsTimeoutMs()),
      });
    } catch (error) {
      const diagnostic = createCozeTransportDiagnostic(error, { workflowId, botId });
      throw new BadGatewayException(
        cozeErrorResponse(formatCozeErrorMessage(diagnostic, 'Coze 评论生成工作流请求失败'), diagnostic),
      );
    }

    let responseText: string;
    try {
      responseText = await response.text();
    } catch (error) {
      const diagnostic = createCozeTransportDiagnostic(error, {
        workflowId,
        botId,
        httpStatus: response.status,
        httpStatusText: response.statusText,
        logId: readCozeLogIdFromHeaders(response.headers),
      });
      throw new BadGatewayException(
        cozeErrorResponse(formatCozeErrorMessage(diagnostic, '读取 Coze 评论生成响应失败'), diagnostic),
      );
    }
    const responseJson = this.parseCozeJsonResponse(responseText, response.headers.get('content-type'));
    const cozeDiagnostic = extractCozeSafeDiagnostic(responseJson, {
      httpStatus: response.status,
      httpStatusText: response.statusText,
      workflowId,
      botId,
      logId: readCozeLogIdFromHeaders(response.headers),
    });

    if (!response.ok || cozeDiagnostic.failure) {
      const fallback = cozeDiagnostic.requiresAction
        ? 'Coze 对话流要求额外操作，当前评论生成接口无法自动继续'
        : `Coze 评论生成工作流调用失败${response.ok ? '' : `（HTTP ${response.status}）`}`;
      const message = formatCozeErrorMessage(cozeDiagnostic, fallback);
      throw new BadGatewayException(cozeErrorResponse(message, cozeDiagnostic));
    }

    const rows = this.extractCozeRows(responseJson);
    const returnedConversationId = this.extractCozeConversationId(responseJson);
    if (returnedConversationId) {
      await this.cacheCozeConversationId(dto, user, returnedConversationId);
    }
    if (!rows.length) {
      const preview = cozeDiagnostic.completedContentPreview || this.getCozeResponsePreview(responseJson);
      const message = preview
        ? `Coze 未返回有效评论数据，请检查工作流输出是否为 rows JSON。completed 内容片段：${preview}`
        : 'Coze 未返回有效评论数据，请检查工作流输出是否为 rows JSON';
      throw new BadGatewayException(cozeErrorResponse(message, cozeDiagnostic));
    }

    return {
      conversationId: returnedConversationId,
      rows,
    };
  }

  /**
   * 每日任务的 AI 评论生成可能携带较长视频文案和提示词，默认最多等待 10 分钟。
   */
  private getCozeGenerateCommentsTimeoutMs(): number {
    const configured = Number(this.configService.get<number>('COZE_GENERATE_COMMENTS_TIMEOUT_MS'));
    if (!Number.isFinite(configured)) return 600_000;
    return Math.min(600_000, Math.max(30_000, Math.floor(configured)));
  }

  private parseCozeJsonResponse(responseText: string, contentType?: string | null) {
    const normalizedText = responseText.trim();
    const normalizedContentType = String(contentType ?? '').toLowerCase();
    if (normalizedContentType.includes('text/event-stream') || normalizedText.startsWith('event:')) {
      return this.parseCozeSseResponse(responseText);
    }
    try {
      return JSON.parse(responseText);
    } catch {
      const preview = normalizedText.replace(/\s+/g, ' ').slice(0, 300);
      return {
        code: 'COZE_INVALID_RESPONSE',
        message: preview ? `Coze 返回非 JSON 响应：${preview}` : 'Coze 返回空响应',
      };
    }
  }

  private parseCozeSseResponse(responseText: string) {
    const blocks = responseText
      .split(/\r?\n\r?\n/)
      .map((block) => block.trim())
      .filter(Boolean);

    const events = blocks.map((block) => {
      const lines = block.split(/\r?\n/);
      let event = '';
      const dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith('event:')) {
          event = line.slice('event:'.length).trim();
          continue;
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.slice('data:'.length).trim());
        }
      }

      const rawData = dataLines.join('\n').trim();
      return {
        event,
        rawData,
        data: this.safeJsonParse(rawData),
      };
    });

    return { events };
  }

  private extractCozeRows(responseJson: unknown): Record<string, unknown>[] {
    const sseCandidates = this.collectCozeSseCompletedCandidates(responseJson);
    for (const candidate of sseCandidates) {
      const rows = this.parseRowsJsonCandidate(candidate);
      if (rows.length) {
        return rows;
      }
    }

    const candidates = this.collectCozeJsonCandidates(responseJson);
    for (const candidate of candidates) {
      const rows = this.parseRowsJsonCandidate(candidate);
      if (rows.length) {
        return rows;
      }
    }
    return [];
  }

  private extractCozeConversationId(responseJson: unknown) {
    const directCandidates = [
      responseJson,
      this.safeReflectGet(responseJson, 'data'),
      this.safeReflectGet(responseJson, 'conversation'),
      this.safeReflectGet(this.safeReflectGet(responseJson, 'data'), 'conversation'),
    ];

    for (const candidate of directCandidates) {
      const conversationId = this.readConversationIdFromCandidate(candidate);
      if (conversationId) {
        return conversationId;
      }
    }

    if (!responseJson || typeof responseJson !== 'object') {
      return '';
    }
    const events = Reflect.get(responseJson, 'events');
    if (!Array.isArray(events)) {
      return '';
    }

    for (const item of events) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const data = Reflect.get(item, 'data');
      const conversationId = this.readConversationIdFromCandidate(data);
      if (conversationId) {
        return conversationId;
      }
    }

    return '';
  }

  private readConversationIdFromCandidate(candidate: unknown) {
    if (!candidate || typeof candidate !== 'object') {
      return '';
    }

    const directConversationId = Reflect.get(candidate, 'conversation_id');
    if (typeof directConversationId === 'string' && directConversationId.trim()) {
      return directConversationId.trim();
    }

    const nestedConversation = Reflect.get(candidate, 'conversation');
    if (nestedConversation && typeof nestedConversation === 'object') {
      const nestedConversationId = Reflect.get(nestedConversation, 'id') ?? Reflect.get(nestedConversation, 'conversation_id');
      if (typeof nestedConversationId === 'string' && nestedConversationId.trim()) {
        return nestedConversationId.trim();
      }
    }

    return '';
  }

  private safeReflectGet(target: unknown, key: string) {
    if (!target || typeof target !== 'object') {
      return undefined;
    }
    return Reflect.get(target, key);
  }

  private async getCachedCozeConversationId(dto: AiGenerateCommentsDto, user: CurrentUserPayload) {
    const key = this.buildCozeConversationCacheKey(dto, user);
    const cachedConversationId = await this.redisService.get(key);
    return String(cachedConversationId ?? '').trim();
  }

  private async cacheCozeConversationId(dto: AiGenerateCommentsDto, user: CurrentUserPayload, conversationId: string) {
    const normalizedConversationId = String(conversationId ?? '').trim();
    if (!normalizedConversationId) {
      return;
    }
    const key = this.buildCozeConversationCacheKey(dto, user);
    await this.redisService.set(key, normalizedConversationId, COZE_CONVERSATION_CACHE_TTL_SECONDS);
  }

  private buildCozeConversationCacheKey(dto: AiGenerateCommentsDto, user: CurrentUserPayload) {
    const fingerprint = [
      user.id,
      String(dto.platform ?? '').trim().toLowerCase(),
      String(dto.videoTitle ?? '').trim().toLowerCase(),
      String(dto.videoUrl ?? '').trim().toLowerCase(),
    ].join('|');
    return `daily-task:coze-conversation:${fingerprint}`;
  }

  private collectCozeSseCompletedCandidates(responseJson: unknown) {
    if (!responseJson || typeof responseJson !== 'object') {
      return [];
    }
    const events = Reflect.get(responseJson, 'events');
    if (!Array.isArray(events)) {
      return [];
    }

    const completedEvents = events.filter((item) => {
      if (!item || typeof item !== 'object') {
        return false;
      }
      const eventName = String(Reflect.get(item, 'event') ?? '').trim();
      return eventName === 'conversation.message.completed';
    });

    const candidates: string[] = [];
    for (const item of completedEvents) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const data = Reflect.get(item, 'data');
      this.collectCozeJsonCandidates(data, 0, candidates);
    }
    return Array.from(new Set(candidates));
  }

  private collectCozeJsonCandidates(input: unknown, depth = 0, bucket: string[] = []) {
    if (depth > 8 || input == null) {
      return bucket;
    }
    if (typeof input === 'string') {
      const normalized = input.trim();
      if (normalized) {
        bucket.push(normalized);
      }
      return bucket;
    }
    if (Array.isArray(input)) {
      input.forEach((item) => this.collectCozeJsonCandidates(item, depth + 1, bucket));
      return bucket;
    }
    if (typeof input === 'object') {
      Object.entries(input).forEach(([key, value]) => {
        if (typeof value === 'string') {
          const normalized = value.trim();
          if (normalized && ['content', 'result', 'output', 'answer', 'text', 'data'].includes(key)) {
            bucket.push(normalized);
          }
        }
        this.collectCozeJsonCandidates(value, depth + 1, bucket);
      });
    }
    return Array.from(new Set(bucket));
  }

  private parseRowsJsonCandidate(candidate: string): Record<string, unknown>[] {
    const normalized = this.unwrapJsonCodeBlock(candidate);
    const parsed = this.safeJsonParse(normalized);
    const rows = this.normalizeCommentRows(parsed);
    if (rows.length) {
      return rows;
    }
    return this.parsePlainTextComments(normalized);
  }

  private unwrapJsonCodeBlock(value: string) {
    const trimmed = value.trim();
    if (!trimmed.startsWith('```')) {
      return trimmed;
    }
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }

  private safeJsonParse(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private normalizeCommentRows(payload: unknown): Record<string, unknown>[] {
    if (typeof payload === 'string') {
      const reparsed = this.safeJsonParse(payload);
      if (reparsed !== payload) {
        return this.normalizeCommentRows(reparsed);
      }
      return [];
    }

    if (Array.isArray(payload)) {
      return payload
        .map((item) => this.normalizeCommentRowItem(item))
        .filter((item): item is Record<string, unknown> => Boolean(item));
    }

    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const rows = Reflect.get(payload, 'rows');
    if (rows !== undefined) {
      return this.normalizeCommentRows(rows);
    }

    const data = Reflect.get(payload, 'data');
    if (data !== undefined) {
      const normalizedData = this.normalizeCommentRows(data);
      if (normalizedData.length) {
        return normalizedData;
      }
    }

    const output = Reflect.get(payload, 'output');
    if (output !== undefined) {
      const normalizedOutput = this.normalizeCommentRows(output);
      if (normalizedOutput.length) {
        return normalizedOutput;
      }
    }

    const content = Reflect.get(payload, 'content');
    if (content !== undefined) {
      return this.normalizeCommentRows(content);
    }

    return [];
  }

  private normalizeCommentRowItem(item: unknown): Record<string, unknown> | null {
    if (typeof item === 'string') {
      const content = item.trim();
      return content ? { content } : null;
    }

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return null;
    }

    return { ...(item as Record<string, unknown>) };
  }

  private parsePlainTextComments(value: string): Record<string, unknown>[] {
    const normalized = value.trim();
    if (!normalized) {
      return [];
    }

    const lines = normalized
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+[.)、]\s+/, '').trim())
      .filter(Boolean);

    if (lines.length >= 2) {
      return lines.map((content) => ({ content }));
    }

    return [];
  }

  private getCozeResponsePreview(responseJson: unknown) {
    const candidates = this.collectCozeSseCompletedCandidates(responseJson);
    if (candidates.length) {
      return candidates[0].slice(0, 300);
    }
    const jsonCandidates = this.collectCozeJsonCandidates(responseJson);
    if (jsonCandidates.length) {
      return jsonCandidates[0].slice(0, 300);
    }
    return '';
  }


  private normalizeMediaAccountNo(value?: string | null) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    return raw.replace(/^@+/, '').slice(0, 100);
  }

  private async upsertAppUserMediaAccount(appUserId: string, platform: string, accountNo?: string | null, proofFileId?: string, proofUrl?: string) {
    const normalized = this.normalizeMediaAccountNo(accountNo);
    if (!normalized) return null;
    return this.prisma.appUserMediaAccount.upsert({
      where: {
        appUserId_platform_accountNo: {
          appUserId,
          platform,
          accountNo: normalized,
        },
      },
      create: {
        appUserId,
        platform,
        accountNo: normalized,
        source: 'MANUAL',
        proofFileId,
        proofUrl,
        verifiedAt: new Date(),
      },
      update: {
        proofFileId: proofFileId || undefined,
        proofUrl: proofUrl || undefined,
        verifiedAt: new Date(),
      },
    });
  }

  private getNextStep(status: string) {
    switch (status) {
      case 'CLAIMED':
        return 'STEP_3_CONFIRM';
      case 'COMPLETED':
        return 'DONE';
      case 'STARTED':
        return 'STEP_2_CLAIM';
      default:
        return 'STEP_1_START';
    }
  }

  private assertDailyTaskNotDisabled(task: { status?: string | null }) {
    if (String(task.status || '').toUpperCase() === 'DISABLED') {
      throw new ConflictException('当前任务已停用，不能领取');
    }
  }

  private generateVisitorToken() {
    return randomUUID().replace(/-/g, '');
  }

  private normalizePlatform(value: string) {
    const raw = value.trim().toUpperCase();
    const map: Record<string, string> = {
      DOUYIN: 'DOUYIN',
      TIKTOK_CN: 'DOUYIN',
      WECHAT_VIDEO: 'WECHAT_VIDEO',
      VIDEO_CHANNEL: 'WECHAT_VIDEO',
      XIAOHONGSHU: 'XIAOHONGSHU',
      REDBOOK: 'XIAOHONGSHU',
    };

    if (map[raw]) return map[raw];
    const lowerMap: Record<string, string> = {
      douyin: 'DOUYIN',
      wechat_video: 'WECHAT_VIDEO',
      video_channel: 'WECHAT_VIDEO',
      xiaohongshu: 'XIAOHONGSHU',
      redbook: 'XIAOHONGSHU',
    };
    if (lowerMap[value.trim().toLowerCase()]) return lowerMap[value.trim().toLowerCase()];
    return raw;
  }

  private parseOptionalDate(value?: string | null) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('日期时间格式不正确');
    }
    return date;
  }

  private normalizeText(value?: string | string[] | null) {
    if (Array.isArray(value)) return value.join(', ');
    return value ?? null;
  }

  private normalizeClaimIdentity(value?: string | null) {
    return String(value ?? '').trim().toLowerCase();
  }

  private normalizePhone(value?: string | null) {
    const digits = String(value ?? '').replace(/[^0-9]/g, '');
    if (digits.length === 13 && digits.startsWith('86')) return digits.slice(2);
    return digits;
  }

  private isValidNormalizedPhone(value?: string | null) {
    return /^1[3-9]\d{9}$/.test(String(value ?? '').trim());
  }
}
