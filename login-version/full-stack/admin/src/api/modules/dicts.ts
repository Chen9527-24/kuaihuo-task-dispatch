import { request } from '@/api/core/http';
import { normalizeOptionMap, normalizePageResult, type PageResult, type SelectOption } from '@/utils/apiData';

export interface DictTypeItem {
  id: string;
  code: string;
  name: string;
  status: string;
  remark?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface DictItem {
  id: string;
  typeCode: string;
  label: string;
  value: string;
  color?: string | null;
  sort?: number;
  status: string;
  remark?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface DictQuery {
  keyword?: string;
  status?: string;
  typeCode?: string;
  page?: number;
  pageSize?: number;
}

export async function getDictOptions(types: string[]) {
  const payload = await request<unknown>({
    path: '/dicts/options',
    query: { types: types.join(',') }
  });
  return normalizeOptionMap(payload);
}

export async function listDictTypes(query: DictQuery): Promise<PageResult<DictTypeItem>> {
  const payload = await request<unknown>({
    path: '/dicts/types',
    query
  });
  return normalizePageResult<DictTypeItem>(payload);
}

export async function createDictType(payload: Partial<DictTypeItem>) {
  return request<unknown>({
    path: '/dicts/types',
    method: 'POST',
    body: payload
  });
}

export async function updateDictType(id: string, payload: Partial<DictTypeItem>) {
  return request<unknown>({
    path: `/dicts/types/${id}`,
    method: 'PATCH',
    body: payload
  });
}

export async function removeDictType(id: string) {
  return request<unknown>({
    path: `/dicts/types/${id}`,
    method: 'DELETE'
  });
}

export async function listDictItems(query: DictQuery): Promise<PageResult<DictItem>> {
  const payload = await request<unknown>({
    path: '/dicts/items',
    query
  });
  return normalizePageResult<DictItem>(payload);
}

export async function createDictItem(payload: Partial<DictItem>) {
  return request<unknown>({
    path: '/dicts/items',
    method: 'POST',
    body: payload
  });
}

export async function updateDictItem(id: string, payload: Partial<DictItem>) {
  return request<unknown>({
    path: `/dicts/items/${id}`,
    method: 'PATCH',
    body: payload
  });
}

export async function removeDictItem(id: string) {
  return request<unknown>({
    path: `/dicts/items/${id}`,
    method: 'DELETE'
  });
}

export type DictOptionMap = Record<string, SelectOption[]>;
