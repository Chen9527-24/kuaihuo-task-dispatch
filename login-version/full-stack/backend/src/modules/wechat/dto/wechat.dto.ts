import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class WxMiniLoginDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 256)
  code!: string;
}

export class WxMiniPhoneDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 256)
  code!: string;
}

export class WxMiniProfileDto {
  @IsOptional()
  @IsString()
  @Length(0, 80)
  nickname?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  avatarUrl?: string;
}

export class WxacodeDto {
  @ApiPropertyOptional({ description: '直接传入小程序码 scene。优先级高于 tenantId/postId。' })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  scene?: string;

  @ApiPropertyOptional({ description: '租户 ID，兼容 PC 后台传参。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  tenantId?: string;

  @ApiPropertyOptional({ description: '租户 ID 兼容字段。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  tenantsId?: string;

  @ApiPropertyOptional({ description: '帖子/任务 ID。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  postId?: string;

  @ApiPropertyOptional({ description: '小程序跳转页面，如 pages/Home。' })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  page?: string;

  @ApiPropertyOptional({ enum: ['develop', 'trial', 'release'] })
  @IsOptional()
  @IsIn(['develop', 'trial', 'release'])
  envVersion?: 'develop' | 'trial' | 'release';

  @ApiPropertyOptional({ description: '是否校验 page 存在。' })
  @IsOptional()
  checkPath?: boolean;
}

export class WechatUrlDto {
  @IsOptional()
  @IsString()
  @Length(1, 128)
  path?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1024)
  query?: string;

  @IsOptional()
  @IsIn(['develop', 'trial', 'release'])
  envVersion?: 'develop' | 'trial' | 'release';

  @IsOptional()
  expireType?: number;

  @IsOptional()
  expireInterval?: number;

  @IsOptional()
  cloudBase?: Record<string, unknown>;
}
