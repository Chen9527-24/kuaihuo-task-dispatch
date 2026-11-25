import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class DictTypeQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'media' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ example: 'ENABLED' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class DictItemQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'media_platform' })
  @IsOptional()
  @IsString()
  typeCode?: string;

  @ApiPropertyOptional({ example: '抖音' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ example: 'ENABLED' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class DictOptionsQueryDto {
  @ApiPropertyOptional({ example: 'enabled_status,media_platform,daily_task_status' })
  @IsOptional()
  @IsString()
  types?: string;
}
