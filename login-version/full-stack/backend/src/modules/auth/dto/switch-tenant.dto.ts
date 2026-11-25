import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class SwitchTenantDto {
  @ApiProperty({ example: 'cm9m3jhm30001abc123def456', description: '目标租户 ID。' })
  @IsString()
  tenantId!: string;
}
