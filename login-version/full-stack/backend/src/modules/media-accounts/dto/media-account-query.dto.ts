import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class MediaAccountQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: '花生牛奶' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: 'DOUYIN' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ example: 'ENABLED' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class MediaAccountOptionsQueryDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: 'DOUYIN' })
  @IsOptional()
  @IsString()
  platform?: string;
}
