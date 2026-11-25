import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class CreateDictTypeDto {
  @ApiProperty({ example: 'media_platform' })
  @IsString()
  @Length(2, 64)
  code!: string;

  @ApiProperty({ example: '多媒体平台' })
  @IsString()
  @Length(2, 100)
  name!: string;

  @ApiPropertyOptional({ example: 'ENABLED', enum: ['ENABLED', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ENABLED', 'DISABLED'])
  status?: string;

  @ApiPropertyOptional({ example: '平台下拉选项' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateDictTypeDto {
  @ApiPropertyOptional({ example: '多媒体平台' })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @ApiPropertyOptional({ example: 'ENABLED', enum: ['ENABLED', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ENABLED', 'DISABLED'])
  status?: string;

  @ApiPropertyOptional({ example: '平台下拉选项' })
  @IsOptional()
  @IsString()
  remark?: string;
}
