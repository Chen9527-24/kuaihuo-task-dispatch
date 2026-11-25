export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

const MIN_PAGE_SIZE = 10;

export interface SelectOption {
  label: string;
  value: string;
  color?: string | null;
  disabled?: boolean;
  remark?: string | null;
  [key: string]: unknown;
}

export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function unwrapData<T = unknown>(payload: unknown): T {
  if (!isRecord(payload)) return payload as T;
  if ('data' in payload) return payload.data as T;
  if ('result' in payload) return payload.result as T;
  return payload as T;
}

export function normalizePageResult<T>(payload: unknown): PageResult<T> {
  // 兼容两类分页响应：
  // 1) { data: [...], page, pageSize, total }
  // 2) { data: { items: [...], page, pageSize, total } }
  // 原逻辑会先 unwrapData，导致第 1 类响应只剩 data 数组，total 被错误回退为本页条数。
  const source = resolvePageSource(payload);

  if (Array.isArray(source)) {
    return {
      items: source as T[],
      total: source.length,
      page: 1,
      pageSize: MIN_PAGE_SIZE
    };
  }

  const record = isRecord(source) ? source : {};
  const items = pickArray<T>(record, ['items', 'records', 'list', 'rows', 'data']);
  const total = pickNumber(record, ['total', 'count', 'totalCount'], items.length);
  const page = pickNumber(record, ['page', 'current', 'currentPage'], 1);
  const pageSize = Math.max(MIN_PAGE_SIZE, pickNumber(record, ['pageSize', 'size', 'limit'], MIN_PAGE_SIZE));

  return { items, total, page, pageSize };
}

function resolvePageSource(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;

  const hasRootList = ['items', 'records', 'list', 'rows', 'data'].some((key) => Array.isArray(payload[key]));
  const hasRootPageMeta = ['total', 'count', 'totalCount', 'page', 'current', 'currentPage', 'pageSize', 'size', 'limit'].some(
    (key) => payload[key] !== undefined
  );

  if (hasRootList && hasRootPageMeta) return payload;

  return unwrapData(payload);
}

export function normalizeList<T>(payload: unknown): T[] {
  return normalizePageResult<T>(payload).items;
}

export function normalizeOptionMap(payload: unknown): Record<string, SelectOption[]> {
  const source = unwrapData(payload);
  if (!isRecord(source)) return {};

  return Object.entries(source).reduce<Record<string, SelectOption[]>>((acc, [key, value]) => {
    acc[key] = normalizeOptions(value);
    return acc;
  }, {});
}

export function normalizeOptions(payload: unknown): SelectOption[] {
  const source = unwrapData(payload);
  const list = Array.isArray(source)
    ? source
    : isRecord(source)
      ? pickArray(source, ['items', 'records', 'list', 'rows', 'data'])
      : [];

  return list
    .map((item) => {
      if (typeof item === 'string') {
        return { label: item, value: item };
      }
      if (!isRecord(item)) return null;

      const value = pickString(item, ['value', 'id', 'code', 'key']);
      const label = pickString(item, ['label', 'name', 'title', 'displayName', 'accountName', 'username']) || value;

      if (!value && !label) return null;
      return {
        ...item,
        label,
        value,
        color: pickOptionalString(item, ['color']),
        disabled: item.disabled === true || pickString(item, ['status']) === 'DISABLED',
        remark: pickOptionalString(item, ['remark'])
      } as SelectOption;
    })
    .filter((item): item is SelectOption => Boolean(item));
}

export function pickArray<T = unknown>(record: UnknownRecord, keys: string[]): T[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value as T[];
  }
  return [];
}

export function pickString(record: UnknownRecord | null | undefined, keys: string[], fallback = ''): string {
  if (!record) return fallback;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return fallback;
}

export function pickOptionalString(record: UnknownRecord | null | undefined, keys: string[]): string | null {
  const value = pickString(record, keys);
  return value || null;
}

export function pickNumber(record: UnknownRecord | null | undefined, keys: string[], fallback = 0): number {
  if (!record) return fallback;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return fallback;
}

export function toNullable(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim() : value;
  return normalized || undefined;
}

export function omitEmpty<T extends object>(data: T): Partial<T> {
  return Object.entries(data).reduce<Partial<T>>((acc, [key, value]) => {
    if (value === '' || value == null) return acc;
    if (Array.isArray(value) && value.length === 0) return acc;
    acc[key as keyof T] = value as T[keyof T];
    return acc;
  }, {});
}
