import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class UploadFileDto {
  @ApiPropertyOptional({
    example: 'TASK_CLAIM_PROOF',
    description: '上传场景，如 USER_AVATAR / TASK_COVER / TASK_CLAIM_PROOF / TASK_SETTLEMENT_PROOF',
  })
  @IsOptional()
  @IsString()
  @Length(2, 64)
  scene?: string;
}
