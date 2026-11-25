import { request } from '@/api/core/http';
import { normalizeOptions, normalizePageResult, type PageResult, type SelectOption } from '@/utils/apiData';

export interface TenantItem {
  id: string;
  name: string;
  status: string;
  industry: string;
  productIntro: string;
  coreSellingPoint: string;
  startedAt: string;
  expiredAt: string;
  remark?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TenantQuery {
  keyword?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface TenantPayload {
  name: string;
  status?: string;
  industry: string;
  productIntro: string;
  coreSellingPoint: string;
  startedAt: string;
  expiredAt: string;
  remark?: string;
}

export async function listTenants(query: TenantQuery): Promise<PageResult<TenantItem>> {
  const payload = await request<unknown>({
    path: '/tenants',
    query
  });
  return normalizePageResult<TenantItem>(payload);
}

export async function getTenantDetail(id: string) {
  return request<unknown>({ path: `/tenants/${id}` });
}

export async function getTenantOptions(): Promise<SelectOption[]> {
  const payload = await request<unknown>({ path: '/tenants/options' });
  return normalizeOptions(payload);
}

export async function createTenant(payload: TenantPayload) {
  return request<unknown>({
    path: '/tenants',
    method: 'POST',
    body: payload
  });
}

export async function updateTenant(id: string, payload: Partial<TenantPayload>) {
  return request<unknown>({
    path: `/tenants/${id}`,
    method: 'PATCH',
    body: payload
  });
}

export async function updateTenantStatus(id: string, status: string) {
  return request<unknown>({
    path: `/tenants/${id}/status`,
    method: 'PATCH',
    body: { status }
  });
}

export async function removeTenant(id: string) {
  return request<unknown>({
    path: `/tenants/${id}`,
    method: 'DELETE'
  });
}
