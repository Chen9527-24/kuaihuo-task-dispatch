import { request } from '@/api/core/http';
import { normalizeAuthLoginResult } from '@/api/normalizers';

export interface LoginParams {
  username: string;
  password: string;
}

export interface RefreshTokenParams {
  refreshToken: string;
  /** Account-switch restoration uses the account's own last successful tenant. */
  tenantId?: string;
}

export interface SwitchTenantParams {
  tenantId: string;
}

export async function login(params: LoginParams) {
  const payload = await request<unknown>({
    path: '/auth/login',
    method: 'POST',
    body: params,
    skipAuth: true
  });

  return normalizeAuthLoginResult(payload);
}

export async function switchTenant(params: SwitchTenantParams) {
  const payload = await request<unknown>({
    path: '/auth/switch-tenant',
    method: 'POST',
    body: params
  });

  return normalizeAuthLoginResult(payload);
}

export async function refreshLoginToken(params: RefreshTokenParams) {
  const payload = await request<unknown>({
    path: '/auth/refresh',
    method: 'POST',
    body: params,
    skipAuth: true,
    skipGlobalError: true
  });

  return normalizeAuthLoginResult(payload);
}

export async function logout(params: RefreshTokenParams) {
  return request<unknown>({
    path: '/auth/logout',
    method: 'POST',
    body: params,
    // Logout validates the refresh token itself. Do not let a stale saved
    // session invalidate the currently active account.
    skipAuth: true,
    skipGlobalError: true
  });
}

export async function getCurrentUser() {
  return request<unknown>({
    path: '/auth/me'
  });
}
