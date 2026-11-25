const fallbackApiBaseUrl = '/api/v1';
const fallbackDispatchBaseUrl = 'http://127.0.0.1:8782';

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? fallbackApiBaseUrl).trim() || fallbackApiBaseUrl;

export const dispatchBaseUrl =
  trimTrailingSlash(import.meta.env.VITE_DISPATCH_BASE_URL ?? fallbackDispatchBaseUrl) || fallbackDispatchBaseUrl;

/** Relative files are served through the same origin unless a separate file host is configured. */
export const assetBaseUrl = trimTrailingSlash((import.meta.env.VITE_ASSET_BASE_URL ?? '').trim());
