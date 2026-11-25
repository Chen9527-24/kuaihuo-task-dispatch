import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class DailyTaskQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: '演示任务', description: '按任务标题模糊搜索或精确匹配帖子编号。' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ example: 'cm9m3jhm30001abc123def456', description: '租户 ID。平台管理员可用于跨租户筛选。' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: 'DOUYIN', description: '媒体平台编码。' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ example: '29', description: '外部帖子 ID。适用于运营通过贴子编号快速定位任务。' })
  @IsOptional()
  @IsString()
  postId?: string;

  @ApiPropertyOptional({ example: 'RUNNING', description: '任务状态筛选，支持 DISABLED（已停用）。' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'group_id', description: '所属团长/任务归属分发组 ID。仅按任务归属筛选，不混入仅作为佣金接收方的团长。' })
  @IsOptional()
  @IsString()
  distributionGroupId?: string;

  @ApiPropertyOptional({ example: true, description: '是否只查看已标记为测试数据的任务。' })
  @Transform(({ value }) => {
    if (value === undefined || value === null || String(value).trim() === '') return undefined;
    const normalized = String(value).trim().toLowerCase();
    return value === true || normalized === 'true' || normalized === '1';
  })
  @IsOptional()
  @IsBoolean()
  isTestData?: boolean;

  @ApiPropertyOptional({ example: 'task_id_1,task_id_2', description: '仅供测试清理范围直达使用：按多个每日任务 ID 精确筛选，最多 100 条。' })
  @IsOptional()
  @IsString()
  @Length(1, 7000)
  ids?: string;

}
