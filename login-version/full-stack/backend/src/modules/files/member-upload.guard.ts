import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class MemberUploadGuard implements CanActivate {
  constructor(private readonly redis: RedisService, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request & { memberId: string }>();
    const token = /^Bearer (\S+)$/i.exec(request.headers.authorization || '')?.[1];
    const session = token && await this.redis.get(`distribution:session:${token}`);
    if (!session) throw new UnauthorizedException('请先登录成员账号');
    const { appUserId } = JSON.parse(session);
    const member = await this.prisma.appUser.findFirst({
      where: { id: appUserId, deletedAt: null, status: { not: 'DISABLED' } }, select: { id: true },
    });
    if (!member) throw new UnauthorizedException('成员身份已失效');
    request.memberId = member.id;
    return true;
  }
}
