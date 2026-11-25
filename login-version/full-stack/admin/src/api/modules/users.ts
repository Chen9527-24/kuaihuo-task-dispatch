import { request } from '@/api/core/http';
import { normalizePageResult, type PageResult } from '@/utils/apiData';

export interface UserRoleBinding {
  role?: {
    id: string;
    code: string;
    name: string;
  };
  roleId?: string;
}

export interface UserItem {
  id: string;
  tenantId?: string | null;
  tenantIds?: string[] | null;
  tenant?: { id: string; name: string } | null;
  tenants?: Array<{ id?: string; tenantId?: string; name?: string; tenantName?: string }> | null;
  tenantName?: string | null;
  username: string;
  displayName: string;
  phone?: string | null;
  avatarUrl?: string | null;
  avatarFileId?: string | null;
  status: string;
  remark?: string | null;
  roles?: Array<string | UserRoleBinding>;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserQuery {
  keyword?: string;
  phone?: string;
  tenantId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface UserPayload {
  tenantId?: string;
  tenantIds?: string[];
  username?: string;
  displayName: string;
  phone?: string;
  password?: string;
  roleIds: string[];
  status?: string;
  avatarFileId?: string;
  remark?: string;
}

export interface UpdateMyProfilePayload {
  displayName: string;
  phone?: string;
  avatarUrl?: string;
}

export async function getMyProfile() {
  return request<unknown>({
    path: '/users/me'
  });
}

export async function updateMyProfile(payload: UpdateMyProfilePayload) {
  return request<unknown>({
    path: '/users/me',
    method: 'PATCH',
    body: payload
  });
}

export async function uploadMyAvatar(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return request<unknown>({
    path: '/users/me/avatar',
    method: 'POST',
    body: formData
  });
}

export async function listUsers(query: UserQuery): Promise<PageResult<UserItem>> {
  const payload = await request<unknown>({
    path: '/users',
    query
  });
  return normalizePageResult<UserItem>(payload);
}

export async function getUserDetail(id: string) {
  return request<unknown>({ path: `/users/${id}` });
}

export async function createUser(payload: UserPayload) {
  return request<unknown>({
    path: '/users',
    method: 'POST',
    body: payload
  });
}

export async function updateUser(id: string, payload: Partial<UserPayload>) {
  return request<unknown>({
    path: `/users/${id}`,
    method: 'PATCH',
    body: payload
  });
}

export async function updateUserStatus(id: string, status: string) {
  return request<unknown>({
    path: `/users/${id}/status`,
    method: 'PATCH',
    body: { status }
  });
}

export async function resetUserPassword(id: string, password: string) {
  return request<unknown>({
    path: `/users/${id}/reset-password`,
    method: 'POST',
    body: { password }
  });
}

export async function uploadUserAvatar(id: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return request<unknown>({
    path: `/users/${id}/avatar`,
    method: 'POST',
    body: formData
  });
}

export async function removeUser(id: string) {
  return request<unknown>({
    path: `/users/${id}`,
    method: 'DELETE'
  });
}
