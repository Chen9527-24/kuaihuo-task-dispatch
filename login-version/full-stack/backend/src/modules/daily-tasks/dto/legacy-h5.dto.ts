import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class LegacyTaskListQueryDto {
  @ApiPropertyOptional({ example: 'tenant-demo', description: '租户 ID 或租户编码。旧版 H5 实际多通过请求头 tenantsId 传递，这里保留为可选查询参数。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  tenantsId?: string;
}

export class LegacyTaskDetailParamDto {
  @ApiProperty({ example: '29', description: '旧版前端传入的帖子 ID。这里对应 DailyTask.postId。' })
  @IsString()
  @Length(1, 64)
  postId!: string;
}

export class LegacyClaimCommentDto {
  @ApiProperty({ example: 'tenant-demo', description: '租户 ID 或租户编码。旧版前端一般来自 URL 的 tenantsId。' })
  @IsString()
  @Length(1, 64)
  tenantsId!: string;

  @ApiProperty({ example: '29', description: '帖子 ID。旧版前端领取评论时传这个字段。' })
  @IsString()
  @Length(1, 64)
  postId!: string;

  @ApiProperty({ example: 'Qiu', description: '领取评论的人名。' })
  @IsString()
  @Length(1, 50)
  username!: string;
}

export class LegacyCompleteCommentQueryDto {
  @ApiProperty({ example: 'tenant-demo', description: '租户 ID 或租户编码。' })
  @IsString()
  @Length(1, 64)
  tenantsId!: string;

  @ApiProperty({ example: '29', description: '帖子 ID。' })
  @IsString()
  @Length(1, 64)
  postId!: string;

  @ApiProperty({ example: 'Qiu', description: '确认完成的人名。旧版前端字段名为 claimName。' })
  @IsString()
  @Length(1, 50)
  claimName!: string;

  @ApiProperty({ example: 'cm9q6n5e10001abc123def456', description: '领取评论时返回的 commentId。' })
  @IsString()
  @Length(1, 64)
  commentId!: string;
}
