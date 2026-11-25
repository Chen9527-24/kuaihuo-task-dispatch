import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class OperationLogQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'DAILY_TASK' })
  @IsOptional()
  @IsString()
  module?: string;

  @ApiPropertyOptional({ example: 'CREATE' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;
}
