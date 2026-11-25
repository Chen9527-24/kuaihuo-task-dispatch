import { ElLoading, ElMessage } from 'element-plus';
import { apiBaseUrl } from '@/config/env';
import { AUTH_STORAGE_KEY } from '@/constants/storage';
import { markCachedViewDataMutation } from '@/runtime/dataFreshness';

let memoryToken = '';
let memoryTenantId = '';
let memoryAuthContextVersion = 0;
let unauthorizedHandler: (() => void | Promise<void>) | null = null;
let unauthorizedHandlingTask: Promise<void> | null = null;
let pendingRequestCount = 0;
let globalLoadingTimer: number | null = null;
let globalLoadingInstance: ReturnType<typeof ElLoading.service> | null = null;
const GLOBAL_LOADING_DELAY_MS = 180;

export interface RequestOptions {
  path: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  query?: object;
  body?: BodyInit | object | null;
  headers?: HeadersInit;
  skipAuth?: boolean;
  signal?: AbortSignal;
  /** 不显示全局接口 loading，适用于明确由组件局部 loading 承接的请求。 */
  skipGlobalLoading?: boolean;
  /** 不弹出全局接口错误提示，适用于调用方自行处理错误文案的请求。 */
  skipGlobalError?: boolean;
  /** 覆盖默认 API 版本；未设置时保持现有 /api/v1 行为。 */
  apiVersion?: number;
  /**
   * 非 GET 成功请求默认会让 keep-alive 管理页在下次进入时重新取数。
   * 仅对明确不会改变任何可见管理数据的临时调用设置为 false。
   */
  affectsCachedViews?: boolean;
}

export class ApiError extends Error {
  status: number;
  payload: unknown;
  notified = false;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

/** A response from the account/tenant context that was active before a switch. */
export class StaleAuthContextError extends Error {
  constructor() {
    super('');
    this.name = 'StaleAuthContextError';
  }
}

export function isStaleAuthContextError(error: unknown): error is StaleAuthContextError {
  return error instanceof StaleAuthContextError;
}

export async function request<T>(options: RequestOptions): Promise<T> {
  const requestContextVersion = memoryAuthContextVersion;
  startGlobalLoading(options);
  try {
    const headers = new Headers(options.headers);
    const body = normalizeBody(options.body, headers);
    const token = options.skipAuth ? '' : readAuthToken();
    const tenantId = options.skipAuth ? '' : readTenantId();

    headers.set('Accept', 'application/json');
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (tenantId && !headers.has('X-Tenant-Id')) {
      headers.set('X-Tenant-Id', tenantId);
    }

    const response = await fetch(buildRequestUrl(options.path, options.query, options.apiVersion), {
      method: options.method ?? 'GET',
      headers,
      body,
      signal: options.signal,
      cache: 'no-store'
    });

    const payload = await parseResponsePayload(response);
    if (requestContextVersion !== memoryAuthContextVersion) {
      throw new StaleAuthContextError();
    }

    if (!response.ok) {
      // A failed refresh / remembered-account probe must not log out the active account.
      if (response.status === 401 && !options.skipAuth) {
        triggerUnauthorizedHandler();
      }
      throw new ApiError(resolveErrorMessage(response.status, payload), response.status, payload);
    }

    const method = options.method ?? 'GET';
    if (method !== 'GET' && options.affectsCachedViews !== false) {
      markCachedViewDataMutation();
    }

    return payload as T;
  } catch (error) {
    if (!isStaleAuthContextError(error)) {
      notifyRequestError(error, options);
    }
    throw error;
  } finally {
    stopGlobalLoading(options);
  }
}

export function getRequestErrorMessage(error: unknown): string {
  if (isStaleAuthContextError(error)) return '';
  return resolveCaughtErrorMessage(error);
}

export function setAuthToken(token: string) {
  memoryToken = token.trim();
}

export function setTenantId(tenantId: string) {
  memoryTenantId = tenantId.trim();
}

/**
 * Bumps the request context whenever account or tenant changes. Late responses
 * from the former context are discarded before any page can consume them.
 */
export function setAuthContextVersion(version: number) {
  memoryAuthContextVersion = Number.isFinite(version) ? Math.max(0, Math.trunc(version)) : 0;
}

export function clearAuthToken() {
  memoryToken = '';
  memoryTenantId = '';
}

export function setUnauthorizedHandler(handler: (() => void | Promise<void>) | null) {
  unauthorizedHandler = handler;
}

function startGlobalLoading(options: RequestOptions) {
  if (options.skipGlobalLoading) return;
  pendingRequestCount += 1;
  if (globalLoadingInstance || globalLoadingTimer) return;
  globalLoadingTimer = window.setTimeout(() => {
    globalLoadingTimer = null;
    if (pendingRequestCount <= 0) return;
    globalLoadingInstance = ElLoading.service({
      lock: true,
      text: '请求处理中...',
      background: 'rgba(255, 255, 255, 0.48)'
    });
  }, GLOBAL_LOADING_DELAY_MS);
}

function stopGlobalLoading(options: RequestOptions) {
  if (options.skipGlobalLoading) return;
  pendingRequestCount = Math.max(0, pendingRequestCount - 1);
  if (pendingRequestCount > 0) return;
  if (globalLoadingTimer) {
    window.clearTimeout(globalLoadingTimer);
    globalLoadingTimer = null;
  }
  if (globalLoadingInstance) {
    globalLoadingInstance.close();
    globalLoadingInstance = null;
  }
}

function notifyRequestError(error: unknown, options: RequestOptions) {
  if (options.skipGlobalError || isStaleAuthContextError(error)) return;
  const message = error instanceof ApiError ? error.message : resolveCaughtErrorMessage(error);
  if (!message) return;
  if (error instanceof ApiError) error.notified = true;
  ElMessage.error(message);
}

function resolveCaughtErrorMessage(error: unknown): string {
  if (isStaleAuthContextError(error)) return '';
  if (error instanceof ApiError) return error.notified ? '' : error.message;
  if (error instanceof TypeError && /fetch/i.test(error.message)) return '网络异常或后端服务不可用，请稍后重试';
  if (error instanceof Error) return error.message || '请求失败，请稍后重试';
  return '';
}

function normalizeBody(body: RequestOptions['body'], headers: Headers): BodyInit | undefined {
  if (body == null) {
    return undefined;
  }

  if (body instanceof FormData || body instanceof URLSearchParams || typeof body === 'string') {
    return body;
  }

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return JSON.stringify(body);
}

function buildRequestUrl(path: string, query?: RequestOptions['query'], apiVersion?: number): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const configuredBaseUrl = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  const baseUrl = apiVersion ? replaceApiVersion(configuredBaseUrl, apiVersion) : configuredBaseUrl;
  const url = `${baseUrl}${normalizedPath}`;

  if (!query || !Object.keys(query).length) {
    return url;
  }

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === '') continue;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item != null && item !== '') searchParams.append(key, String(item));
      });
      continue;
    }
    searchParams.set(key, String(value));
  }

  const queryString = searchParams.toString();
  return queryString ? `${url}?${queryString}` : url;
}


function replaceApiVersion(baseUrl: string, apiVersion: number): string {
  const normalizedVersion = Math.max(1, Math.trunc(apiVersion));
  if (/\/v\d+$/.test(baseUrl)) {
    return baseUrl.replace(/\/v\d+$/, `/v${normalizedVersion}`);
  }
  return `${baseUrl}/v${normalizedVersion}`;
}

async function parseResponsePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text ? { message: text } : null;
}

function resolveErrorMessage(status: number, payload: unknown): string {
  const message = pickErrorMessage(payload);
  if (message) return message;

  if (status === 401) return '登录状态已失效，请重新登录';
  if (status === 403) return '当前账号没有权限执行该操作';
  if (status === 404) return '请求的资源不存在或已被删除';
  if (status === 409) return '数据状态已变化，请刷新后重试';
  if (status === 422) return '提交数据校验失败，请检查后重试';
  if (status >= 500) return '后端服务异常，请稍后重试';
  return '请求失败，请检查接口配置或稍后重试';
}

function pickErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  for (const key of ['message', 'msg', 'error', 'detail']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value) && value.length) return value.map((item) => String(item)).filter(Boolean).join('；');
  }
  if (record.data && typeof record.data === 'object') {
    return pickErrorMessage(record.data);
  }
  return '';
}

function readStoredToken(): string {
  if (typeof localStorage === 'undefined') {
    return '';
  }

  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { token?: unknown };
    return typeof parsed.token === 'string' ? parsed.token : '';
  } catch {
    return '';
  }
}

function readAuthToken(): string {
  return memoryToken || readStoredToken();
}

function readTenantId(): string {
  return memoryTenantId;
}

function triggerUnauthorizedHandler() {
  if (!unauthorizedHandler || unauthorizedHandlingTask) {
    return;
  }

  unauthorizedHandlingTask = Promise.resolve(unauthorizedHandler())
    .catch(() => {
      // 忽略401处理链路中的异常，避免覆盖原始请求错误
    })
    .finally(() => {
      unauthorizedHandlingTask = null;
    });
}
