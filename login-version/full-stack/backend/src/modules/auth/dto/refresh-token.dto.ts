import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  refreshToken!: string;

  @ApiPropertyOptional({
    description: '账号快速切换时恢复的最近租户。服务端只接受当前账号已绑定且启用的租户。',
    example: 'cm9m3jhm30001abc123def456',
  })
  @IsOptional()
  @IsString()
  tenantId?: string;
}
