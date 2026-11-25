import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreatePermissionDto {
  @ApiPropertyOptional({ example: 'parent_permission_id' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiProperty({ example: 'daily-task:create' })
  @IsString()
  @Length(2, 100)
  code!: string;

  @ApiProperty({ example: '新增每日任务' })
  @IsString()
  @Length(2, 100)
  name!: string;

  @ApiPropertyOptional({ example: 'daily-task' })
  @IsOptional()
  @IsString()
  group?: string;

  @ApiProperty({ example: 'BUTTON', enum: ['DIRECTORY', 'MENU', 'BUTTON'] })
  @IsIn(['DIRECTORY', 'MENU', 'BUTTON'])
  type!: string;

  @ApiPropertyOptional({ example: 'ENABLED', enum: ['ENABLED', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ENABLED', 'DISABLED'])
  status?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sort?: number;

  @ApiPropertyOptional({ example: '/daily-tasks' })
  @IsOptional()
  @IsString()
  routePath?: string;

  @ApiPropertyOptional({ example: 'DailyTasksPage' })
  @IsOptional()
  @IsString()
  component?: string;

  @ApiPropertyOptional({ example: 'task' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ example: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdatePermissionDto {
  @ApiPropertyOptional({ example: 'parent_permission_id' })
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @ApiPropertyOptional({ example: '新增每日任务' })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @ApiPropertyOptional({ example: 'daily-task' })
  @IsOptional()
  @IsString()
  group?: string;

  @ApiPropertyOptional({ example: 'BUTTON', enum: ['DIRECTORY', 'MENU', 'BUTTON'] })
  @IsOptional()
  @IsIn(['DIRECTORY', 'MENU', 'BUTTON'])
  type?: string;

  @ApiPropertyOptional({ example: 'ENABLED', enum: ['ENABLED', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ENABLED', 'DISABLED'])
  status?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sort?: number;

  @ApiPropertyOptional({ example: '/daily-tasks' })
  @IsOptional()
  @IsString()
  routePath?: string;

  @ApiPropertyOptional({ example: 'DailyTasksPage' })
  @IsOptional()
  @IsString()
  component?: string;

  @ApiPropertyOptional({ example: 'task' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ example: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdatePermissionStatusDto {
  @ApiProperty({ example: 'DISABLED', enum: ['ENABLED', 'DISABLED'] })
  @IsIn(['ENABLED', 'DISABLED'])
  status!: string;
}
