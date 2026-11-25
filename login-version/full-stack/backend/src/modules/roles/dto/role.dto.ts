import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, Length } from 'class-validator';

export class CreateRoleDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ example: 'tenant_admin' })
  @IsString()
  @Length(2, 64)
  code!: string;

  @ApiProperty({ example: '租户管理员' })
  @IsString()
  @Length(2, 100)
  name!: string;

  @ApiPropertyOptional({ example: 'TENANT', enum: ['PLATFORM', 'TENANT'] })
  @IsOptional()
  @IsIn(['PLATFORM', 'TENANT'])
  scope?: string;

  @ApiPropertyOptional({ example: 'ENABLED', enum: ['ENABLED', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ENABLED', 'DISABLED'])
  status?: string;

  @ApiPropertyOptional({ example: '角色描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({ example: ['permission_id'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionIds?: string[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: '租户管理员' })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @ApiPropertyOptional({ example: 'TENANT', enum: ['PLATFORM', 'TENANT'] })
  @IsOptional()
  @IsIn(['PLATFORM', 'TENANT'])
  scope?: string;

  @ApiPropertyOptional({ example: 'ENABLED', enum: ['ENABLED', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ENABLED', 'DISABLED'])
  status?: string;

  @ApiPropertyOptional({ example: '角色描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({ example: ['permission_id'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionIds?: string[];
}

export class UpdateRoleStatusDto {
  @ApiProperty({ example: 'DISABLED', enum: ['ENABLED', 'DISABLED'] })
  @IsIn(['ENABLED', 'DISABLED'])
  status!: string;
}
