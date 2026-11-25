import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      passReqToCallback: true,
      secretOrKey: configService.getOrThrow<string>('auth.accessSecret'),
    });
  }

  async validate(request: Request, payload: { sub: string; tid?: string }) {
    /**
     * New access tokens carry a tenant id. Do not permit X-Tenant-Id to replace
     * that tenant context. The header fallback exists only for older tokens
     * already issued before this patch; UsersService still verifies membership.
     */
    const requestedTenantId = request.headers['x-tenant-id'];
    const headerTenantId = Array.isArray(requestedTenantId) ? requestedTenantId[0] : requestedTenantId;
    const tenantId = payload.tid || headerTenantId;
    return this.usersService.findSessionUserById(payload.sub, tenantId);
  }
}
