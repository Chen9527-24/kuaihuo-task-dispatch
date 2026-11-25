import { BadRequestException } from '@nestjs/common';
import type { CurrentUserPayload } from '../types/current-user.type';

/** 平台级角色默认可跨租户访问数据，租户级角色只能访问自己的 tenantId。 */
export function isPlatformUser(user: Pick<CurrentUserPayload, 'roles'>) {
  return user.roles.includes('super_admin') || user.roles.includes('platform_admin') || user.roles.includes('admin');
}

/** 如果不是平台用户，则强制使用当前用户 tenantId。 */
export function resolveTenantId(user: CurrentUserPayload, requestedTenantId?: string | null) {
  if (isPlatformUser(user)) {
    return requestedTenantId || user.tenantId || undefined;
  }
  return user.tenantId || '__NO_TENANT__';
}

/** 只在平台角色有权跨租户查看或管理已有对象时使用；新建仍须明确业务租户。 */
export function resolveVisibleTenantId(user: CurrentUserPayload, requestedTenantId?: string | null) {
  return isPlatformUser(user) ? requestedTenantId || undefined : resolveTenantId(user);
}

/** 创建/写入类接口必须能解析出明确租户。 */
export function resolveRequiredTenantId(user: CurrentUserPayload, requestedTenantId?: string | null) {
  const tenantId = resolveTenantId(user, requestedTenantId);
  if (!tenantId || tenantId === '__NO_TENANT__') {
    throw new BadRequestException('tenantId is required');
  }
  return tenantId;
}
