import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class PermissionQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: '每日任务' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ example: 'MENU' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: 'ENABLED' })
  @IsOptional()
  @IsString()
  status?: string;
}
