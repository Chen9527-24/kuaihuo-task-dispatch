import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { randomUUID } from 'crypto';
import { RedisService } from '../../redis/redis.service';
import { UsersService, type SafeUser } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async validateUser(username: string, password: string) {
    const user = await this.usersService.findAuthUserByUsername(username);
    if (!user || user.status !== 'ENABLED') {
      throw new UnauthorizedException('Invalid username or password');
    }

    const valid = await compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid username or password');
    }

    return this.usersService.findSessionUserById(user.id);
  }

  /**
   * Issue one tenant-bound access token and one rotating refresh session.
   *
   * The tenant id is intentionally embedded in the access token. Requests must
   * not be able to switch tenant context merely by changing X-Tenant-Id.
   */
  async login(user: SafeUser) {
    if (!user.tenantId) {
      throw new UnauthorizedException('当前账号没有可用租户');
    }

    const sessionId = randomUUID();
    const accessTokenExpiresIn = this.configService.getOrThrow<string>('auth.accessExpiresIn');
    const refreshTokenExpiresIn = this.configService.getOrThrow<string>('auth.refreshExpiresIn');
    const accessSecret = this.configService.getOrThrow<string>('auth.accessSecret');
    const refreshSecret = this.configService.getOrThrow<string>('auth.refreshSecret');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        {
          sub: user.id,
          sid: sessionId,
          tid: user.tenantId,
          username: user.username,
          roles: user.roles,
          permissions: user.permissions,
        },
        { secret: accessSecret, expiresIn: accessTokenExpiresIn as never },
      ),
      this.jwtService.signAsync(
        { sub: user.id, sid: sessionId, type: 'refresh' },
        { secret: refreshSecret, expiresIn: refreshTokenExpiresIn as never },
      ),
    ]);

    const accessTokenExpiresInSeconds = this.parseToSeconds(accessTokenExpiresIn);
    const refreshTokenExpiresInSeconds = this.parseToSeconds(refreshTokenExpiresIn);
    const now = Date.now();
    const accessTokenExpiresAt = new Date(now + accessTokenExpiresInSeconds * 1000).toISOString();
    const refreshTokenExpiresAt = new Date(now + refreshTokenExpiresInSeconds * 1000).toISOString();

    await this.redisService.set(`auth:refresh:${sessionId}`, user.id, refreshTokenExpiresInSeconds);

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn,
      refreshTokenExpiresIn,
      accessTokenExpiresInSeconds,
      refreshTokenExpiresInSeconds,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      user,
    };
  }

  /**
   * Refresh sessions are intentionally allowed to select another tenant only
   * when that tenant is still an enabled membership of the same account.
   * The selected tenant comes from the request body rather than a mutable
   * request header, and is validated by UsersService before a new token issues.
   */
  async refresh(refreshToken: string, requestedTenantId?: string | null) {
    try {
      const refreshSecret = this.configService.getOrThrow<string>('auth.refreshSecret');
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        sid: string;
        type: string;
      }>(refreshToken, { secret: refreshSecret });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const cacheUserId = await this.redisService.get(`auth:refresh:${payload.sid}`);
      if (!cacheUserId || cacheUserId !== payload.sub) {
        throw new UnauthorizedException('Refresh token expired');
      }

      // Validate the requested tenant before consuming the refresh token.
      // If an old saved tenant was removed, the same device session can still
      // fall back to the account's remaining valid tenants and ask the user.
      const user = await this.usersService.findSessionUserById(payload.sub, requestedTenantId);
      // Rotation: a copied refresh token cannot be replayed after one success.
      await this.redisService.del(`auth:refresh:${payload.sid}`);
      return this.login(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async switchTenant(userId: string, tenantId: string) {
    const user = await this.usersService.findSessionUserById(userId, tenantId);
    return this.login(user);
  }

  async logout(refreshToken: string) {
    try {
      const refreshSecret = this.configService.getOrThrow<string>('auth.refreshSecret');
      const payload = await this.jwtService.verifyAsync<{ sid: string }>(refreshToken, {
        secret: refreshSecret,
      });
      await this.redisService.del(`auth:refresh:${payload.sid}`);
    } catch {
      // Logout is intentionally idempotent. A stale/rotated token is already logged out.
      return;
    }
  }

  private parseToSeconds(value: string) {
    const match = value.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 7 * 24 * 60 * 60;
    }

    const amount = Number(match[1]);
    const unit = match[2];
    const map: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };

    return amount * map[unit];
  }
}
