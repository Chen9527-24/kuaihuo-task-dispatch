export const PLATFORM_THEME_COLOR_MAP = {
  douyin: '#0b0b19',
  weixin: '#07c160',
  xiaohongshu: '#ef4444',
} as const

export const DEFAULT_PLATFORM_THEME_COLOR = PLATFORM_THEME_COLOR_MAP.douyin
const TENANT_SESSION_KEY = 'distributionConfiguredTenantId'

function normalizeTenantId(value: unknown) {
  const clean = String(value ?? '').trim()
  return ['', '0', 'null', 'undefined'].includes(clean) ? '' : clean
}

/** Only the deployer's environment provides a default; there are no built-in business IDs. */
export function resolveDefaultTenantsId(_mode?: string) {
  const runtime = typeof window === 'undefined' ? undefined : window.__TASK_CONFIG__
  return normalizeTenantId(runtime?.tenantId) || normalizeTenantId(import.meta.env.VITE_DEFAULT_TENANTS_ID)
}

/** Preserve an explicitly supplied legacy task tenant while navigating to login. */
export function resolveCurrentTenantsId() {
  const configured = resolveDefaultTenantsId()
  if (typeof window === 'undefined') return configured
  try {
    const query = new URLSearchParams(window.location.search)
    const explicit = normalizeTenantId(query.get('tenantsId') || query.get('tenantId'))
    if (explicit) {
      sessionStorage.setItem(TENANT_SESSION_KEY, explicit)
      return explicit
    }
    return normalizeTenantId(sessionStorage.getItem(TENANT_SESSION_KEY)) || configured
  } catch {
    return configured
  }
}
