import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Min, ValidateIf, ValidateNested } from 'class-validator';

function normalizeVideoUrlInput(value: unknown) {
  if (value === undefined || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? '').trim())
      .filter(Boolean);
  }
  const raw = String(value).trim();
  return raw ? [raw] : [];
}

export class DailyTaskCommentInputDto {
  @ApiPropertyOptional({
    example: '这个视频讲得很自然，收藏了。',
    description: '评论内容（兼容字段）。建议新前端统一使用 text。',
  })
  @ValidateIf((o) => o.text === undefined)
  @IsString()
  content?: string;

  @ApiPropertyOptional({
    example: '这个视频讲得很自然，收藏了。',
    description: '评论内容（推荐字段）。前端建议传 comment: [{ text: "..." }].',
  })
  @ValidateIf((o) => o.content === undefined)
  @IsString()
  text?: string;

  @ApiPropertyOptional({
    example: 'IMPORT',
    description: '评论来源。可用于区分手工录入、AI 生成、Excel 导入等来源。',
  })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({
    example: 'SOUTH_CHINA',
    description: '评论区域或人群标签。用于后续筛选、统计或灰度投放。',
  })
  @IsOptional()
  @IsString()
  regionCode?: string;
}

export class DailyTaskVideoLinkInputDto {
  @ApiProperty({
    example: 'https://example.com/video/demo',
    description: '任务相关的视频跳转链接。H5 可用它做复制链接、唤起 App、重新操作等动作。',
  })
  @IsString()
  url!: string;

  @ApiPropertyOptional({
    example: false,
    description: '是否为主链接。true 表示主入口链接；false 表示补充链接。',
  })
  @IsOptional()
  isPrimary?: boolean;
}

export class TaskStepConfigDto {
  @ApiPropertyOptional({
    type: 'array',
    description: '步骤配置 JSON。后端只负责原样存储与返回，前端按 JSON 协议自行渲染步骤说明、弹窗、按钮文案。',
    example: [
      {
        code: 'START_ASSIST',
        title: '第一步：开始助推',
        description: '请在 4G/5G 网络环境下进行助推任务。',
        tips: ['请在 4G/5G 网络环境下进行助推任务', '开始后若未自动跳转，请手动打开抖音等待视频弹出'],
        buttons: [{ code: 'START', text: '开始助推任务' }],
      },
      {
        code: 'CLAIM_COMMENT',
        title: '第二步：领取评论',
        description: '完成点赞/分享/完播后，输入姓名领取评论。',
        buttons: [
          { code: 'CLAIM', text: '领取评论' },
          { code: 'RESET', text: '重新操作' },
        ],
      },
      {
        code: 'CONFIRM',
        title: '第三步：确认完成',
        description: '确认已经完成助推动作后，点击确认完成。',
        buttons: [
          { code: 'CONFIRM', text: '确认完成' },
          { code: 'RESET', text: '重新操作' },
        ],
      },
    ],
  })
  steps?: Array<Record<string, unknown>>;
}

export class CreateDailyTaskDto {
  @ApiPropertyOptional({
    example: 'cm9m3jhm30001abc123def456',
    description: '所属租户 ID。可选；不传时优先使用 `X-Tenant-Id` 请求头中的当前租户。',
  })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ example: 'cm9m3q0re0002abc123def456', description: '关联的媒体账号 ID，必须与 tenantId、platform 对应。' })
  @IsString()
  mediaAccountId!: string;

  @ApiProperty({ example: 'DOUYIN', description: '媒体平台编码。建议统一使用大写字典值，例如 DOUYIN / WECHAT_VIDEO / XIAOHONGSHU。' })
  @IsString()
  platform!: string;

  @ApiPropertyOptional({ example: '29', description: '对外帖子 ID。H5/小程序通过 tenantsId + type + postId 访问任务时，会基于这个字段进行匹配。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  postId?: string;

  @ApiProperty({ example: '国际尬唱251', description: '任务标题或视频标题。H5 页面顶部展示的就是这个字段。' })
  @IsString()
  @Length(1, 255)
  title!: string;

  @ApiPropertyOptional({ example: '花生牛奶', description: '作者名称。若不传，H5 默认回退为 mediaAccount.accountName。' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  authorName?: string;

  @ApiProperty({
    example: ['https://api.example.com/?tenantsId=tenant-demo&type=douyin&postId=29'],
    description: '视频主链接，支持传字符串或字符串数组；若传数组，第一项作为主链接，其余会作为备用链接保存。',
  })
  @Transform(({ value }) => normalizeVideoUrlInput(value))
  @IsArray({ message: '视频链接必须为字符串或字符串数组' })
  @ArrayMinSize(1, { message: '至少需要提供一个视频链接' })
  @ArrayMaxSize(20, { message: '视频链接最多支持 20 个' })
  @IsString({ each: true, message: '视频链接必须为字符串' })
  videoUrl!: string[];

  @ApiPropertyOptional({ example: '2026-03-18T19:43:33.000Z', description: '视频发布时间。H5 页面若存在该值，优先展示；否则回退为 dispatchedAt 或 createdAt。' })
  @IsOptional()
  @IsString()
  publishedAt?: string;

  @ApiPropertyOptional({ example: 'file_id', description: '任务封面文件 ID。需先调用上传接口拿到 fileId。' })
  @IsOptional()
  @IsString()
  coverFileId?: string;

  @ApiPropertyOptional({ example: '【花生牛奶】最新视频，请大家在上方链接内打开视频，并领取评论发布！', description: '外部群发或页面内的任务文案。' })
  @IsOptional()
  @IsString()
  copywriting?: string;

  @ApiPropertyOptional({ example: '点赞 + 分享 + 收藏 + 评论，务必完整播放视频。', description: '评论/助推执行要求。可用于 PC 配置，也可供 H5 文案兜底展示。' })
  @IsOptional()
  @IsString()
  commentRequirement?: string;

  @ApiPropertyOptional({ example: '这个点讲得很自然，已经收藏了。', description: '示例评论。用于 AI 生成或运营配置参考。' })
  @IsOptional()
  @IsString()
  commentExample?: string;

  @ApiProperty({ example: 44, description: '目标评论数。H5 页面中的“评论领取情况 x / y”里的 y 值就是这个字段。' })
  @IsInt()
  @Min(1)
  targetCommentCount!: number;

  @ApiPropertyOptional({ example: 150, description: '单个完成任务的奖励金额，单位：分。PC 创建任务时配置，订单结算默认带出该金额。' })
  @IsOptional()
  @IsInt()
  @Min(0)
  rewardAmount?: number;

  @ApiPropertyOptional({
    example: 'READY',
    description: '任务状态。DRAFT / READY / DISPATCHED / RUNNING / COMPLETED / CANCELLED / DISABLED。',
  })
  @IsOptional()
  @IsIn(['DRAFT', 'READY', 'DISPATCHED', 'RUNNING', 'COMPLETED', 'CANCELLED', 'DISABLED'])
  status?: string;


  @ApiPropertyOptional({ example: 'TENANT', description: '任务可见范围：TENANT=整个租户，GROUP=指定团长/分发组。' })
  @IsOptional()
  @IsIn(['TENANT', 'GROUP'])
  distributionScope?: string;

  @ApiPropertyOptional({ example: 'group_id', description: '指定团长/分发组 ID，distributionScope=GROUP 时必填。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  distributionGroupId?: string;

  @ApiPropertyOptional({ example: false, description: '是否允许跨团长协作领取。' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowGroupCollaboration?: boolean;

  @ApiPropertyOptional({ example: false, description: '预留：是否参与团长分佣。' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  commissionEnabled?: boolean;

  @ApiPropertyOptional({ example: 'rule_id', description: '兼容字段：不再直接引用全局规则，任务会保存团长规则快照。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  commissionRuleId?: string;

  @ApiPropertyOptional({ example: 200, description: '管理端输入的任务金额，单位：分。开启团长分佣时，EXTRA 表示成员金额，INCLUDED 表示总预算。' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  taskBudgetAmount?: number;

  @ApiPropertyOptional({ example: 'EXTRA', description: '团长佣金计价方式：EXTRA=任务金额外另计；INCLUDED=从任务金额中扣除。' })
  @IsOptional()
  @IsIn(['INCLUDED', 'EXTRA'])
  commissionMode?: string;

  @ApiPropertyOptional({ example: '该任务用于 H5 分发流程。', description: '任务备注。仅管理端使用。' })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: '已废弃：步骤配置改为模块级配置，不再建议在单条任务里传递。',
    example: {
      steps: [
        {
          code: 'START_ASSIST',
          title: '第一步：开始助推',
          description: '请在 4G/5G 网络环境下进行助推任务。',
          buttons: [{ code: 'START', text: '开始助推任务' }],
        },
        {
          code: 'CLAIM_COMMENT',
          title: '第二步：领取评论',
          description: '完成点赞/分享/完播后，输入姓名领取评论。',
          buttons: [
            { code: 'CLAIM', text: '领取评论' },
            { code: 'RESET', text: '重新操作' },
          ],
        },
        {
          code: 'CONFIRM',
          title: '第三步：确认完成',
          description: '确认已完成所有操作。',
          buttons: [{ code: 'CONFIRM', text: '确认完成' }],
        },
      ],
    },
  })
  @IsOptional()
  @IsObject()
  stepConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [DailyTaskVideoLinkInputDto], description: '附加视频链接列表。可用于多个入口链接、备用链接或多平台跳转。' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DailyTaskVideoLinkInputDto)
  videoLinks?: DailyTaskVideoLinkInputDto[];

  @ApiPropertyOptional({ type: [DailyTaskCommentInputDto], description: '评论池。H5 领取评论时，会从这些评论中按顺序挑选 status=AVAILABLE 的评论进行锁定。' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => DailyTaskCommentInputDto)
  comments?: DailyTaskCommentInputDto[];

  @ApiPropertyOptional({ type: [DailyTaskCommentInputDto], description: '评论池（推荐字段）。格式示例：comment: [{ text: "aaa" }, { text: "bbb" }]。' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => DailyTaskCommentInputDto)
  comment?: DailyTaskCommentInputDto[];
}

export class UpdateDailyTaskDto {
  @ApiPropertyOptional({ example: 'cm9m3q0re0002abc123def456', description: '新的媒体账号 ID。' })
  @IsOptional()
  @IsString()
  mediaAccountId?: string;

  @ApiPropertyOptional({ example: 'DOUYIN', description: '新的平台编码。' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ example: '29', description: '外部帖子 ID。用于 H5/小程序公开访问匹配。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  postId?: string;

  @ApiPropertyOptional({ example: '国际尬唱251', description: '任务标题。' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  title?: string;

  @ApiPropertyOptional({ example: '花生牛奶', description: '作者名称。' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  authorName?: string;

  @ApiPropertyOptional({
    example: ['https://api.example.com/?tenantsId=tenant-demo&type=douyin&postId=29'],
    description: '任务主链接，支持传字符串或字符串数组；若传数组，第一项作为主链接，其余会作为备用链接保存。',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeVideoUrlInput(value))
  @IsArray({ message: '视频链接必须为字符串或字符串数组' })
  @ArrayMinSize(1, { message: '至少需要提供一个视频链接' })
  @ArrayMaxSize(20, { message: '视频链接最多支持 20 个' })
  @IsString({ each: true, message: '视频链接必须为字符串' })
  videoUrl?: string[];

  @ApiPropertyOptional({ example: '2026-03-18T19:43:33.000Z', description: '视频发布时间。' })
  @IsOptional()
  @IsString()
  publishedAt?: string;

  @ApiPropertyOptional({ example: 'file_id', description: '新的封面文件 ID。' })
  @IsOptional()
  @IsString()
  coverFileId?: string;

  @ApiPropertyOptional({ example: '【花生牛奶】最新视频，请大家在上方链接内打开视频，并领取评论发布！', description: '任务文案。' })
  @IsOptional()
  @IsString()
  copywriting?: string;

  @ApiPropertyOptional({ example: '点赞 + 分享 + 收藏 + 评论，务必完整播放视频。', description: '助推执行要求。' })
  @IsOptional()
  @IsString()
  commentRequirement?: string;

  @ApiPropertyOptional({ example: '这个点讲得很自然，已经收藏了。', description: '示例评论。' })
  @IsOptional()
  @IsString()
  commentExample?: string;

  @ApiPropertyOptional({ example: 44, description: '目标评论数。' })
  @IsOptional()
  @IsInt()
  @Min(1)
  targetCommentCount?: number;

  @ApiPropertyOptional({ example: 150, description: '单个完成任务的奖励金额，单位：分。' })
  @IsOptional()
  @IsInt()
  @Min(0)
  rewardAmount?: number;

  @ApiPropertyOptional({
    example: 'READY',
    description: '任务状态。建议仅在管理端显式流转：DRAFT / READY / DISPATCHED / RUNNING / COMPLETED / CANCELLED / DISABLED。',
  })
  @IsOptional()
  @IsIn(['DRAFT', 'READY', 'DISPATCHED', 'RUNNING', 'COMPLETED', 'CANCELLED', 'DISABLED'])
  status?: string;


  @ApiPropertyOptional({ example: 'TENANT', description: '新的任务可见范围：TENANT=整个租户，GROUP=指定团长/分发组。' })
  @IsOptional()
  @IsIn(['TENANT', 'GROUP'])
  distributionScope?: string;

  @ApiPropertyOptional({ example: 'group_id', description: '指定团长/分发组 ID，distributionScope=GROUP 时必填。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  distributionGroupId?: string;

  @ApiPropertyOptional({ example: false, description: '是否允许跨团长协作领取。' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowGroupCollaboration?: boolean;

  @ApiPropertyOptional({ example: false, description: '预留：是否参与团长分佣。' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  commissionEnabled?: boolean;

  @ApiPropertyOptional({ example: 'rule_id', description: '兼容字段：不再直接引用全局规则，任务会保存团长规则快照。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  commissionRuleId?: string;

  @ApiPropertyOptional({ example: 200, description: '管理端输入的任务金额，单位：分。领取前允许调整；产生领取记录后与分佣一起锁定。' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  taskBudgetAmount?: number;

  @ApiPropertyOptional({ example: 'EXTRA', description: '团长佣金计价方式：EXTRA=任务金额外另计；INCLUDED=从任务金额中扣除。' })
  @IsOptional()
  @IsIn(['INCLUDED', 'EXTRA'])
  commissionMode?: string;

  @ApiPropertyOptional({ example: '该任务用于 H5 免登录领取评论演示。', description: '任务备注。' })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({
    example: false,
    description:
      '是否显式替换评论池。默认 false：即使前端传了空数组，也视为“不改评论池”；为 true 时，comment/comments 会按全量覆盖处理。',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  replaceComments?: boolean;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: '已废弃：步骤配置改为模块级配置，不再建议在单条任务里更新。',
    example: {
      steps: [
        { code: 'START_ASSIST', title: '第一步：开始助推', buttons: [{ code: 'START', text: '开始助推任务' }] },
        { code: 'CLAIM_COMMENT', title: '第二步：领取评论', buttons: [{ code: 'CLAIM', text: '领取评论' }] },
        { code: 'CONFIRM', title: '第三步：确认完成', buttons: [{ code: 'CONFIRM', text: '确认完成' }] },
      ],
    },
  })
  @IsOptional()
  @IsObject()
  stepConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [DailyTaskCommentInputDto], description: '评论池（推荐字段）。默认仅在数组有内容时触发覆盖；若需用空数组清空，请配合 replaceComments=true。' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => DailyTaskCommentInputDto)
  comment?: DailyTaskCommentInputDto[];

  @ApiPropertyOptional({ type: [DailyTaskCommentInputDto], description: '评论池（兼容字段）。默认仅在数组有内容时触发覆盖；若需用空数组清空，请配合 replaceComments=true。' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => DailyTaskCommentInputDto)
  comments?: DailyTaskCommentInputDto[];

  @ApiPropertyOptional({ type: [DailyTaskVideoLinkInputDto], description: '附加视频链接列表。可用于多个入口链接、备用链接或多平台跳转。' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DailyTaskVideoLinkInputDto)
  videoLinks?: DailyTaskVideoLinkInputDto[];
}

export class CreateDailyTaskConfigDto {
  @ApiProperty({ example: 'DOUYIN', description: '平台编码。配置按平台维度独立保存。' })
  @IsString()
  @Length(1, 32)
  platform!: string;

  @ApiProperty({
    example:
      '{"steps":[{"platform":"douyin","title":"请断开 wifi 连接，并打开抖音 app，完成以下操作","sortOrder":10,"status":1,"steps":[{"step":1,"text":"复制抖音链接"}]}]}',
    description: '配置字段（JSON 字符串）。前端传什么，后端就原样保存什么。',
  })
  @IsString()
  config!: string;
}

export class UpdateDailyTaskConfigDto {
  @ApiProperty({ example: 'DOUYIN', description: '平台编码。用于定位要编辑的配置。' })
  @IsString()
  @Length(1, 32)
  platform!: string;

  @ApiProperty({
    example:
      '{"steps":[{"platform":"weixin","title":"请先查看流程后再进行微信助推任务","sortOrder":10,"status":1,"steps":[{"step":1,"text":"完成视频收藏、点赞、分享、完播"}]}]}',
    description: '配置字段（JSON 字符串，整包覆盖）。前端传什么，后端就原样保存什么。',
  })
  @IsString()
  config!: string;
}


/**
 * 将测试任务从普通运营链路切换为“测试清理模式”。
 * 服务端会立即停用任务，避免新的 H5 领取、提交和结算进入待清理数据。
 */
export class BatchMarkDailyTasksAsTestDataDto {
  @ApiProperty({
    type: [String],
    example: ['task_id_1', 'task_id_2'],
    description: '需要标记为测试数据的每日任务 ID，最多 100 条。已标记项会被安全忽略并计入已标记数量。',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Length(1, 64, { each: true })
  ids!: string[];
}

/** 普通任务删除无需确认标题；测试任务物理清理必须回传任务标题二次确认。 */
export class RemoveDailyTaskDto {
  @ApiPropertyOptional({
    example: '测试任务：抖音评论任务 A',
    description: '仅删除已标记为测试数据的任务时必填，必须与任务标题完全一致。',
  })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  confirmTitle?: string;

  @ApiPropertyOptional({
    example: true,
    description: '仅用于已完全纳入测试范围的账号：明确确认后，允许把已进入外部付款/已打款状态的测试提现记录一并清理。',
  })
  @IsOptional()
  @IsBoolean()
  forceExternalWithdrawalPurge?: boolean;

  @ApiPropertyOptional({
    example: '确认清理69笔外部提现测试记录',
    description: '当 forceExternalWithdrawalPurge=true 且存在外部提现记录时必填；必须与服务端预览返回的确认文本完全一致。',
  })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  confirmExternalWithdrawalText?: string;

  @ApiPropertyOptional({
    example: true,
    description: '管理员强制清理：自动纳入当前测试任务关联的任务、订单、佣金、账号钱包流水与提现记录；仅在 ALLOW_TEST_DATA_PURGE=true 时可用。',
  })
  @IsOptional()
  @IsBoolean()
  forceAdminPurge?: boolean;

  @ApiPropertyOptional({
    example: '确认强制清理15个任务及7个账号的测试数据',
    description: '管理员强制清理时必填；必须与服务端预览返回的确认文本完全一致。',
  })
  @IsOptional()
  @IsString()
  @Length(1, 160)
  confirmForceText?: string;
}
