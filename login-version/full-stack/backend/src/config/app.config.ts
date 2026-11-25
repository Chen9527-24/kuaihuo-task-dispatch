import { registerAs } from '@nestjs/config';

function parseOriginList(value?: string | null): string[] {
  return String(value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function normalizeOrigin(value: string): string | null {
  const raw = String(value || '').trim();
  if (!raw || raw === '*') return raw || null;

  try {
    return new URL(raw).origin;
  } catch {
    return raw;
  }
}

function uniqOrigins(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const origins: string[] = [];

  for (const value of values) {
    const origin = normalizeOrigin(String(value || '').trim());
    if (!origin || seen.has(origin)) continue;
    seen.add(origin);
    origins.push(origin);
  }

  return origins;
}

function buildCorsOrigins(): string[] {
  return uniqOrigins([
    ...parseOriginList(process.env.APP_ORIGIN),
    process.env.H5_BASE_URL,
    process.env.WEBSITE_BASE_URL,
    ...parseOriginList(process.env.WECHAT_MP_OAUTH_ALLOWED_RETURN_ORIGINS),
  ]);
}

function parseCorsOrigin(): string | string[] {
  const origins = buildCorsOrigins();

  if (origins.length <= 1) {
    return origins[0] ?? 'http://localhost:5173';
  }

  return origins;
}

export const appConfig = registerAs('app', () => ({
  name: process.env.APP_NAME ?? 'Nest API Starter',
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  origin: parseCorsOrigin(),
  baseUrl: process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
}));
