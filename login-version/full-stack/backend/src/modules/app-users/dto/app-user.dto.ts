import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

export class UpdateAppUserStatusDto {
  @ApiProperty({ enum: ['ENABLED', 'DISABLED'] })
  @IsIn(['ENABLED', 'DISABLED'])
  status!: 'ENABLED' | 'DISABLED';
}


export class UpdateAppUserProfileDto {
  @ApiProperty({ example: '张三', description: '管理员修正 H5 用户姓名/昵称。' })
  @IsString()
  @Length(1, 80)
  nickname!: string;

  @ApiProperty({ example: '1XXXXXXXXXX', description: '管理员修正 H5 用户手机号。' })
  @IsString()
  @Length(11, 11)
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone!: string;
}




export class UpdateAppUserTaskAccountDto {
  @ApiProperty({ example: '示例成员', description: '任务账号昵称。' })
  @IsString()
  @Length(1, 80)
  nickname!: string;

  @ApiProperty({ example: '1XXXXXXXXXX', description: '任务账号手机号。' })
  @IsString()
  @Length(11, 11)
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone!: string;
}

export class ReleaseTaskAccountPhoneDto {
  @ApiProperty({ example: '1XXXXXXXXXX', description: '只释放该手机号对应的任务账号占用；不会批量处理其他手机号。' })
  @IsString()
  @Length(11, 11)
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone!: string;
}

export class UpdateAppUserTaskAccountStatusDto {
  @ApiProperty({ enum: ['ENABLED', 'DISABLED'], description: '任务账号状态。DISABLED 表示在 PC 后台停用该任务账号，不影响 H5 用户主体。' })
  @IsIn(['ENABLED', 'DISABLED'])
  status!: 'ENABLED' | 'DISABLED';
}

export class RestrictAppUserDto {
  @ApiProperty({ example: 7, description: '限制天数。' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;

  @ApiProperty({ example: '任务完成后删除评论，限制接单 7 天。' })
  @IsString()
  @Length(1, 255)
  reason!: string;

  @ApiPropertyOptional({ example: 'file_id', description: '限制证据截图文件 ID，可选。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  screenshotFileId?: string;
}

/**
 * 仅用于独立测试账号。标记后不会删除用户，也不会改变登录权限；
 * 但该账号的测试任务可以进入“强制清理测试范围”。
 */
export class MarkAppUserAsTestDataDto {
  @ApiProperty({ example: '测试成员A', description: '二次确认文本，必须与当前成员昵称、手机号或用户 ID 完全一致。' })
  @IsString()
  @Length(1, 128)
  confirmIdentity!: string;
}


/**
 * 批量标记独立测试账号。仅改变测试范围标记，不删除用户或改变登录权限。
 */
export class BatchMarkAppUsersAsTestDataDto {
  @ApiProperty({
    type: [String],
    example: ['app_user_id_1', 'app_user_id_2'],
    description: '需要标记的 H5 成员 ID，最多 100 条。',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Length(1, 64, { each: true })
  ids!: string[];

  @ApiProperty({
    example: '确认标记5个测试账号',
    description: '二次确认文本，必须与本次实际去重后的成员数量一致。',
  })
  @IsString()
  @Length(1, 64)
  confirmText!: string;
}
