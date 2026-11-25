import { recordH5Debug } from '@/services/debug'
import { resolveCurrentTenantsId } from '@/constant'
const TOKEN_KEY = 'token'
const APP_TOKEN_KEY = 'appToken'
const WECHAT_AUTH_FLAG_KEY = 'wechatOAuthRedirecting'

export function isWeChatBrowser() {
  return /MicroMessenger/i.test(window.navigator.userAgent || '')
}

export function isWeChatOAuthEnabled() {
  const runtime = window.__TASK_CONFIG__?.wechatOAuth
  if (typeof runtime === 'boolean') return runtime
  const value = String((import.meta as any).env?.VITE_ENABLE_WECHAT_OAUTH ?? 'false').trim().toLowerCase()
  return value === 'true' || value === '1' || value === 'on'
}

export function getStoredAppToken() {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(APP_TOKEN_KEY) || ''
}

export function saveAppToken(token: string) {
  const clean = String(token || '').trim()
  if (!clean) return false
  localStorage.setItem(TOKEN_KEY, clean)
  localStorage.setItem(APP_TOKEN_KEY, clean)
  clearWechatOAuthRedirecting()
  return true
}

export function clearAppToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(APP_TOKEN_KEY)
  localStorage.removeItem('distributionCurrentTask')
}

export function markWechatOAuthRedirecting() {
  try {
    sessionStorage.setItem(WECHAT_AUTH_FLAG_KEY, String(Date.now()))
  } catch {}
}

export function clearWechatOAuthRedirecting() {
  try {
    sessionStorage.removeItem(WECHAT_AUTH_FLAG_KEY)
  } catch {}
}

export function buildWechatOAuthAuthorizeUrl(redirectPath: string) {
  const base = resolveWechatOAuthApiBaseUrl()
  const redirect = withDefaultTenant(normalizeRedirectPath(redirectPath))
  const url = new URL(`${base}/wechat/oauth/authorize`, window.location.origin)
  url.searchParams.set('redirect', redirect)
  const returnOrigin = resolveWechatOAuthReturnOrigin()
  if (returnOrigin) url.searchParams.set('returnOrigin', returnOrigin)
  const target = url.toString()
  recordH5Debug('auth:build-authorize-url', { base, redirect, returnOrigin, target })
  return target
}

function resolveWechatOAuthApiBaseUrl() {
  const env = (import.meta as any).env || {}
  const raw = String(env.VITE_WECHAT_OAUTH_API_BASE_URL || env.VITE_API_BASE_URL || '/api/v1').trim() || '/api/v1'
  return raw.replace(/\/+$/, '')
}

function resolveWechatOAuthReturnOrigin() {
  const env = (import.meta as any).env || {}
  const configured = String(env.VITE_WECHAT_OAUTH_RETURN_ORIGIN || '').trim()
  if (configured === 'false' || configured === '0' || configured === 'off') return ''
  if (configured && configured !== 'auto') return normalizeOrigin(configured)
  if (isLocalDevOrigin(window.location.origin)) return window.location.origin
  return ''
}

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin
  } catch {
    return ''
  }
}

function isLocalDevOrigin(origin: string) {
  try {
    const url = new URL(origin)
    return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
  } catch {
    return false
  }
}

export function redirectToDistributionAuth(redirectPath?: string | null) {
  const redirect = normalizeRedirectPath(redirectPath || `${window.location.pathname || '/'}${window.location.search || ''}`)
  recordH5Debug('auth:redirect-start', { redirect, oauthEnabled: isWeChatOAuthEnabled(), isWeChat: isWeChatBrowser(), href: window.location.href }, 'warn')
  clearAppToken()
  if (isWeChatOAuthEnabled()) {
    if (isWeChatBrowser()) {
      markWechatOAuthRedirecting()
      const target = buildWechatOAuthAuthorizeUrl(redirect)
      recordH5Debug('auth:redirect-wechat-oauth', { target }, 'warn')
      window.location.replace(target)
      return
    }
    const target = `/wechat-open-hint?redirect=${encodeURIComponent(redirect)}`
    recordH5Debug('auth:redirect-wechat-open-hint', { target }, 'warn')
    window.location.replace(target)
    return
  }
  const target = `/login?redirect=${encodeURIComponent(redirect)}`
  recordH5Debug('auth:redirect-login', { target }, 'warn')
  window.location.replace(target)
}

function withDefaultTenant(path: string) {
  const tenantId = resolveCurrentTenantsId()
  if (!tenantId) return path
  try {
    const url = new URL(path, window.location.origin)
    if (!url.searchParams.get('tenantId') && !url.searchParams.get('tenantsId')) {
      url.searchParams.set('tenantId', tenantId)
    }
    return `${url.pathname || '/'}${url.search || ''}${url.hash || ''}`
  } catch {
    return path
  }
}

export function normalizeRedirectPath(input?: string | null) {
  const raw = String(input || '').trim()
  if (!raw) return '/'
  if (/^https?:\/\//i.test(raw)) {
    try {
      const target = new URL(raw)
      if (target.origin !== window.location.origin) return '/'
      return `${target.pathname || '/'}${target.search || ''}${target.hash || ''}`
    } catch {
      return '/'
    }
  }
  if (raw.startsWith('//')) return '/'
  const path = raw.startsWith('/') ? raw : `/${raw}`
  return path.startsWith('/auth/wechat-callback') || path.startsWith('/wechat-open-hint') ? '/' : path
}
