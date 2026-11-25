import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class PresignFileDto {
  @ApiPropertyOptional({
    example: 'TASK_COVER',
    description: '上传场景，如 USER_AVATAR / TASK_COVER / TASK_CLAIM_PROOF / TASK_SETTLEMENT_PROOF',
  })
  @IsOptional()
  @IsString()
  @Length(2, 64)
  scene?: string;

  @ApiProperty({ example: 'cover.png', description: '原始文件名。用于生成 objectKey。' })
  @IsString()
  @Length(1, 255)
  fileName!: string;

  @ApiProperty({ example: 'image/png', description: '文件 MIME 类型。用于前置校验和上传头。' })
  @IsString()
  @Length(3, 120)
  mimeType!: string;

  @ApiProperty({ example: 328741, description: '文件大小（字节）。用于前置大小校验。' })
  @IsInt()
  @Min(1)
  @Max(20 * 1024 * 1024)
  size!: number;
}
