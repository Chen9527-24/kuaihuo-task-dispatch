import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class RoleQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: '管理员' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ example: 'PLATFORM' })
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional({ example: 'ENABLED' })
  @IsOptional()
  @IsString()
  status?: string;
}
