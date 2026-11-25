import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateDictItemDto {
  @ApiProperty({ example: 'media_platform' })
  @IsString()
  @Length(2, 64)
  typeCode!: string;

  @ApiProperty({ example: '抖音' })
  @IsString()
  @Length(1, 100)
  label!: string;

  @ApiProperty({ example: 'DOUYIN' })
  @IsString()
  @Length(1, 64)
  value!: string;

  @ApiPropertyOptional({ example: 'blue' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sort?: number;

  @ApiPropertyOptional({ example: 'ENABLED', enum: ['ENABLED', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ENABLED', 'DISABLED'])
  status?: string;

  @ApiPropertyOptional({ example: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateDictItemDto {
  @ApiPropertyOptional({ example: '抖音' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  label?: string;

  @ApiPropertyOptional({ example: 'DOUYIN' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  value?: string;

  @ApiPropertyOptional({ example: 'blue' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sort?: number;

  @ApiPropertyOptional({ example: 'ENABLED', enum: ['ENABLED', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ENABLED', 'DISABLED'])
  status?: string;

  @ApiPropertyOptional({ example: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}
