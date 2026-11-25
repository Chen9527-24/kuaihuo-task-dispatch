import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, Length } from 'class-validator';

export class CreateUserDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: ['tenant_id_a', 'tenant_id_b'], description: '用户可切换的租户列表；首个租户会作为默认租户。' })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  tenantIds?: string[];

  @ApiProperty({ example: 'example-operator' })
  @IsString()
  @Length(3, 32)
  username!: string;

  @ApiProperty({ example: '示例管理员' })
  @IsString()
  @Length(2, 50)
  displayName!: string;

  @ApiPropertyOptional({ example: '1XXXXXXXXXX' })
  @IsOptional()
  @IsString()
  @Length(6, 20)
  phone?: string;

  @ApiProperty({ example: 'YOUR_ADMIN_PASSWORD' })
  @IsString()
  @Length(6, 32)
  password!: string;

  @ApiProperty({ example: ['role_id'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleIds!: string[];

  @ApiPropertyOptional({ example: 'ENABLED', enum: ['ENABLED', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ENABLED', 'DISABLED'])
  status?: string;

  @ApiPropertyOptional({ example: 'file_id' })
  @IsOptional()
  @IsString()
  avatarFileId?: string;

  @ApiPropertyOptional({ example: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: ['tenant_id_a', 'tenant_id_b'], description: '更新用户可切换的租户列表；首个租户会作为默认租户。' })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  tenantIds?: string[];

  @ApiPropertyOptional({ example: '示例管理员' })
  @IsOptional()
  @IsString()
  @Length(2, 50)
  displayName?: string;

  @ApiPropertyOptional({ example: '1XXXXXXXXXX' })
  @IsOptional()
  @IsString()
  @Length(6, 20)
  phone?: string;

  @ApiPropertyOptional({ example: ['role_id'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];

  @ApiPropertyOptional({ example: 'ENABLED', enum: ['ENABLED', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ENABLED', 'DISABLED'])
  status?: string;

  @ApiPropertyOptional({ example: 'file_id' })
  @IsOptional()
  @IsString()
  avatarFileId?: string;

  @ApiPropertyOptional({ example: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateUserStatusDto {
  @ApiProperty({ example: 'DISABLED', enum: ['ENABLED', 'DISABLED'] })
  @IsIn(['ENABLED', 'DISABLED'])
  status!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'YOUR_NEW_ADMIN_PASSWORD' })
  @IsString()
  @Length(6, 32)
  password!: string;
}
