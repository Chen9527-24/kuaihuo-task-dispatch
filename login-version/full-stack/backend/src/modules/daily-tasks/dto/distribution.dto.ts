import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { SmsCodeFieldDto } from '../../sms/dto/sms-code.dto';

export class DistributionLoginDto extends SmsCodeFieldDto {
  @ApiProperty({ example: '1XXXXXXXXXX', description: 'H5 用户手机号。服务号 H5 版本建议配合短信验证码；小程序版本可由手机号授权 code 换取后写入。' })
  @IsString()
  @Length(11, 11)
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone!: string;

  @ApiPropertyOptional({ example: '张三', description: '用户昵称/姓名。可由用户填写；不填时后端默认使用手机号后 4 位生成昵称。' })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  nickname?: string;


}


export class DistributionProfileDto extends SmsCodeFieldDto {
  @ApiProperty({ example: '1XXXXXXXXXX', description: 'H5 用户手机号。' })
  @IsString()
  @Length(11, 11)
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone!: string;

  @ApiProperty({ example: '张三', description: '用户姓名/昵称。' })
  @IsString()
  @Length(1, 80)
  nickname!: string;
}

export class DistributionTaskQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: '派发链接指定的任务 ID，仅返回成员有权查看且仍可领取的任务。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  taskId?: string;

  @ApiPropertyOptional({ example: 'claimable', description: '任务列表范围：claimable=当前用户仍可领取；all=全部可领取池任务。默认 claimable。' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  scope?: string;

  @ApiPropertyOptional({ example: 'DOUYIN' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  platform?: string;

  @ApiPropertyOptional({ example: 'account_id', description: '当前选择的任务账号 ID；不传时使用默认任务账号。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  taskAccountId?: string;

  @ApiPropertyOptional({ example: 'tenant-id-or-code', description: '已废弃：正式环境不再用前端 tenantId 决定范围。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  tenantId?: string;
}


export class DistributionLeaderCenterQueryDto {
  @ApiPropertyOptional({ example: '2026-06-01', description: '统计开始日期，按北京时间自然日计算；需与 endDate 一起传。' })
  @IsOptional()
  @IsString()
  @Length(10, 10)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate 必须为 YYYY-MM-DD 格式' })
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-06-30', description: '统计结束日期，按北京时间自然日计算且包含当天；需与 startDate 一起传。' })
  @IsOptional()
  @IsString()
  @Length(10, 10)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate 必须为 YYYY-MM-DD 格式' })
  endDate?: string;
}

export class DistributionOrderQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'completed', description: '记录类型：all=全部历史，completed=已完成未结算任务，abandoned=已放弃任务，rejected=已驳回任务，settled=已结算收益任务。' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  type?: string;

  @ApiPropertyOptional({ example: 'DOUYIN' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  platform?: string;

  @ApiPropertyOptional({ example: 'task_account_id', description: '任务账号 ID；传入后只查看该任务账号的任务记录，不传则查看当前登录用户下全部任务账号记录。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  taskAccountId?: string;
}

export class DistributionClaimDto {
  @ApiPropertyOptional({ example: 'DOUYIN', description: '指定平台；不传则从全部可领取任务中随机。' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  platform?: string;

  @ApiPropertyOptional({ example: 'task_id', description: '指定任务领取；不传时随机领取一条任务。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  taskId?: string;

  @ApiPropertyOptional({ example: 'account_id', description: '当前选择的任务账号 ID；不传时使用默认任务账号。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  taskAccountId?: string;

  @ApiPropertyOptional({ example: 'tenant-id-or-code', description: '已废弃：正式环境不再用前端 tenantId 决定范围。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  tenantId?: string;
}

export class DistributionAbandonDto {
  @ApiPropertyOptional({ example: '不熟悉该平台，放弃本次任务。' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  reason?: string;
}

export class DistributionCompleteDto {
  @ApiPropertyOptional({ example: 'visitor_token', description: '兼容旧公开流程；登录态完成当前任务时可不传。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  visitorToken?: string;

  @ApiProperty({ type: [String], example: ['file_id_1', 'file_id_2'], description: '完成凭证文件 ID 列表。' })
  @IsArray()
  @ArrayMaxSize(9)
  @IsString({ each: true })
  @Length(1, 64, { each: true })
  proofFileIds!: string[];

  @ApiPropertyOptional({ example: 'dy_123456', description: '用户自媒体账号 ID；OCR 不稳定时建议让用户手动填写。' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  mediaAccountNo?: string;
}


export class DistributionHomepageProofRetainDto {
  @ApiProperty({ example: 'cm9m3q0re0002abc123def456', description: '需要长期复用的用户主页截图文件 ID。' })
  @IsString()
  @Length(1, 64)
  fileId!: string;

  @ApiProperty({ example: 'DOUYIN', description: '截图所属平台。后端会归一化后校验当前任务平台。' })
  @IsString()
  @Length(1, 32)
  platform!: string;

  @ApiPropertyOptional({ example: 'task_account_id', description: '当前手机号任务账号 ID。后端会与当前进行中任务校验，防止跨账号混用主页截图。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  taskAccountId?: string;
}

export class DistributionHomepageProofAccessQueryDto {
  @ApiProperty({ example: 'DOUYIN', description: '截图所属平台。' })
  @IsString()
  @Length(1, 32)
  platform!: string;

  @ApiPropertyOptional({ example: 'task_account_id', description: '当前任务账号 ID；用于将主页截图缓存隔离到手机号任务账号。旧 H5 不传时仍兼容历史绑定。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  taskAccountId?: string;
}

export class DistributionHomepageProofRecognitionRequestDto {
  @ApiProperty({ example: 'DOUYIN', description: '当前任务平台；OCR 会从截图文案识别平台并仅作为核验结果返回。' })
  @IsString()
  @Length(1, 32)
  platform!: string;

  @ApiPropertyOptional({ example: 'task_account_id', description: '当前任务账号 ID；用于读取该手机号账号的主页识别记录。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  taskAccountId?: string;
}

export class DistributionWithdrawDto {
  @ApiProperty({ example: 1000, description: '提现金额，单位：分。' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiPropertyOptional({ example: '提现到微信账户' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  remark?: string;
}

export class BanAppUserDto {
  @ApiProperty({ example: 7, description: '限制天数。' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;

  @ApiProperty({ example: '因为你在完成任务 7 天内就删除了评论，现限制 7 天内不可接单。' })
  @IsString()
  @Length(1, 255)
  reason!: string;

  @ApiPropertyOptional({ example: 'file_id', description: '限制证据截图文件 ID，可选。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  screenshotFileId?: string;
}

export class DistributionInviteBindDto {
  @ApiProperty({ example: 'HS8K2M', description: '成员邀请码。' })
  @IsString()
  @Length(4, 64)
  inviteCode!: string;
}

export class DistributionLeaderBindDto extends SmsCodeFieldDto {
  @ApiProperty({ example: 'LEADER-9Q8A2M', description: '团长身份绑定码。' })
  @IsString()
  @Length(4, 80)
  leaderCode!: string;

  @ApiProperty({ example: '1XXXXXXXXXX', description: '团长任务账号手机号。后续接短信验证码。' })
  @IsString()
  @Length(11, 11)
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone!: string;

  @ApiProperty({ example: '示例成员', description: '团长任务账号昵称。' })
  @IsString()
  @Length(1, 80)
  nickname!: string;
}

export class DistributionTaskAccountDto extends SmsCodeFieldDto {
  @ApiProperty({ example: '1XXXXXXXXXX' })
  @IsString()
  @Length(11, 11)
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone!: string;

  @ApiProperty({ example: '张三' })
  @IsString()
  @Length(1, 80)
  nickname!: string;
}

export class AdminDistributionGroupQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  tenantId?: string;

  @ApiPropertyOptional({ example: false, description: '是否显示已经逻辑删除的团长档案。默认不显示。' })
  @Transform(({ value }) => value === true || String(value ?? '').toLowerCase() === 'true' || String(value ?? '') === '1')
  @IsOptional()
  @IsBoolean()
  includeDeleted?: boolean;

  @ApiPropertyOptional({ example: '示例成员' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  keyword?: string;

  @ApiPropertyOptional({ example: 'group_id_1,group_id_2', description: '仅供测试清理范围直达使用：按多个团长档案 ID 精确筛选，最多 100 条。' })
  @IsOptional()
  @IsString()
  @Length(1, 7000)
  ids?: string;
}

export class AdminCreateDistributionGroupDto {
  @ApiProperty({ example: 'tenant_id' })
  @IsString()
  @Length(1, 64)
  tenantId!: string;

  @ApiProperty({ example: '示例团队' })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiPropertyOptional({ example: '示例成员' })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  leaderName?: string;

  @ApiPropertyOptional({ example: '1XXXXXXXXXX' })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  leaderPhone?: string;

  @ApiPropertyOptional({ example: 'HS8K2M', description: '自定义成员邀请码；不传则自动生成。' })
  @Transform(({ value }) => String(value ?? '').trim() || undefined)
  @IsOptional()
  @IsString()
  @Length(4, 32)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: '成员邀请码只能包含字母、数字、下划线或短横线' })
  memberInviteCode?: string;

  @ApiPropertyOptional({ example: 'L93A8D7788C', description: '自定义团长身份码；不传则自动生成。' })
  @Transform(({ value }) => String(value ?? '').trim() || undefined)
  @IsOptional()
  @IsString()
  @Length(4, 64)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: '团长身份码只能包含字母、数字、下划线或短横线' })
  leaderBindCode?: string;

  @ApiPropertyOptional({ example: true, description: '该团长是否接受任务分佣；关闭后创建任务时不能选用团长分佣。' })
  @IsOptional()
  @IsBoolean()
  commissionEnabled?: boolean;

  @ApiPropertyOptional({ example: 'PERCENT', description: '默认分佣规则：PERCENT=按比例；FIXED=每个订单固定金额。' })
  @IsOptional()
  @IsIn(['PERCENT', 'FIXED'])
  commissionRuleType?: string;

  @ApiPropertyOptional({ example: 500, description: '规则值：PERCENT 用基点（500=5.00%）；FIXED 用分（10=¥0.10）。' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  commissionRuleValue?: number;

  @ApiPropertyOptional({ example: false, description: '勾选后标识为测试团长，且仅在服务端显式开启测试清理开关时可重置其测试业务数据。' })
  @IsOptional()
  @IsBoolean()
  isTestData?: boolean;

  @ApiPropertyOptional({ example: '测试团长' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  remark?: string;
}

export class AdminUpdateDistributionGroupCodeDto {
  @ApiProperty({ example: 'HS8K2M', description: '新的邀请码/身份码。只能包含字母、数字、下划线或短横线。' })
  @Transform(({ value }) => String(value ?? '').trim() || undefined)
  @IsString()
  @Length(4, 64)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: '码只能包含字母、数字、下划线或短横线' })
  code!: string;
}

export class AdminBindGroupLeaderDto {
  @ApiProperty({ example: '1XXXXXXXXXX' })
  @IsString()
  @Length(11, 11)
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone!: string;
}

export class AdminGroupCollaborationQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  tenantId?: string;
}

export class AdminCreateGroupCollaborationDto {
  @ApiProperty({ example: 'tenant_id' })
  @IsString()
  @Length(1, 64)
  tenantId!: string;

  @ApiProperty({ example: 'source_group_id', description: '任务来源团长/分发组。' })
  @IsString()
  @Length(1, 64)
  sourceGroupId!: string;

  @ApiProperty({ example: 'target_group_id', description: '被授权接任务的团长/分发组。' })
  @IsString()
  @Length(1, 64)
  targetGroupId!: string;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  startAt?: string;

  @ApiPropertyOptional({ example: '2026-01-31T23:59:59.000Z' })
  @IsOptional()
  @IsString()
  endAt?: string;
}

export class DistributionLeaderApplicationDto {
  @ApiProperty({ example: '华东运营团队', description: '申请成为团长后创建/使用的团队名称。' })
  @IsString()
  @Length(1, 100)
  requestedGroupName!: string;

  @ApiPropertyOptional({ example: '我有稳定的本地运营成员，能够负责邀请与日常协同。' })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}

export class AdminLeaderApplicationQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  tenantId?: string;

  @ApiPropertyOptional({ example: 'PENDING', description: 'PENDING / APPROVED / REJECTED' })
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])
  status?: string;

  @ApiPropertyOptional({ example: '示例成员 / 1XXXXXXXXXX' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  keyword?: string;
}

export class AdminApproveLeaderApplicationDto {
  @ApiPropertyOptional({ example: '华东运营团队', description: '审核通过后使用的团队名称；不填则沿用申请名称。' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  groupName?: string;

  @ApiPropertyOptional({ example: true, description: '是否为该团长启用分佣。' })
  @IsOptional()
  @IsBoolean()
  commissionEnabled?: boolean;

  @ApiPropertyOptional({ example: 'PERCENT' })
  @IsOptional()
  @IsIn(['PERCENT', 'FIXED'])
  commissionRuleType?: string;

  @ApiPropertyOptional({ example: 500, description: 'PERCENT 用基点（500=5.00%）；FIXED 用分（10=¥0.10）。' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  commissionRuleValue?: number;

  @ApiPropertyOptional({ example: false, description: '是否将审核通过创建的团队标记为测试数据。生产团长不要勾选。' })
  @IsOptional()
  @IsBoolean()
  isTestData?: boolean;

  @ApiPropertyOptional({ example: '通过，先按 5% 分佣执行。' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  reviewRemark?: string;
}

export class AdminRejectLeaderApplicationDto {
  @ApiProperty({ example: '当前团队资料不完整，请补充后重新申请。' })
  @IsString()
  @Length(1, 255)
  reviewRemark!: string;
}

export class AdminUpdateDistributionGroupCommissionDto {
  @ApiProperty({ example: true, description: '是否接受任务分佣。关闭后将不能在新任务中启用该团长的分佣。' })
  @IsBoolean()
  commissionEnabled!: boolean;

  @ApiPropertyOptional({ example: 'PERCENT' })
  @IsOptional()
  @IsIn(['PERCENT', 'FIXED'])
  commissionRuleType?: string;

  @ApiPropertyOptional({ example: 500, description: 'PERCENT 用基点（500=5.00%）；FIXED 用分（10=¥0.10）。' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  commissionRuleValue?: number;
}

export class AdminUnbindDistributionGroupLeaderDto {
  @ApiProperty({ enum: ['UNBIND_ALL', 'TRANSFER_TO_GROUP'], description: '成员处理方式：全部解绑为未加入团队，或转移给另一位启用团长。团长本人始终解除身份，不会自动转移。' })
  @IsIn(['UNBIND_ALL', 'TRANSFER_TO_GROUP'])
  memberHandling!: 'UNBIND_ALL' | 'TRANSFER_TO_GROUP';

  @ApiPropertyOptional({ example: 'target_group_id', description: '仅当成员处理方式为转移时必填；目标团队必须同租户且处于启用状态。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  targetGroupId?: string;

  @ApiPropertyOptional({ example: false, description: '是否同时停止该团长下尚无人领取的任务。已领取或待结算订单绝不会被强制停止。' })
  @IsOptional()
  @IsBoolean()
  stopUnclaimedTasks?: boolean;

  @ApiPropertyOptional({ example: '测试结束，解除团长身份。' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  reason?: string;
}

export class AdminDeleteDistributionGroupDto {
  @ApiProperty({ example: '华东运营团队', description: '必须输入完整团队名称确认逻辑删除。仅已解绑的团长允许删除。' })
  @IsString()
  @Length(1, 100)
  confirmName!: string;
}

export class AdminResetDistributionGroupTestDataDto {
  @ApiProperty({ example: '测试团长 A', description: '必须输入完整团队名称确认测试业务数据清理。' })
  @IsString()
  @Length(1, 100)
  confirmName!: string;
}

export class AdminMarkDistributionGroupTestDataDto {
  @ApiProperty({ example: '测试团长 A', description: '必须输入完整团队名称确认将既有团长标记为测试数据。仅服务端开启测试清理开关时允许使用。' })
  @IsString()
  @Length(1, 100)
  confirmName!: string;
}

/**
 * 测试团长专用的高危清理确认。
 * 服务端会重新计算关联任务、订单、佣金、钱包及提现范围，前端不能自行拼接范围。
 */
export class AdminForceUnbindDeleteDistributionGroupDto {
  @ApiProperty({ example: '确认强制解绑并删除「测试团长 A」及4个关联任务', description: '必须与服务端预演返回的确认文本完全一致。' })
  @IsString()
  @Length(1, 160)
  confirmForceText!: string;

  @ApiPropertyOptional({ example: '测试轮次结束，清理完整测试链路。' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  reason?: string;
}

export class AdminLeaderCommissionSettlementQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  tenantId?: string;

  @ApiPropertyOptional({ example: 'group_id' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  groupId?: string;

  @ApiPropertyOptional({ example: '示例成员 / 1XXXXXXXXXX / 任务标题' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  keyword?: string;
}

