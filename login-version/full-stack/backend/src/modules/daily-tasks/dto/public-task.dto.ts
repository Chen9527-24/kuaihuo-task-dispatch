import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString, Length, Matches } from 'class-validator';

export class PublicTaskLinkQueryDto {
  @ApiProperty({ example: 'cm9m3jhm30001abc123def456', description: '链接中的 tenantsId。建议传租户 ID；若项目后续需要，也可扩展为租户编码。' })
  @IsString()
  @Length(1, 64)
  tenantsId!: string;

  @ApiProperty({ example: 'douyin', description: '链接中的 type。支持 douyin / wechat_video / xiaohongshu 等，后端会自动转成内部平台编码。' })
  @IsString()
  @Length(1, 32)
  type!: string;

  @ApiProperty({ example: '29', description: '链接中的 postId，用于匹配 DailyTask.postId。' })
  @IsString()
  @Length(1, 64)
  postId!: string;

  @ApiPropertyOptional({ example: 'YOUR_VISITOR_TOKEN', description: '前端本地持久化的访客令牌。传入后，后端会返回该访客当前步骤和已领取评论。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  visitorToken?: string;
}

export class PublicStartTaskDto {
  @ApiPropertyOptional({ example: 'YOUR_VISITOR_TOKEN', description: '已有访客令牌。前端首次进入可不传，后端会自动创建。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  visitorToken?: string;

  @ApiPropertyOptional({ example: 'H5', description: '访客来源端。建议 H5 传 H5，小程序传 MINI_PROGRAM。' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  sourcePlatform?: string;
}

export class PublicClaimCommentDto {
  @ApiPropertyOptional({ example: 'YOUR_VISITOR_TOKEN', description: '访客令牌。若此前调用过开始助推接口，应复用同一 token。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  visitorToken?: string;

  @ApiProperty({ example: 'Qiu', description: '领取评论的人名或昵称。H5 弹窗输入框中的值。' })
  @IsString()
  @Length(1, 50)
  visitorName!: string;

  @ApiProperty({ example: '1XXXXXXXXXX', description: '领取评论手机号。用于无账号模式下的订单绑定与统计。' })
  @IsString()
  @Length(6, 20)
  @Matches(/^[0-9+\-()\s]+$/, { message: 'phone format is invalid' })
  phone!: string;

  @ApiPropertyOptional({ example: 'H5', description: '访客来源端。建议 H5 传 H5，小程序传 MINI_PROGRAM。' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  sourcePlatform?: string;
}

export class PublicConfirmCompleteDto {
  @ApiProperty({ example: 'YOUR_VISITOR_TOKEN', description: '访客令牌。用于确认是哪位领取者完成了任务。' })
  @IsString()
  @Length(1, 64)
  visitorToken!: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['cm9m3q0re0002abc123def456', 'cm9m3q0re0003abc123def457'],
    description: '确认完成前上传好的证明图文件 ID 列表。支持多图，也兼容前端传单个字符串。',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (Array.isArray(value)) return value;
    return [value];
  })
  @IsArray()
  @ArrayMaxSize(9)
  @IsString({ each: true })
  @Length(1, 64, { each: true })
  proofFileIds?: string[];

  @ApiPropertyOptional({ example: 'cm9m3q0re0002abc123def456', description: '兼容旧前端的单个证明图文件 ID。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  proofFileId?: string;

  @ApiPropertyOptional({ example: 'cm9m3q0re0002abc123def456', description: '兼容 H5 旧字段的上传文件 ID。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  uploadedImageFileId?: string;

  @ApiPropertyOptional({ example: 'http://localhost:3000/uploads/demo.png', description: '兼容 H5 旧字段的上传图片地址。' })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  uploadedImageUrl?: string;

  @ApiPropertyOptional({ example: 'dy_123456', description: '用户自媒体账号 ID。OCR 不稳定时建议前端让用户手动填写，后端会随凭证一起保存并关联账号。' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  mediaAccountNo?: string;
}

export class TaskProgressCardDto {
  @ApiProperty({ example: 44, description: '目标评论数。' })
  targetCommentCount!: number;

  @ApiProperty({ example: 12, description: '已领取评论数（已领取 + 已完成）。' })
  claimedCommentCount!: number;

  @ApiProperty({ example: 12, description: '已完成评论数。' })
  completedCommentCount!: number;

  @ApiProperty({ example: 27.27, description: '完成进度百分比。计算规则为 completedCommentCount / targetCommentCount * 100。' })
  completionRate!: number;
}

export class TaskVisitorStateDto {
  @ApiPropertyOptional({ example: 'YOUR_VISITOR_TOKEN', description: '当前访客令牌。前端应本地持久化。' })
  visitorToken?: string | null;

  @ApiPropertyOptional({ example: 'Qiu', description: '当前访客名称。' })
  visitorName?: string | null;

  @ApiPropertyOptional({ example: '1XXXXXXXXXX', description: '当前访客手机号。' })
  phone?: string | null;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/uploads/task-proof-1.png', description: '领取时上传的截图 URL。' })
  uploadedImageUrl?: string | null;

  @ApiProperty({ type: [String], description: '当前访客已上传的任务证明图 URL 列表。未上传时为空数组。', example: ['https://cdn.example.com/uploads/task-proof-1.png'] })
  proofImageUrls!: string[];

  @ApiProperty({ example: 'CLAIMED', description: '访客状态：NOT_STARTED / STARTED / CLAIMED / COMPLETED。' })
  status!: string;

  @ApiProperty({ example: 'STEP_3_CONFIRM', description: '前端当前步骤建议值。可直接用于恢复页面状态。' })
  currentStep!: string;

  @ApiPropertyOptional({ example: 'cm9q6n5e10001abc123def456', description: '当前访客已领取的评论 ID。未领取时为空。' })
  currentCommentId?: string | null;

  @ApiPropertyOptional({ example: '这个视频讲得很自然，收藏了。', description: '当前访客已领取的评论内容。未领取时为空。' })
  currentCommentContent?: string | null;

  @ApiPropertyOptional({ example: '2026-03-18T19:45:00.000Z', description: '领取时间。' })
  claimedAt?: Date | null;

  @ApiPropertyOptional({ example: '2026-03-18T19:49:00.000Z', description: '确认完成时间。' })
  completedAt?: Date | null;
}

export class PublicTaskDetailResponseDto {
  @ApiProperty({ example: 'cm9pwyb5f0001abc123def456', description: '任务主键 ID。后续开始助推、领取评论、确认完成接口都使用它。' })
  id!: string;

  @ApiProperty({ example: '29', description: '对外帖子 ID。' })
  postId!: string;

  @ApiProperty({ example: 'DOUYIN', description: '内部平台编码。' })
  platform!: string;

  @ApiProperty({ example: '花生牛奶', description: '作者名称。' })
  authorName!: string;

  @ApiProperty({ example: '2026-03-18T19:43:33.000Z', description: '发布时间。' })
  publishedAt!: Date;

  @ApiProperty({ example: '国际尬唱251', description: '任务标题。' })
  title!: string;

  @ApiProperty({ example: 'https://api.example.com/?tenantsId=tenant-demo&type=douyin&postId=29', description: '视频/任务主链接。' })
  videoUrl!: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/uploads/task-cover-1.png', description: '封面图 URL。' })
  coverUrl?: string | null;

  @ApiPropertyOptional({ example: '【花生牛奶】最新视频，请大家在上方链接内打开视频，并领取评论发布！', description: '任务文案。' })
  copywriting?: string | null;

  @ApiProperty({ type: TaskProgressCardDto, description: '评论领取/完成进度卡片。' })
  progress!: TaskProgressCardDto;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'PC 配置的步骤 JSON。后端原样返回，前端自行渲染步骤说明、弹窗、按钮文案。',
    example: {
      steps: [
        { code: 'START_ASSIST', title: '第一步：开始助推', buttons: [{ code: 'START', text: '开始助推任务' }] },
        { code: 'CLAIM_COMMENT', title: '第二步：领取评论', buttons: [{ code: 'CLAIM', text: '领取评论' }] },
        { code: 'CONFIRM', title: '第三步：确认完成', buttons: [{ code: 'CONFIRM', text: '确认完成' }] },
      ],
    },
  })
  stepConfig!: Record<string, unknown>;

  @ApiProperty({ type: TaskVisitorStateDto, description: '当前访客状态。用于前端恢复操作步骤、展示已领取评论。' })
  visitor!: TaskVisitorStateDto;
}

export class PublicStartTaskResponseDto {
  @ApiProperty({ example: '29', description: '帖子 ID。' })
  postId!: string;

  @ApiProperty({ example: 'YOUR_VISITOR_TOKEN', description: '后端签发的访客令牌。前端需保存并在后续请求中带回。' })
  visitorToken!: string;

  @ApiProperty({ example: 'STARTED', description: '开始助推后的访客状态。' })
  status!: string;

  @ApiProperty({ example: 'STEP_2_CLAIM', description: '建议前端切换到的下一步骤。' })
  nextStep!: string;
}

export class PublicClaimCommentResponseDto {
  @ApiProperty({ example: '29', description: '帖子 ID。' })
  postId!: string;

  @ApiProperty({ example: 'cm9q6n5e10001abc123def456', description: '已锁定的评论 ID。' })
  commentId!: string;

  @ApiProperty({ example: '这个视频讲得很自然，收藏了。', description: '已领取的评论内容。前端可支持一键复制。' })
  commentContent!: string;

  @ApiProperty({ example: 'Qiu', description: '领取人姓名。' })
  visitorName!: string;

  @ApiProperty({ example: '1XXXXXXXXXX', description: '领取人手机号。' })
  phone!: string;

  @ApiPropertyOptional({ example: null, description: '兼容旧字段。领取评论阶段不再要求上传截图。' })
  uploadedImageUrl?: string | null;

  @ApiProperty({ example: 'YOUR_VISITOR_TOKEN', description: '访客令牌。' })
  visitorToken!: string;

  @ApiProperty({ example: 'STEP_3_CONFIRM', description: '领取成功后建议进入的下一步骤。' })
  nextStep!: string;

  @ApiProperty({ type: TaskProgressCardDto, description: '领取后刷新过的进度数据。' })
  progress!: TaskProgressCardDto;
}

export class PublicConfirmCompleteResponseDto {
  @ApiProperty({ example: '29', description: '帖子 ID。' })
  postId!: string;

  @ApiProperty({ example: 'cm9q6n5e10001abc123def456', description: '已完成的评论 ID。' })
  commentId!: string;

  @ApiProperty({ example: 'COMPLETED', description: '访客最终状态。' })
  status!: string;

  @ApiProperty({ example: 'DONE', description: '前端完成页步骤标识。' })
  nextStep!: string;

  @ApiProperty({ type: [String], description: '确认完成时提交并绑定成功的证明图 URL 列表。', example: ['https://cdn.example.com/uploads/task-proof-1.png'] })
  proofImageUrls!: string[];

  @ApiProperty({ type: TaskProgressCardDto, description: '确认完成后刷新过的进度数据。' })
  progress!: TaskProgressCardDto;
}
