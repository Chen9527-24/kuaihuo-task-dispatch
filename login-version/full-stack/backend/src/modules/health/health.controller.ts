import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

@ApiTags('系统健康')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '健康检查', description: '检查 API 服务、PostgreSQL 和 Redis 是否可用。' })
  @ApiOkResponse({ description: '服务正常' })
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    const redis = await this.redis.ping();

    return {
      ok: true,
      redis,
      time: new Date().toISOString(),
    };
  }
}
