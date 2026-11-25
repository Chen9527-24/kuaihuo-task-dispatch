import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class CreateMediaAccountDto {
  @ApiPropertyOptional({ example: 'tenant_id', description: '可选；不传时优先使用 `X-Tenant-Id` 请求头中的当前租户。' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ example: 'DOUYIN' })
  @IsString()
  @Length(2, 32)
  platform!: string;

  @ApiProperty({ example: 'douyin_123456' })
  @IsString()
  @Length(1, 100)
  accountId!: string;

  @ApiProperty({ example: '花生牛奶8721' })
  @IsString()
  @Length(1, 100)
  accountName!: string;

  @ApiPropertyOptional({ example: 'ENABLED', enum: ['ENABLED', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ENABLED', 'DISABLED'])
  status?: string;

  @ApiPropertyOptional({ example: '本账号用于矩阵种草内容' })
  @IsOptional()
  @IsString()
  positioning?: string;

  @ApiPropertyOptional({ example: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateMediaAccountDto {
  @ApiPropertyOptional({ example: 'DOUYIN' })
  @IsOptional()
  @IsString()
  @Length(2, 32)
  platform?: string;

  @ApiPropertyOptional({ example: 'douyin_123456' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  accountId?: string;

  @ApiPropertyOptional({ example: '花生牛奶8721' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  accountName?: string;

  @ApiPropertyOptional({ example: 'ENABLED', enum: ['ENABLED', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ENABLED', 'DISABLED'])
  status?: string;

  @ApiPropertyOptional({ example: '本账号用于矩阵种草内容' })
  @IsOptional()
  @IsString()
  positioning?: string;

  @ApiPropertyOptional({ example: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateMediaAccountStatusDto {
  @ApiProperty({ example: 'DISABLED', enum: ['ENABLED', 'DISABLED'] })
  @IsIn(['ENABLED', 'DISABLED'])
  status!: string;
}
