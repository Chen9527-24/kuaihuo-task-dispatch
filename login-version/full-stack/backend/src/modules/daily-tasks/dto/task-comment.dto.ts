import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Min, ValidateIf } from 'class-validator';

export class CreateTaskCommentDto {
  @ApiProperty({ example: '这个视频讲得很自然，收藏了。', description: '评论内容。会进入任务评论池，供 H5/小程序用户后续领取。' })
  @IsString()
  content!: string;

  @ApiPropertyOptional({ example: 'IMPORT', description: '评论来源。用于区分手工录入、导入、AI 生成等来源。' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ example: 'SOUTH_CHINA', description: '评论区域标签。用于精细化筛选或统计。' })
  @IsOptional()
  @IsString()
  regionCode?: string;
}

export class UpdateTaskCommentDto {
  @ApiPropertyOptional({ example: '这个视频讲得很自然，收藏了。', description: '更新后的评论内容。' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({
    example: 'AVAILABLE',
    description: '评论状态。AVAILABLE 会重新回到可领取池；CLAIMED 表示已被领取；COMPLETED 表示已完成；INVALID 表示作废。',
  })
  @IsOptional()
  @IsIn(['UNCONFIGURED', 'AVAILABLE', 'CLAIMED', 'COMPLETED', 'INVALID'])
  status?: string;

  @ApiPropertyOptional({ example: 'user_id', description: '后台人工指派的系统用户 ID。主要用于 PC 管理端，不用于 H5 免登录场景。' })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({ example: 'SOUTH_CHINA', description: '评论区域标签。' })
  @IsOptional()
  @IsString()
  regionCode?: string;
}

export class BatchDeleteTaskCommentsDto {
  @ApiProperty({ example: ['cm9q6n5e10001abc123def456', 'cm9q6n5e10002abc123def457'], description: '待删除的评论 ID 列表。' })
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class AiGenerateCommentsDto {
  @ApiProperty({
    example: '请基于当前配置生成评论运营数据，主题必须紧贴这条抖音投流/追投视频，语气像评论区真实留言，严格返回 rows JSON。',
    description: '发送给 Coze 工作流的对话内容，对应 additional_messages[0].content。',
  })
  @IsString()
  messageContent!: string;

  @ApiProperty({ example: 10, description: '评论数量，对应 Coze 参数 COMMENT_COUNT。' })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  count!: number;

  @ApiProperty({ example: '别再死磕追投了，很多账户就是这么跑废的', description: '视频标题，对应 Coze 参数 VIDEO_TITLE。' })
  @IsString()
  videoTitle!: string;

  @ApiPropertyOptional({ example: 'https://example.com/video/demo', description: '视频链接，对应 Coze 参数 VIDEO_URL。可不传，不传时默认空字符串。' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return '';
    return String(value).trim();
  })
  @IsString()
  @ValidateIf((_, value) => value !== '')
  @IsUrl({ require_protocol: true }, { message: 'videoUrl 必须是合法链接' })
  videoUrl?: string;

  @ApiProperty({ example: '这是一个抖音投流口播视频。核心内容是：很多老板全域投放跑不动...', description: '视频内容简介，对应 Coze 参数 VIDEO_CONTENT。' })
  @IsString()
  videoContent!: string;

  @ApiProperty({ example: '8年一线投放经验，消耗过亿，一代老投手持续实操...', description: '账号定位，对应 Coze 参数 ACCOUNT_POSITIONING。' })
  @IsString()
  accountPositioning!: string;

  @ApiProperty({ example: '博主口播', description: '视频风格，对应 Coze 参数 VIDEO_STYLE。' })
  @IsString()
  videoStyle!: string;

  @ApiProperty({ example: '别再死磕当大冤种了，全域跑不动，你放量了就亏到哭...', description: '视频脚本，对应 Coze 参数 VIDEO_SCRIPT。' })
  @IsString()
  videoScript!: string;

  @ApiProperty({ example: '有投流需求的老板、中小商家负责人、本地生活商家', description: '目标人群，对应 Coze 参数 TARGET_AUDIENCE。' })
  @IsString()
  targetAudience!: string;

  @ApiProperty({ example: '想投流但怕没效果，不知道怎么投，担心成本高、留资少', description: '受众痛点，对应 Coze 参数 AUDIENCE_PAIN_POINT。' })
  @IsString()
  audiencePainPoint!: string;

  @ApiProperty({ example: '提升视频曝光，带动评论区互动，营造讨论氛围', description: '运营目标，对应 Coze 参数 OPERATION_GOAL。' })
  @IsString()
  operationGoal!: string;

  @ApiProperty({ example: '抖音', description: '平台名称，对应 Coze 参数 PLATFORM。' })
  @IsString()
  platform!: string;

  @ApiProperty({ example: '必须贴合投流/追投/放量/账户标签/主计划/千川/本地推等主题...', description: '自定义系统提示，对应 Coze 参数 CUSTOM_SYSTEM_PROMPT。' })
  @IsString()
  customSystemPrompt!: string;

  @ApiProperty({ example: '多一些老板视角、小白提问型和轻微质疑型评论...', description: '自定义用户提示，对应 Coze 参数 CUSTOM_USER_PROMPT。' })
  @IsString()
  customUserPrompt!: string;

  @ApiPropertyOptional({
    example: false,
    description: '是否基于上一次 Coze 会话上下文继续生成。true 时会尝试透传 conversation_id；false 或不传时默认新开对话。',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
      if (['false', '0', 'no', 'n', 'off', ''].includes(normalized)) return false;
    }
    return Boolean(value);
  })
  @IsBoolean()
  useConversationContext?: boolean;
}
