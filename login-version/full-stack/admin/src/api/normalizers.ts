import type { AuthTenant, AuthUser } from '@/types/auth';
import { defaultAuthTenant, defaultAuthUser } from '@/types/auth';

interface AccessOverview {
  roles: string[];
  permissions: string[];
}

export interface DashboardHealthItem {
  key: string;
  label: string;
  value: string;
}

export interface DashboardFileItem {
  id: string;
  name: string;
  url: string;
  type: string;
  size: string;
  createdAt: string;
}

type UnknownRecord = Record<string, unknown>;

export interface AuthLoginResult {
  accessToken: string;
  refreshToken: string;
  userPayload?: unknown;
  tenants: AuthTenant[];
}

export function unwrapData<T = unknown>(payload: unknown): T {
  const record = asRecord(payload);
  if (!record) {
    return payload as T;
  }

  if (record.data != null) {
    return record.data as T;
  }

  if (record.result != null) {
    return record.result as T;
  }

  return payload as T;
}

export function normalizeAuthTokens(payload: unknown): { accessToken: string; refreshToken: string } {
  const source = asRecord(unwrapData(payload)) ?? asRecord(payload) ?? {};
  const accessToken = pickString(source, ['accessToken', 'token', 'access_token']);
  const refreshToken = pickString(source, ['refreshToken', 'refresh_token']);

  if (!accessToken) {
    throw new Error('登录成功，但接口没有返回 accessToken');
  }

  return {
    accessToken,
    refreshToken
  };
}

export function normalizeAuthLoginResult(payload: unknown): AuthLoginResult {
  const tokens = normalizeAuthTokens(payload);
  const data = asRecord(unwrapData(payload)) ?? asRecord(payload) ?? {};
  const userPayload = data.user ?? data.profile ?? data.currentUser;

  return {
    ...tokens,
    userPayload,
    tenants: normalizeAuthTenants(payload)
  };
}

export function normalizeAuthUser(profilePayload?: unknown, accessPayload?: unknown, current?: AuthUser): AuthUser {
  const profile = asRecord(unwrapData(profilePayload));
  const access = normalizeAccessOverview(accessPayload);
  const base = current ?? defaultAuthUser;

  const fallbackName = pickString(profile, ['displayName', 'nickname', 'name', 'username', 'account']) || base.name;
  const roles = dedupeStrings([
    ...extractNamedValues(profile?.roles),
    pickString(profile, ['role', 'roleName']),
    ...access.roles
  ]);
  const permissions = dedupeStrings([
    ...extractNamedValues(profile?.permissions),
    ...access.permissions
  ]);

  const avatarUrlCandidate = pickString(profile, ['avatarUrl', 'avatar', 'avatar_url']);
  const avatarUrl = isLikelyUrl(avatarUrlCandidate) ? avatarUrlCandidate : base.avatarUrl;
  const account = pickString(profile, ['username', 'account', 'userName', 'loginName']) || base.account;
  const name = fallbackName;
  const role = roles[0] || base.role;
  const email = pickString(profile, ['email', 'mail']) || base.email;
  const bio =
    pickString(profile, ['bio', 'description', 'intro']) ||
    (permissions.length ? `当前账号拥有 ${permissions.length} 项权限，可在个人中心查看权限详情。` : base.bio);

  return {
    id: pickString(profile, ['id', 'userId', 'sub']) || base.id,
    name,
    account,
    email,
    role,
    avatar: deriveAvatarText(name, account),
    avatarUrl,
    bio,
    roles,
    permissions
  };
}

export function normalizeAuthTenants(...payloads: unknown[]): AuthTenant[] {
  const result: AuthTenant[] = [];

  payloads.forEach((payload) => {
    collectAuthTenants(payload).forEach((tenant) => {
      if (!tenant.tenantId || result.some((item) => item.tenantId === tenant.tenantId)) {
        return;
      }
      result.push(tenant);
    });
  });

  return result.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

export function normalizeAccessOverview(payload: unknown): AccessOverview {
  const source = asRecord(unwrapData(payload));
  if (!source) {
    return { roles: [], permissions: [] };
  }

  return {
    roles: dedupeStrings([
      ...extractNamedValues(source.roles),
      ...extractNamedValues(source.roleList),
      pickString(source, ['role', 'roleName'])
    ]),
    permissions: dedupeStrings([
      ...extractNamedValues(source.permissions),
      ...extractNamedValues(source.permissionCodes),
      ...extractNamedValues(source.permissionList)
    ])
  };
}

export function normalizeHealthOverview(payload: unknown): DashboardHealthItem[] {
  const source = asRecord(unwrapData(payload));
  if (!source) {
    return [];
  }

  return Object.entries(source).map(([key, value]) => ({
    key,
    label: humanizeKey(key),
    value: formatValue(value)
  }));
}

export function normalizeFileItems(payload: unknown): DashboardFileItem[] {
  const unwrapped = unwrapData(payload);
  const list = Array.isArray(unwrapped)
    ? unwrapped
    : extractFirstArray(asRecord(unwrapped), ['items', 'list', 'records', 'files']);

  if (!Array.isArray(list)) {
    return [];
  }

  return list.map((item, index) => {
    const record = asRecord(item) ?? {};
    const name = pickString(record, ['name', 'originalName', 'fileName']) || `文件 ${index + 1}`;
    const url = pickString(record, ['url', 'fileUrl', 'path']);
    const type = pickString(record, ['mimeType', 'type', 'contentType']) || '--';
    const createdAt = pickString(record, ['createdAt', 'uploadTime', 'updatedAt']) || '--';
    const sizeValue = record.size ?? record.fileSize ?? record.bytes;

    return {
      id: pickString(record, ['id', '_id', 'key']) || `${name}-${index}`,
      name,
      url,
      type,
      size: formatFileSize(sizeValue),
      createdAt
    };
  });
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function pickString(record: UnknownRecord | null | undefined, keys: string[]): string {
  if (!record) {
    return '';
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function extractNamedValues(value: unknown): string[] {
  if (!value) {
    return [];
  }

  if (typeof value === 'string') {
    return value.trim() ? [value.trim()] : [];
  }

  if (!Array.isArray(value)) {
    const record = asRecord(value);
    if (!record) return [];
    return [pickString(record, ['name', 'code', 'value', 'label'])].filter(Boolean);
  }

  return value.flatMap((item) => {
    if (typeof item === 'string') {
      return item.trim() ? [item.trim()] : [];
    }

    const record = asRecord(item);
    if (!record) return [];
    return [pickString(record, ['name', 'code', 'value', 'label'])].filter(Boolean);
  });
}

function extractFirstArray(record: UnknownRecord | null, keys: string[]): unknown[] | null {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    if (Array.isArray(record[key])) {
      return record[key] as unknown[];
    }
  }

  return null;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function collectAuthTenants(payload: unknown): AuthTenant[] {
  const source = asRecord(unwrapData(payload)) ?? asRecord(payload);
  if (!source) {
    return [];
  }

  const candidates = [source.tenants, asRecord(source.user)?.tenants, asRecord(source.profile)?.tenants];
  return candidates.flatMap((value) => normalizeTenantArray(value));
}

function normalizeTenantArray(value: unknown): AuthTenant[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) {
        return null;
      }

      const tenantId = pickString(record, ['tenantId', 'id', 'value']);
      const tenantName = pickString(record, ['tenantName', 'name', 'label']);

      if (!tenantId || !tenantName) {
        return null;
      }

      return {
        ...defaultAuthTenant,
        membershipId: pickString(record, ['membershipId']),
        tenantId,
        tenantName,
        tenantCode: pickString(record, ['tenantCode', 'code']),
        isDefault: pickBoolean(record, ['isDefault', 'default'])
      };
    })
    .filter((item): item is AuthTenant => Boolean(item));
}

function deriveAvatarText(name: string, account: string): string {
  const source = name || account || 'U';
  return source.slice(0, 1).toUpperCase();
}

function pickBoolean(record: UnknownRecord | null | undefined, keys: string[]): boolean {
  if (!record) {
    return false;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
  }

  return false;
}

function isLikelyUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith('/');
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatValue(value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? '正常' : '异常';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'string') {
    return value || '--';
  }

  if (Array.isArray(value)) {
    return value.length ? value.map((item) => formatValue(item)).join(' / ') : '--';
  }

  if (value && typeof value === 'object') {
    const record = value as UnknownRecord;
    return (
      pickString(record, ['status', 'message', 'state', 'name']) ||
      Object.entries(record)
        .slice(0, 2)
        .map(([key, item]) => `${humanizeKey(key)}: ${formatValue(item)}`)
        .join(', ') ||
      '--'
    );
  }

  return '--';
}

function formatFileSize(value: unknown): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--';
  }

  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
