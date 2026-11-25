import { request } from '@/api/core/http';
import { normalizeOptions, normalizePageResult, type PageResult, type SelectOption } from '@/utils/apiData';

export interface MediaAccountItem {
  id: string;
  tenantId: string;
  tenant?: { id: string; name: string } | null;
  platform: string;
  accountId: string;
  accountName: string;
  status: string;
  positioning?: string | null;
  remark?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface MediaAccountQuery {
  keyword?: string;
  tenantId?: string;
  platform?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface MediaAccountPayload {
  tenantId?: string;
  platform: string;
  accountId: string;
  accountName: string;
  status?: string;
  positioning?: string;
  remark?: string;
}

export async function listMediaAccounts(query: MediaAccountQuery): Promise<PageResult<MediaAccountItem>> {
  const payload = await request<unknown>({
    path: '/media-accounts',
    query
  });
  return normalizePageResult<MediaAccountItem>(payload);
}

export async function getMediaAccountOptions(query?: Pick<MediaAccountQuery, 'tenantId' | 'platform'>): Promise<SelectOption[]> {
  const payload = await request<unknown>({
    path: '/media-accounts/options',
    query
  });
  return normalizeOptions(payload);
}

export async function getMediaAccountDetail(id: string) {
  return request<unknown>({ path: `/media-accounts/${id}` });
}

export async function createMediaAccount(payload: MediaAccountPayload) {
  return request<unknown>({
    path: '/media-accounts',
    method: 'POST',
    body: payload
  });
}

export async function updateMediaAccount(id: string, payload: MediaAccountPayload) {
  return request<unknown>({
    path: `/media-accounts/${id}`,
    method: 'PATCH',
    body: payload
  });
}

export async function updateMediaAccountStatus(id: string, status: string) {
  return request<unknown>({
    path: `/media-accounts/${id}/status`,
    method: 'PATCH',
    body: { status }
  });
}

export async function removeMediaAccount(id: string) {
  return request<unknown>({
    path: `/media-accounts/${id}`,
    method: 'DELETE'
  });
}
