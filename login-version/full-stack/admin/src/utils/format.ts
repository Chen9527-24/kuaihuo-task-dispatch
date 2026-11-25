import { assetBaseUrl } from '@/config/env';

export function formatDateTime(value: unknown): string {
  if (!value) return '--';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', { hour12: false });
}

export function formatDate(value: unknown): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
}

export function toIsoDateTime(value?: string | Date | null): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function formatFileSize(value: unknown): string {
  const size = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(size) || size < 0) return '--';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function resolveAssetUrl(url?: string | null): string {
  if (!url) return '';
  const normalizedUrl = String(url).trim();
  if (!normalizedUrl) return '';
  if (/^https?:\/\//i.test(normalizedUrl)) return normalizedUrl;
  const base = assetBaseUrl;
  return `${base}${normalizedUrl.startsWith('/') ? normalizedUrl : `/${normalizedUrl}`}`;
}

export function tagTypeByColor(color?: string | null): 'primary' | 'success' | 'info' | 'warning' | 'danger' {
  switch ((color ?? '').toLowerCase()) {
    case 'green':
    case 'success':
      return 'success';
    case 'red':
    case 'danger':
      return 'danger';
    case 'orange':
    case 'yellow':
    case 'warning':
      return 'warning';
    case 'gray':
    case 'grey':
    case 'info':
      return 'info';
    default:
      return 'primary';
  }
}
