import { request } from '@/api/core/http';
import { normalizeList, normalizePageResult, type PageResult } from '@/utils/apiData';

export interface PermissionItem {
  id: string;
  parentId?: string | null;
  code: string;
  name: string;
  group?: string | null;
  type: 'DIRECTORY' | 'MENU' | 'BUTTON' | string;
  status: string;
  sort?: number;
  routePath?: string | null;
  component?: string | null;
  icon?: string | null;
  remark?: string | null;
  children?: PermissionItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PermissionQuery {
  keyword?: string;
  type?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface PermissionPayload {
  parentId?: string | null;
  code?: string;
  name: string;
  group?: string;
  type: string;
  status?: string;
  sort?: number;
  routePath?: string;
  component?: string;
  icon?: string;
  remark?: string;
}

export async function listPermissions(query: PermissionQuery): Promise<PageResult<PermissionItem>> {
  const payload = await request<unknown>({
    path: '/permissions',
    query
  });
  return normalizePageResult<PermissionItem>(payload);
}

export async function getPermissionTree(options?: { includeDisabled?: boolean }): Promise<PermissionItem[]> {
  const payload = await request<unknown>({ path: '/permissions/tree', query: options?.includeDisabled ? { includeDisabled: 'true' } : undefined });
  return normalizeList<PermissionItem>(payload);
}

export async function getPermissionDetail(id: string) {
  return request<unknown>({ path: `/permissions/${id}` });
}

export async function createPermission(payload: PermissionPayload) {
  return request<unknown>({
    path: '/permissions',
    method: 'POST',
    body: payload
  });
}

export async function updatePermission(id: string, payload: Partial<PermissionPayload>) {
  return request<unknown>({
    path: `/permissions/${id}`,
    method: 'PATCH',
    body: payload
  });
}

export async function updatePermissionStatus(id: string, status: string) {
  return request<unknown>({
    path: `/permissions/${id}/status`,
    method: 'PATCH',
    body: { status }
  });
}

export async function removePermission(id: string) {
  return request<unknown>({
    path: `/permissions/${id}`,
    method: 'DELETE'
  });
}
