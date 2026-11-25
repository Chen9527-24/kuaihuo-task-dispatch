import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class AppUserQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: '1XXXXXXXXXX', description: '关键词，支持手机号、昵称、openid、unionid、任务账号、团长和邀请码模糊搜索。' })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  keyword?: string;

  @ApiPropertyOptional({ example: '1XXXXXXXXXX', description: '手机号精确或模糊搜索。' })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  phone?: string;

  @ApiPropertyOptional({ enum: ['ENABLED', 'DISABLED', 'RESTRICTED'] })
  @IsOptional()
  @IsIn(['ENABLED', 'DISABLED', 'RESTRICTED'])
  status?: 'ENABLED' | 'DISABLED' | 'RESTRICTED';

  @ApiPropertyOptional({ example: 'tenant-id', description: '平台管理员可按租户过滤；租户账号会被强制限制为当前租户。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  tenantId?: string;

  @ApiPropertyOptional({ example: 'distribution-group-id', description: '按团长分组筛选成员；仅返回该团长组的邀请码成员。' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  leaderGroupId?: string;

  @ApiPropertyOptional({ enum: ['true'], description: 'true 时仅返回通过成员邀请码加入团队的成员，并排除团长本人。管理端成员页固定传 true。' })
  @IsOptional()
  @IsIn(['true'])
  memberOnly?: 'true';

  @ApiPropertyOptional({ enum: ['WECHAT_MP', 'PHONE', 'ALL'], description: 'WECHAT_MP=服务号授权创建/登录；PHONE=手机号注册/登录；ALL=全部。' })
  @IsOptional()
  @IsIn(['WECHAT_MP', 'PHONE', 'ALL'])
  registerType?: 'WECHAT_MP' | 'PHONE' | 'ALL';

  @ApiPropertyOptional({ example: true, description: 'true=仅测试账号；false=仅正式账号；未传=全部。' })
  @Transform(({ value }) => {
    if (value === undefined || value === null || String(value).trim() === '') return undefined;
    const normalized = String(value).trim().toLowerCase();
    return value === true || normalized === 'true' || normalized === '1';
  })
  @IsOptional()
  @IsBoolean()
  isTestData?: boolean;

  @ApiPropertyOptional({ example: 'app_user_id_1,app_user_id_2', description: '仅供测试清理范围直达使用：按多个 H5 成员 ID 精确筛选，最多 100 条。' })
  @IsOptional()
  @IsString()
  @Length(1, 7000)
  ids?: string;

}
