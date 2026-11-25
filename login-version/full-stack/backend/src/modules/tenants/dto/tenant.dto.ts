import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsOptional, IsString, Length } from 'class-validator';

function normalizeTenantDateInput(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return value;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  const raw = String(value).trim();
  if (!raw) {
    return raw;
  }

  if (/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(raw)) {
    return `${raw.replace(/\//g, '-') }T00:00:00.000Z`;
  }

  if (/^\d{4}[-/]\d{2}[-/]\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    const normalized = raw.replace(/\//g, '-').replace(/\s+/, 'T');
    return normalized.length === 16 ? `${normalized}:00` : normalized;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return raw;
}

function normalizeOptionalTenantDateInput(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const raw = String(value).trim();
  if (!raw) {
    return undefined;
  }

  return normalizeTenantDateInput(raw);
}

export class CreateTenantDto {
  @ApiProperty({ example: '青锋科技' })
  @IsString()
  @Length(2, 100)
  name!: string;

  @ApiPropertyOptional({ example: 'ACTIVE', enum: ['ACTIVE', 'DISABLED', 'EXPIRED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED', 'EXPIRED'])
  status?: string;

  @ApiProperty({ example: '科技服务' })
  @IsString()
  @Length(1, 255)
  industry!: string;

  @ApiProperty({ example: '主营短视频运营服务' })
  @IsString()
  productIntro!: string;

  @ApiProperty({ example: '高性价比、交付速度快' })
  @IsString()
  coreSellingPoint!: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  @Transform(({ value }) => normalizeTenantDateInput(value))
  @IsDateString()
  startedAt!: string;

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00.000Z', description: '到期时间；传空表示永久有效。' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptionalTenantDateInput(value))
  @IsDateString()
  expiredAt?: string;

  @ApiPropertyOptional({ example: '内部备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateTenantDto {
  @ApiPropertyOptional({ example: '青锋科技' })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @ApiPropertyOptional({ example: 'ACTIVE', enum: ['ACTIVE', 'DISABLED', 'EXPIRED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED', 'EXPIRED'])
  status?: string;

  @ApiPropertyOptional({ example: '科技服务' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  industry?: string;

  @ApiPropertyOptional({ example: '主营短视频运营服务' })
  @IsOptional()
  @IsString()
  productIntro?: string;

  @ApiPropertyOptional({ example: '高性价比、交付速度快' })
  @IsOptional()
  @IsString()
  coreSellingPoint?: string;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @Transform(({ value }) => normalizeTenantDateInput(value))
  @IsDateString()
  startedAt?: string;

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00.000Z', description: '到期时间；传空表示永久有效。' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptionalTenantDateInput(value))
  @IsDateString()
  expiredAt?: string;

  @ApiPropertyOptional({ example: '内部备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateTenantStatusDto {
  @ApiProperty({ example: 'DISABLED', enum: ['ACTIVE', 'DISABLED', 'EXPIRED'] })
  @IsIn(['ACTIVE', 'DISABLED', 'EXPIRED'])
  status!: string;
}
