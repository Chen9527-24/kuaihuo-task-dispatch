import { request } from '@/api/core/http';
import { normalizeOptions, normalizePageResult, type PageResult, type SelectOption } from '@/utils/apiData';

export interface RolePermissionBinding {
  permission?: {
    id: string;
    code: string;
    name: string;
  };
  permissionId?: string;
}

export interface RoleItem {
  id: string;
  tenantId?: string | null;
  code: string;
  name: string;
  scope: 'PLATFORM' | 'TENANT' | string;
  status: string;
  description?: string | null;
  remark?: string | null;
  permissions?: RolePermissionBinding[];
  createdAt?: string;
  updatedAt?: string;
}

export interface RoleQuery {
  keyword?: string;
  scope?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface RolePayload {
  tenantId?: string;
  code?: string;
  name: string;
  scope?: string;
  status?: string;
  description?: string;
  remark?: string;
  permissionIds?: string[];
}

export async function listRoles(query: RoleQuery): Promise<PageResult<RoleItem>> {
  const payload = await request<unknown>({
    path: '/roles',
    query
  });
  return normalizePageResult<RoleItem>(payload);
}

export async function getRoleDetail(id: string) {
  return request<unknown>({ path: `/roles/${id}` });
}

export async function getRoleOptions(): Promise<SelectOption[]> {
  const payload = await request<unknown>({ path: '/roles/options' });
  return normalizeOptions(payload);
}

export async function createRole(payload: RolePayload) {
  return request<unknown>({
    path: '/roles',
    method: 'POST',
    body: payload
  });
}

export async function updateRole(id: string, payload: RolePayload) {
  return request<unknown>({
    path: `/roles/${id}`,
    method: 'PATCH',
    body: payload
  });
}

export async function updateRoleStatus(id: string, status: string) {
  return request<unknown>({
    path: `/roles/${id}/status`,
    method: 'PATCH',
    body: { status }
  });
}

export async function removeRole(id: string) {
  return request<unknown>({
    path: `/roles/${id}`,
    method: 'DELETE'
  });
}
