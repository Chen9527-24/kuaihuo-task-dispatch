import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiExtraModels, ApiOperation, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { ApiSuccessResponse } from '../../common/swagger/api-success-response.decorator';
import { CurrentUserPayload } from '../../common/types/current-user.type';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BatchMarkDailyTasksAsTestDataDto, CreateDailyTaskConfigDto, CreateDailyTaskDto, RemoveDailyTaskDto, UpdateDailyTaskConfigDto, UpdateDailyTaskDto } from './dto/daily-task.dto';
import { DailyTaskQueryDto } from './dto/daily-task-query.dto';
import { RejectTaskOrderDto, SettleTaskOrderDto, TaskOrderMediaAccessQueryDto, TaskOrderQueryDto } from './dto/task-order.dto';
import { AiGenerateCommentsDto, BatchDeleteTaskCommentsDto, CreateTaskCommentDto, UpdateTaskCommentDto } from './dto/task-comment.dto';
import type { Request } from 'express';
import { DailyTasksService } from './daily-tasks.service';

@ApiTags('管理端-每日任务')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'daily-tasks', version: '1' })
export class DailyTasksController {
  constructor(private readonly service: DailyTasksService) {}

  /**
   * Keep the two task-level commission rule fields intact across the DTO boundary.
   * The service remains the only source of authorization, range checks and snapshot rules.
   */
  private mergeRawTaskCommissionFields<T extends CreateDailyTaskDto | UpdateDailyTaskDto>(
    dto: T,
    rawBody: unknown,
  ): T {
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) return dto;
    const raw = rawBody as Record<string, unknown>;
    const hasRuleType = Object.prototype.hasOwnProperty.call(raw, 'commissionRuleType');
    const hasRuleValue = Object.prototype.hasOwnProperty.call(raw, 'commissionRuleValue');
    if (!hasRuleType && !hasRuleValue) return dto;

    return {
      ...dto,
      ...(hasRuleType ? { commissionRuleType: raw.commissionRuleType } : {}),
      ...(hasRuleValue ? { commissionRuleValue: raw.commissionRuleValue } : {}),
    } as T;
  }

  @Get()
  @ApiOperation({ summary: '每日任务列表', description: '管理端分页查询每日任务，可按租户、平台、帖子编号、状态和关键字筛选；返回评论池摘要。' })
  @ApiSuccessResponse(undefined, {
    description: '查询成功',
    example: {
      items: [
        {
          id: 'cm9pwyb5f0001abc123def456',
          tenantId: 'cm9m3jhm30001abc123def456',
          platform: 'DOUYIN',
          postId: '29',
          title: '国际尬唱251',
          authorName: '花生牛奶',
          targetCommentCount: 44,
          claimedCommentCount: 13,
          completedCommentCount: 12,
          status: 'RUNNING',
        },
      ],
      page: 1,
      pageSize: 10,
      total: 1,
    },
  })
  list(@Query() query: DailyTaskQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(query, user);
  }

  @Get('config')
  @ApiOperation({ summary: '获取任务配置', description: '独立配置接口：按 platform 获取配置，原样返回 config 字符串。' })
  @ApiSuccessResponse(undefined, { description: '获取成功' })
  getConfig(@Query('platform') platform: string) {
    return this.service.getConfig(platform);
  }

  @Post('config')
  @Permissions('daily-task:create')
  @ApiOperation({ summary: '新增任务配置', description: '独立配置接口：新增 platform 对应配置，config 按原始字符串保存。' })
  @ApiSuccessResponse(undefined, { description: '创建成功' })
  createConfig(@Body() dto: CreateDailyTaskConfigDto) {
    return this.service.createConfig(dto);
  }

  @Patch('config')
  @Permissions('daily-task:update')
  @ApiOperation({ summary: '编辑任务配置', description: '独立配置接口：按 platform 更新配置，config 整包覆盖并原样保存。' })
  @ApiSuccessResponse(undefined, { description: '更新成功' })
  updateConfig(@Body() dto: UpdateDailyTaskConfigDto) {
    return this.service.updateConfig(dto);
  }

  @Post('batch/mark-test-data')
  @Permissions('daily-task:update')
  @ApiOperation({ summary: '批量标记每日任务为测试数据', description: '标记后任务会立即停用；已明确标记专用测试账号后，可按测试账号范围清理订单、佣金、提现和调账流水。' })
  @ApiSuccessResponse(undefined, { description: '标记完成' })
  batchMarkAsTestData(@Body() dto: BatchMarkDailyTasksAsTestDataDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.batchMarkDailyTasksAsTestData(dto, user);
  }

  @Post(':id/mark-test-data')
  @Permissions('daily-task:update')
  @ApiOperation({ summary: '标记单个每日任务为测试数据', description: '标记后任务立即停用，防止继续产生新领取和新结算。' })
  @ApiSuccessResponse(undefined, { description: '标记完成' })
  markAsTestData(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.markDailyTaskAsTestData(id, user);
  }

  @Get(':id/test-force-purge-preview')
  @Permissions('daily-task:read')
  @ApiOperation({ summary: '获取测试账号范围强制清理预览', description: '只读预览：展示将清理的测试任务、订单、佣金、钱包流水、提现与人工调账。仅所有关联账号/团长都明确标记为测试数据且无真实外部付款时才允许执行。' })
  @ApiSuccessResponse(undefined, { description: '预览成功' })
  getForceTestPurgePreview(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getForceTestDailyTaskPurgePreview(id, user);
  }

  @Get(':id')
  @ApiOperation({ summary: '每日任务详情', description: '返回任务主信息、视频链接、评论池、推流记录；stepConfig 为模块级配置。' })
  @ApiSuccessResponse(undefined, {
    description: '查询成功',
    example: {
      id: 'cm9pwyb5f0001abc123def456',
      postId: '29',
      title: '国际尬唱251',
      authorName: '花生牛奶',
      publishedAt: '2026-03-18T19:43:33.000Z',
      stepConfig: {
        steps: [
          { code: 'START_ASSIST', title: '第一步：开始助推' },
          { code: 'CLAIM_COMMENT', title: '第二步：领取评论' },
          { code: 'CONFIRM', title: '第三步：确认完成' },
        ],
      },
    },
  })
  detail(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.detail(id, user);
  }

  @Post()
  @Permissions('daily-task:create')
  @ApiOperation({ summary: '新增每日任务', description: 'PC 发布任务时创建任务主体、视频链接与评论池。stepConfig 改为模块级配置，不再按单条任务维护。' })
  @ApiSuccessResponse(undefined, { description: '创建成功' })
  create(@Body() dto: CreateDailyTaskDto, @CurrentUser() user: CurrentUserPayload, @Req() req: Request) {
    return this.service.create(this.mergeRawTaskCommissionFields(dto, req.body), user);
  }

  @Patch(':id')
  @Permissions('daily-task:update')
  @ApiOperation({ summary: '编辑每日任务', description: '更新任务基础信息、H5 公共访问配置与评论池。stepConfig 改为模块级配置，不再按单条任务维护。' })
  @ApiSuccessResponse(undefined, { description: '更新成功' })
  update(@Param('id') id: string, @Body() dto: UpdateDailyTaskDto, @CurrentUser() user: CurrentUserPayload, @Req() req: Request) {
    return this.service.update(id, this.mergeRawTaskCommissionFields(dto, req.body), user);
  }

  @Delete(':id')
  @Permissions('daily-task:delete')
  @ApiOperation({ summary: '删除每日任务', description: '普通任务保留原软删除规则；已标记测试任务在开启清理开关、测试账号/团长范围校验和标题二次确认通过后，会重置完整测试范围。' })
  @ApiSuccessResponse(undefined, { description: '删除成功', example: { success: true } })
  remove(@Param('id') id: string, @Body() dto: RemoveDailyTaskDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user, dto);
  }

  @Post(':id/dispatch')
  @Permissions('daily-task:dispatch')
  @ApiOperation({ summary: '发推流任务', description: '校验评论池和媒体账号状态后，将任务流转到 DISPATCHED。公开 H5 页面通常在该阶段之后开始对外使用。' })
  @ApiSuccessResponse(undefined, { description: '发推流成功' })
  dispatch(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.dispatch(id, user);
  }

  @Post(':id/pause')
  @Permissions('daily-task:update')
  @ApiOperation({ summary: '暂停每日任务', description: '暂停后阻止新成员领取；已领取成员仍可完成和结算。' })
  pause(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.pause(id, user);
  }

  @Post(':id/resume')
  @Permissions('daily-task:update')
  @ApiOperation({ summary: '恢复每日任务', description: '恢复已暂停任务，并按当前领取进度重新计算展示状态。' })
  resume(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.resume(id, user);
  }

  @Post(':id/close')
  @Permissions('daily-task:update')
  @ApiOperation({ summary: '关闭每日任务', description: '关闭后不再允许新领取，历史订单仍可完成与结算。' })
  close(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.close(id, user);
  }

  @Post(':id/archive')
  @Permissions('daily-task:update')
  @ApiOperation({ summary: '归档每日任务', description: '归档只隐藏默认列表，历史任务、订单、佣金和流水仍可查询。' })
  archive(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.archive(id, user);
  }

  @Get(':id/progress')
  @Permissions('daily-task:progress:read')
  @ApiOperation({ summary: '参与进度明细', description: '统计任务评论状态分布，并返回已领取/已完成的明细，供 PC 查看执行进度。' })
  @ApiSuccessResponse(undefined, {
    description: '查询成功',
    example: {
      taskId: 'cm9pwyb5f0001abc123def456',
      targetCommentCount: 44,
      totalCommentCount: 44,
      claimedCommentCount: 13,
      completedCommentCount: 12,
      completionRate: 27.27,
      statusCounts: { AVAILABLE: 31, CLAIMED: 1, COMPLETED: 12 },
      details: [
        { id: 'cm9q6n5e10001abc123def456', status: 'COMPLETED', claimerName: 'Qiu', participant: { visitorName: 'Qiu' } },
      ],
    },
  })
  progress(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.progress(id, user);
  }

  @Get(':id/orders')
  @Permissions('daily-task:order:read')
  @ApiOperation({ summary: '任务订单列表', description: '按参与者维度返回订单列表，支持状态、结算状态、姓名、手机号筛选。' })
  @ApiSuccessResponse(undefined, { description: '查询成功' })
  listOrders(@Param('id') id: string, @Query() query: TaskOrderQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listOrders(id, query, user);
  }

  @Get(':id/orders/:participantId/files/:fileId/access')
  @Permissions('daily-task:order:read')
  @ApiOperation({ summary: '获取订单凭证访问地址', description: '校验任务、订单和文件绑定关系后，按需返回缩略图或原图的受控访问地址。' })
  @ApiSuccessResponse(undefined, { description: '查询成功' })
  getOrderFileAccess(
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Param('fileId') fileId: string,
    @Query() query: TaskOrderMediaAccessQueryDto,
    @CurrentUser() user: CurrentUserPayload,
    @Req() request: Request,
  ) {
    return this.service.getOrderFileAccess(id, participantId, fileId, query.variant, user, request);
  }

  @Post(':id/orders/:participantId/homepage-recognition/retry')
  @Permissions('daily-task:order:settle')
  @ApiOperation({ summary: '重新识别订单主页截图', description: '仅重新识别当前订单任务账号在当前平台绑定的主页截图；不会修改用户手工填写的任务账号昵称或手机号。' })
  @ApiSuccessResponse(undefined, { description: '已进入主页 OCR 队列' })
  retryOrderHomepageRecognition(
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.retryOrderHomepageRecognition(id, participantId, user);
  }

  @Post(':id/orders/cleanup-invalid')
  @Permissions('daily-task:order:settle')
  @ApiOperation({
    summary: '一键清理无效进行中订单',
    description: '清理当前任务下因旧逻辑提前落库产生的无效订单：仅删除未领取评论、无凭证、无结算痕迹的 STARTED 记录。',
  })
  @ApiSuccessResponse(undefined, {
    description: '清理成功',
    example: {
      deletedCount: 3,
      message: '已清理 3 条无效进行中订单',
    },
  })
  cleanupInvalidOrders(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.cleanupInvalidOrders(id, user);
  }

  @Post(':id/orders/:participantId/reset')
  @Permissions('daily-task:order:settle')
  @ApiOperation({
    summary: '重置进行中订单状态',
    description: '仅允许管理员重置 STARTED / CLAIMED 且未结算的单条订单。订单会转为 ABANDONED，已占用评论释放回可领取池；不会计入成员当天主动放弃次数。',
  })
  @ApiSuccessResponse(undefined, {
    description: '重置成功',
    example: {
      success: true,
      participantId: 'cm9q6n5e10001abc123def456',
      status: 'ABANDONED',
      releasedCommentCount: 1,
      message: '状态已重置，并释放 1 条已占用评论',
    },
  })
  resetActiveOrder(
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.resetActiveOrder(id, participantId, user);
  }

  @Post(':id/orders/:participantId/settle')
  @Permissions('daily-task:order:settle')
  @ApiOperation({ summary: '订单结算', description: '仅允许对已完成订单执行结算。需传结算金额；打款截图和付款订单号均为可选。' })
  @ApiSuccessResponse(undefined, { description: '结算成功' })
  settleOrder(
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Body() dto: SettleTaskOrderDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.settleOrder(id, participantId, dto, user);
  }

  @Post(':id/orders/:participantId/reject')
  @Permissions('daily-task:order:settle')
  @ApiOperation({ summary: '订单驳回', description: '驳回乱传或无效凭证，必须填写驳回原因；驳回后保留原评论并回到待提交状态，H5 用户可重新提交凭证。' })
  @ApiSuccessResponse(undefined, { description: '驳回成功' })
  rejectOrder(
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Body() dto: RejectTaskOrderDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.rejectOrder(id, participantId, dto, user);
  }

  @Get(':id/comments')
  @Permissions('daily-task:comment:read')
  @ApiOperation({ summary: '任务评论列表', description: '返回任务评论池及其当前状态，可用于 PC 端人工干预评论状态。' })
  @ApiSuccessResponse(undefined, { description: '查询成功' })
  listComments(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listComments(id, user);
  }

  @Post(':id/comments')
  @Permissions('daily-task:comment:create')
  @ApiExtraModels(CreateTaskCommentDto)
  @ApiOperation({ summary: '新增任务评论', description: '同一接口兼容单条和批量新增。请求体传对象时新增 1 条；传对象数组时批量新增多条。' })
  @ApiBody({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(CreateTaskCommentDto) },
        {
          type: 'array',
          items: { $ref: getSchemaPath(CreateTaskCommentDto) },
        },
      ],
    },
  })
  @ApiSuccessResponse(undefined, { description: '新增成功' })
  createComment(@Param('id') id: string, @Body() dto: CreateTaskCommentDto | CreateTaskCommentDto[], @CurrentUser() user: CurrentUserPayload) {
    return this.service.createComment(id, dto, user);
  }

  @Patch(':id/comments/:commentId')
  @Permissions('daily-task:comment:update')
  @ApiOperation({ summary: '编辑任务评论 / 更新领取完成状态', description: '管理端可人工修正评论状态。若把评论改回 AVAILABLE，系统会自动清空已绑定的 H5 访客信息。' })
  @ApiSuccessResponse(undefined, { description: '更新成功' })
  updateComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateTaskCommentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateComment(id, commentId, dto, user);
  }

  @Delete(':id/comments/batch')
  @Permissions('daily-task:comment:delete')
  @ApiOperation({ summary: '批量删除任务评论' })
  @ApiSuccessResponse(undefined, { description: '删除成功', example: { success: true } })
  batchRemoveComments(@Param('id') id: string, @Body() dto: BatchDeleteTaskCommentsDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.batchRemoveComments(id, dto, user);
  }

  @Delete(':id/comments/:commentId')
  @Permissions('daily-task:comment:delete')
  @ApiOperation({ summary: '删除任务评论' })
  @ApiSuccessResponse(undefined, { description: '删除成功', example: { success: true } })
  removeComment(@Param('id') id: string, @Param('commentId') commentId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.removeComment(id, commentId, user);
  }

  @Post('comments/ai-generate')
  @Permissions('daily-task:comment:ai-generate')
  @ApiOperation({ summary: 'AI 生成评论预览（调用 Coze 工作流）', description: '独立生成评论预览，不依赖任务 ID。适用于新增任务时先生成，再决定是否保存。' })
  @ApiSuccessResponse(undefined, {
    description: '生成成功',
    example: {
      conversationId: 'example-conversation-id',
      rows: [
        {
          comment_text: '老师，视频里说的追投，具体是看前几个小时的消耗和转化率再决定加预算吗？',
          replies: ['对啊，我也没太听清，是看两小时还是三小时的数据？', '同问，就怕加晚了没量，加早了成本崩盘。'],
          reply_group_no: '1',
          type: '小白提问型',
        },
      ],
    },
  })
  generateComments(@Body() dto: AiGenerateCommentsDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.generateComments(dto, user);
  }
}
