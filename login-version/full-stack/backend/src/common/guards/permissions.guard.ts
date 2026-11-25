import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ANY_PERMISSIONS_KEY } from '../decorators/any-permissions.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const anyPermissions = this.reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions?.length && !anyPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { permissions?: string[] } | undefined;
    const grantedPermissions = user?.permissions ?? [];
    if (!grantedPermissions.length) {
      return false;
    }

    if (requiredPermissions?.length && !requiredPermissions.every((permission) => grantedPermissions.includes(permission))) {
      return false;
    }

    if (anyPermissions?.length && !anyPermissions.some((permission) => grantedPermissions.includes(permission))) {
      return false;
    }

    return true;
  }
}
