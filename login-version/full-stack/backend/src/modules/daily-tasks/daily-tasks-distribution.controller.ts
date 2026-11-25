import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AnyPermissions } from '../../common/decorators/any-permissions.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { SendSmsCodeDto } from '../sms/dto/sms-code.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUserPayload } from '../../common/types/current-user.type';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DailyTasksService } from './daily-tasks.service';
import { AdminApproveLeaderApplicationDto, AdminBindGroupLeaderDto, AdminCreateDistributionGroupDto, AdminCreateGroupCollaborationDto, AdminDeleteDistributionGroupDto, AdminDistributionGroupQueryDto, AdminForceUnbindDeleteDistributionGroupDto, AdminMarkDistributionGroupTestDataDto, AdminGroupCollaborationQueryDto, AdminLeaderApplicationQueryDto, AdminLeaderCommissionSettlementQueryDto, AdminRejectLeaderApplicationDto, AdminResetDistributionGroupTestDataDto, AdminUnbindDistributionGroupLeaderDto, AdminUpdateDistributionGroupCodeDto, AdminUpdateDistributionGroupCommissionDto, BanAppUserDto, DistributionAbandonDto, DistributionClaimDto, DistributionCompleteDto, DistributionHomepageProofAccessQueryDto, DistributionHomepageProofRecognitionRequestDto, DistributionHomepageProofRetainDto, DistributionInviteBindDto, DistributionLeaderApplicationDto, DistributionLeaderBindDto, DistributionLeaderCenterQueryDto, DistributionLoginDto, DistributionOrderQueryDto, DistributionProfileDto, DistributionTaskAccountDto, DistributionTaskQueryDto } from './dto/distribution.dto';

@ApiTags('H5-分发任务')
@Public()
@Controller({ path: 'app/distribution', version: '1' })
export class DailyTasksDistributionController {
  constructor(private readonly service: DailyTasksService) {}

  @Post('sms/send-code')
  @ApiOperation({ summary: 'H5 发送短信验证码', description: 'mock 模式仅用于开发/测试；腾讯云真实短信不会返回验证码，验证码仅存储在 Redis 中用于后续核验。' })
  sendSmsCode(@Body() dto: SendSmsCodeDto, @Req() request: Request) {
    return this.service.sendDistributionSmsCode(dto, this.buildRequestMeta(request));
  }

  @Post('auth/login')
  @ApiOperation({ summary: 'H5 用户手机号登录/注册', description: '短信验证码通过后登录。公众号收款身份须通过服务端网页授权取得。' })
  login(@Body() dto: DistributionLoginDto, @Req() request: Request) {
    return this.service.distributionLogin(dto, this.buildRequestMeta(request));
  }

  @Get('me')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'H5 个人中心信息', description: '返回用户接单状态、收益、完成单数、今日剩余放弃次数和当前进行中任务。' })
  me(@Headers('authorization') authorization?: string, @Query('refreshSubscribe') refreshSubscribe?: string) {
    return this.service.getDistributionMe(authorization, refreshSubscribe === '1' || refreshSubscribe === 'true');
  }


  @Post('leader-applications')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'H5 申请成为团长', description: '提交后进入审核中；只有 PC 审核通过后才会升级为团长身份。' })
  applyLeader(@Body() dto: DistributionLeaderApplicationDto, @Headers('authorization') authorization?: string) {
    return this.service.applyDistributionLeader(dto, authorization);
  }

  @Get('leader-center')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'H5 团长中心数据', description: '仅当前已绑定且启用的团长可查询本人团队的邀请、完成订单、成功提现及成员邀请链接。日期范围按北京时间自然日统计。' })
  leaderCenter(@Query() query: DistributionLeaderCenterQueryDto, @Headers('authorization') authorization?: string) {
    return this.service.getDistributionLeaderCenter(query, authorization);
  }

  @Get('invite/:code')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'H5 校验成员邀请码' })
  inviteDetail(@Param('code') code: string) {
    return this.service.getDistributionInviteDetail(code);
  }

  @Post('bind-invite')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'H5 绑定成员邀请码' })
  bindInvite(@Body() dto: DistributionInviteBindDto, @Headers('authorization') authorization?: string) {
    return this.service.bindDistributionInvite(dto, authorization);
  }

  @Get('leader-code/:code')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'H5 校验团长身份绑定码' })
  leaderCodeDetail(@Param('code') code: string) {
    return this.service.getDistributionLeaderCodeDetail(code);
  }

  @Post('bind-leader-code')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'H5 绑定团长身份码，团长本人也可接任务' })
  bindLeaderCode(@Body() dto: DistributionLeaderBindDto, @Headers('authorization') authorization?: string) {
    return this.service.bindDistributionLeaderCode(dto, authorization);
  }

  @Get('task-accounts')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'H5 任务账号列表' })
  taskAccounts(@Headers('authorization') authorization?: string) {
    return this.service.listDistributionTaskAccounts(authorization);
  }

  @Post('task-accounts')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'H5 新增任务账号；手机号后续接短信验证' })
  createTaskAccount(@Body() dto: DistributionTaskAccountDto, @Headers('authorization') authorization?: string) {
    return this.service.createDistributionTaskAccount(dto, authorization);
  }

  @Post('task-accounts/:id/switch')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'H5 切换当前任务账号' })
  switchTaskAccount(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    return this.service.switchDistributionTaskAccount(id, authorization);
  }

  @Post('profile')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'H5 用户完善资料', description: '服务号静默授权创建账号后，绑定手机号和姓名；手机号格式后端强校验。' })
  profile(@Body() dto: DistributionProfileDto, @Headers('authorization') authorization?: string) {
    return this.service.updateDistributionProfile(dto, authorization);
  }

  @Get('orders')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'H5 用户任务记录', description: '用于个人中心查看已完成任务、已结算收益任务。' })
  orders(@Query() query: DistributionOrderQueryDto, @Headers('authorization') authorization?: string) {
    return this.service.listDistributionOrders(query, authorization);
  }

  @Get('tasks')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'H5 可领取任务列表' })
  tasks(@Query() query: DistributionTaskQueryDto, @Headers('authorization') authorization?: string) {
    return this.service.listDistributionTasks(query, authorization);
  }

  @Post('tasks/claim')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'H5 领取任务', description: '只建立当前用户的进行中任务，不领取评论；评论领取在任务流程第二步单独触发。' })
  claim(@Body() dto: DistributionClaimDto, @Headers('authorization') authorization?: string, @Req() request?: Request) {
    return this.service.claimDistributionTask(dto, authorization, this.buildRequestMeta(request));
  }

  @Post('tasks/current/claim-comment')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'H5 当前任务领取评论', description: '当前用户进入任务流程第二步时，按登录资料领取一条评论。任务领取和评论领取拆分处理。' })
  claimCurrentComment(@Headers('authorization') authorization?: string, @Req() request?: Request) {
    return this.service.claimDistributionCurrentComment(authorization, this.buildRequestMeta(request));
  }

  @Post('tasks/current/complete')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'H5 完成当前任务', description: '当前用户提交任务凭证，后端确认当前领取的评论为已完成。' })
  completeCurrent(@Body() dto: DistributionCompleteDto, @Headers('authorization') authorization?: string, @Req() request?: Request) {
    return this.service.completeCurrentDistributionTask(dto, authorization, this.buildRequestMeta(request));
  }

  @Post('homepage-proofs/retain')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: '保存当前用户主页截图引用', description: '将当前任务中的主页截图按用户和平台绑定，用于后续任务重新签发私有 COS 临时访问地址。' })
  retainHomepageProof(@Body() dto: DistributionHomepageProofRetainDto, @Headers('authorization') authorization?: string, @Req() request?: Request) {
    return this.service.retainDistributionHomepageProof(dto, authorization, request);
  }

  @Get('homepage-proofs/:fileId/access')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: '获取用户主页截图访问地址', description: '校验当前登录用户与平台绑定关系后，重新签发私有 COS 原图临时访问地址。' })
  getHomepageProofAccess(
    @Param('fileId') fileId: string,
    @Query() query: DistributionHomepageProofAccessQueryDto,
    @Headers('authorization') authorization?: string,
    @Req() request?: Request,
  ) {
    return this.service.getDistributionHomepageProofAccess(fileId, query.platform, query.taskAccountId, authorization, request);
  }

  @Post('homepage-proofs/:fileId/recognition')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: '请求识别用户主页截图', description: '识别在后端队列中异步执行；结果只作为昵称/账号 ID 候选，不会修改用户手工任务账号资料。' })
  requestHomepageProofRecognition(
    @Param('fileId') fileId: string,
    @Body() dto: DistributionHomepageProofRecognitionRequestDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.service.requestDistributionHomepageProofRecognition(fileId, dto, authorization);
  }

  @Get('homepage-proofs/:fileId/recognition')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: '查询用户主页截图识别状态' })
  getHomepageProofRecognition(
    @Param('fileId') fileId: string,
    @Query() query: DistributionHomepageProofRecognitionRequestDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.service.getDistributionHomepageProofRecognition(fileId, query, authorization);
  }

  @Post('tasks/:participantId/resubmit')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'H5 重新提交被驳回任务', description: '将已驳回任务恢复为当前进行中任务；如果当前任务账号已有其他进行中任务，则拒绝重新提交。' })
  resubmitRejected(@Param('participantId') participantId: string, @Headers('authorization') authorization?: string, @Req() request?: Request) {
    return this.service.resubmitRejectedDistributionTask(participantId, authorization, this.buildRequestMeta(request));
  }

  @Post('tasks/abandon-current')
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'H5 放弃当前任务', description: '每日最多 2 次，后端按自然日统计并释放已领取评论。' })
  abandon(@Body() dto: DistributionAbandonDto, @Headers('authorization') authorization?: string, @Req() request?: Request) {
    return this.service.abandonCurrentDistributionTask(dto, authorization, this.buildRequestMeta(request));
  }

  private buildRequestMeta(request?: Request) {
    const headers = request?.headers ?? {};
    const tenantHeader = headers.tenantsid ?? headers['tenants-id'] ?? headers['x-tenant-id'];
    const tenantRef = Array.isArray(tenantHeader) ? tenantHeader[0] : tenantHeader;
    return {
      ip: request?.ip,
      userAgent: headers['user-agent'] ?? null,
      referer: headers.referer ?? null,
      tenantRef: tenantRef ? String(tenantRef).trim() : null,
      authorization: headers.authorization ?? null,
    };
  }
}


@ApiTags('管理端-团长与分发组')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'distribution-groups', version: '1' })
export class DistributionGroupsAdminController {
  constructor(private readonly service: DailyTasksService) {}

  @Get()
  @AnyPermissions('distribution-group:read', 'daily-task:read', 'daily-task:create', 'daily-task:update')
  @ApiOperation({ summary: '团长/分发组列表' })
  list(@Query() query: AdminDistributionGroupQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listDistributionGroups(query, user);
  }

  @Post()
  @Permissions('daily-task:create')
  @ApiOperation({ summary: '新增团长/分发组，生成成员邀请码和团长身份码' })
  create(@Body() dto: AdminCreateDistributionGroupDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.createDistributionGroup(dto, user);
  }

  @Get('leader-applications')
  @Permissions('daily-task:read')
  @ApiOperation({ summary: '团长申请列表' })
  listLeaderApplications(@Query() query: AdminLeaderApplicationQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listDistributionLeaderApplications(query, user);
  }

  @Post('leader-applications/:id/approve')
  @Permissions('daily-task:update')
  @ApiOperation({ summary: '审核通过团长申请，并将 H5 用户提升为团长' })
  approveLeaderApplication(@Param('id') id: string, @Body() dto: AdminApproveLeaderApplicationDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.approveDistributionLeaderApplication(id, dto, user);
  }

  @Post('leader-applications/:id/reject')
  @Permissions('daily-task:update')
  @ApiOperation({ summary: '驳回团长申请' })
  rejectLeaderApplication(@Param('id') id: string, @Body() dto: AdminRejectLeaderApplicationDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.rejectDistributionLeaderApplication(id, dto, user);
  }

  @Get('leader-commissions')
  @Permissions('daily-task:read')
  @ApiOperation({ summary: '团长佣金结算明细' })
  listLeaderCommissions(@Query() query: AdminLeaderCommissionSettlementQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listLeaderCommissionSettlements(query, user);
  }

  @Get(':id/unbind-check')
  @Permissions('daily-task:read')
  @ApiOperation({ summary: '团长解绑前置检查', description: '返回进行中订单、未领取任务、待处理提现等阻断项，供 PC 在确认解绑前展示。' })
  getUnbindCheck(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getDistributionGroupUnbindCheck(id, user);
  }

  @Get(':id/test-reset-check')
  @Permissions('daily-task:read')
  @ApiOperation({ summary: '测试团长数据重置预览', description: '仅标记为测试数据的团长可预览。生产环境必须由服务端显式开启测试清理开关。' })
  getTestResetCheck(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getDistributionGroupTestResetPreview(id, user);
  }


  @Get(':id/test-force-unbind-delete-preview')
  @Permissions('daily-task:read')
  @ApiOperation({ summary: '测试团长强制解绑删除预演', description: '仅标记为测试团长时可用。直接列出关联任务、订单、成员、钱包流水与提现范围，供管理员一次性确认。' })
  getForceUnbindDeletePreview(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getDistributionGroupForceUnbindDeletePreview(id, user);
  }

  @Post(':id/unbind-leader')
  @Permissions('daily-task:update')
  @ApiOperation({ summary: '解绑团长身份', description: '保留历史任务、订单和佣金；存在进行中订单、待结算或进行中提现时会阻断。' })
  unbindLeader(@Param('id') id: string, @Body() dto: AdminUnbindDistributionGroupLeaderDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.unbindDistributionGroupLeader(id, dto, user);
  }


  @Post(':id/force-unbind-delete-test-data')
  @Permissions('daily-task:test-data:reset')
  @ApiOperation({ summary: '管理员强制解绑并删除测试团长', description: '只允许已标记的测试团长。系统会清理该团长直接关联的任务、订单、佣金、钱包流水和提现，并解除成员关系后逻辑删除团长档案。' })
  forceUnbindDeleteTestData(@Param('id') id: string, @Body() dto: AdminForceUnbindDeleteDistributionGroupDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.forceUnbindDeleteDistributionGroupTestData(id, dto, user);
  }

  @Post(':id/reset-test-data')
  @Permissions('daily-task:test-data:reset')
  @ApiOperation({ summary: '重置测试团长业务数据', description: '仅清理明确属于测试团长的任务、订单、佣金与对应钱包流水；不会删除 H5 用户账号。' })
  resetTestData(@Param('id') id: string, @Body() dto: AdminResetDistributionGroupTestDataDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.resetDistributionGroupTestData(id, dto, user);
  }

  @Post(':id/mark-test-data')
  @Permissions('daily-task:test-data:reset')
  @ApiOperation({ summary: '标记既有团长为测试数据', description: '仅测试环境且服务端显式开启 ALLOW_TEST_DATA_PURGE 后允许。用于将既有测试团长纳入安全重置范围。' })
  markTestData(@Param('id') id: string, @Body() dto: AdminMarkDistributionGroupTestDataDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.markDistributionGroupAsTestData(id, dto, user);
  }

  @Delete(':id')
  @Permissions('daily-task:update')
  @ApiOperation({ summary: '逻辑删除已解绑团长', description: '只能删除已解绑且无当前成员关系的团长档案；历史业务记录保持可追溯。' })
  remove(@Param('id') id: string, @Body() dto: AdminDeleteDistributionGroupDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.deleteDistributionGroup(id, dto, user);
  }

  @Patch(':id/commission-config')
  @Permissions('daily-task:update')
  @ApiOperation({ summary: '设置团长是否接受分佣及默认规则' })
  updateCommissionConfig(@Param('id') id: string, @Body() dto: AdminUpdateDistributionGroupCommissionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updateDistributionGroupCommissionConfig(id, dto, user);
  }

  @Post(':id/enable')
  @Permissions('daily-task:update')
  enable(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.setDistributionGroupStatus(id, 'ENABLED', user);
  }

  @Post(':id/disable')
  @Permissions('daily-task:update')
  disable(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.setDistributionGroupStatus(id, 'DISABLED', user);
  }

  @Post(':id/reset-member-invite-code')
  @Permissions('daily-task:update')
  resetMemberCode(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.resetDistributionGroupCode(id, 'member', user);
  }

  @Post(':id/reset-leader-bind-code')
  @Permissions('daily-task:update')
  resetLeaderCode(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.resetDistributionGroupCode(id, 'leader', user);
  }

  @Patch(':id/member-invite-code')
  @Permissions('daily-task:update')
  updateMemberCode(@Param('id') id: string, @Body() dto: AdminUpdateDistributionGroupCodeDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updateDistributionGroupCode(id, 'member', dto, user);
  }

  @Patch(':id/leader-bind-code')
  @Permissions('daily-task:update')
  updateLeaderCode(@Param('id') id: string, @Body() dto: AdminUpdateDistributionGroupCodeDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updateDistributionGroupCode(id, 'leader', dto, user);
  }

  @Post(':id/bind-leader')
  @Permissions('daily-task:update')
  bindLeader(@Param('id') id: string, @Body() dto: AdminBindGroupLeaderDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.adminBindDistributionGroupLeader(id, dto, user);
  }
}

@ApiTags('管理端-团长协作授权')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'group-collaborations', version: '1' })
export class GroupCollaborationsAdminController {
  constructor(private readonly service: DailyTasksService) {}

  @Get()
  @Permissions('daily-task:read')
  list(@Query() query: AdminGroupCollaborationQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listGroupCollaborations(query, user);
  }

  @Post()
  @Permissions('daily-task:update')
  create(@Body() dto: AdminCreateGroupCollaborationDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.createGroupCollaboration(dto, user);
  }

  @Post(':id/revoke')
  @Permissions('daily-task:update')
  revoke(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.revokeGroupCollaboration(id, user);
  }
}

@ApiTags('管理端-H5用户限制')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'daily-tasks', version: '1' })
export class DailyTasksDistributionAdminController {
  constructor(private readonly service: DailyTasksService) {}

  @Post(':id/orders/:participantId/ban-user')
  @Permissions('daily-task:order:settle')
  @ApiOperation({ summary: '限制 H5 用户接单', description: '按订单参与记录定位 H5 用户，写入限制天数、原因和可选截图。' })
  banUser(
    @Param('id') taskId: string,
    @Param('participantId') participantId: string,
    @Body() dto: BanAppUserDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.banDistributionUserByParticipant(taskId, participantId, dto, user);
  }
}
