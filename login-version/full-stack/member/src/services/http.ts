import axios, { AxiosInstance, AxiosResponse } from 'axios'
import type { InternalAxiosRequestConfig, AxiosError } from 'axios'
import { resolveCurrentTenantsId } from '@/constant'
import { redirectToDistributionAuth } from '@/services/wechatAuth'
import { recordH5Debug } from '@/services/debug'

const DEFAULT_BASE = '/api/v1'
const http: AxiosInstance = axios.create({
  baseURL: (import.meta as any).env?.VITE_API_BASE_URL || DEFAULT_BASE,
  timeout: 10000,
})

function toPlainHeaders(headers: any) {
  if (!headers) return {}
  const source = typeof headers.toJSON === 'function' ? headers.toJSON() : headers
  const output: Record<string, any> = {}
  Object.keys(source || {}).forEach((key) => {
    const lower = key.toLowerCase()
    output[key] = lower.includes('authorization') || lower.includes('token') || lower.includes('cookie') ? '存在（已隐藏）' : source[key]
  })
  return output
}

function resolveFullRequestUrl(config: any) {
  const baseURL = String(config?.baseURL || '')
  const url = String(config?.url || '')
  try {
    return new URL(url, baseURL || window.location.origin).toString()
  } catch {
    return `${baseURL}${url}`
  }
}

function summarizeResponseData(data: any) {
  if (data == null) return data
  if (typeof data === 'string') return data.length > 1000 ? `${data.slice(0, 1000)}...(已截断)` : data
  if (typeof data !== 'object') return data
  return {
    code: data.code,
    message: data.message || data.msg,
    path: data.path,
    timestamp: data.timestamp,
    dataType: Array.isArray(data.data) ? 'array' : typeof data.data,
    dataKeys: data.data && typeof data.data === 'object' && !Array.isArray(data.data) ? Object.keys(data.data).slice(0, 30) : undefined,
  }
}

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers = config.headers || {}
    ;(config.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
  }
  const tid = resolveCurrentTenantsId()
  if (tid) {
    config.headers = config.headers || {}
    ;(config.headers as Record<string, string>)['tenantsId'] = String(tid)
  }
  recordH5Debug('http:request', {
    method: config.method,
    url: config.url,
    baseURL: config.baseURL,
    fullUrl: resolveFullRequestUrl(config),
    params: config.params,
    timeout: config.timeout,
    headers: toPlainHeaders(config.headers),
    online: navigator.onLine,
    href: window.location.href,
  })
  return config
})

http.interceptors.response.use(
  (response: AxiosResponse) => {
    recordH5Debug('http:response', {
      method: response.config?.method,
      url: response.config?.url,
      baseURL: response.config?.baseURL,
      fullUrl: resolveFullRequestUrl(response.config),
      status: response.status,
      statusText: response.statusText,
      data: summarizeResponseData(response.data),
    })
    return response.data
  },
  (error: AxiosError) => {
    const status = error.response?.status
    const data: any = error.response?.data || {}
    const message = Array.isArray(data?.message) ? data.message.join('；') : String(data?.message || data?.msg || error.message || '')
    recordH5Debug('http:error', {
      message,
      errorMessage: error.message,
      code: error.code,
      name: error.name,
      method: error.config?.method,
      url: error.config?.url,
      baseURL: error.config?.baseURL,
      fullUrl: resolveFullRequestUrl(error.config),
      params: (error.config as any)?.params,
      timeout: error.config?.timeout,
      headers: toPlainHeaders(error.config?.headers),
      status,
      statusText: error.response?.statusText,
      response: summarizeResponseData(error.response?.data),
      online: navigator.onLine,
      href: window.location.href,
      userAgent: navigator.userAgent,
    }, 'error')
    if ((status === 401 || message.includes('请先登录')) && !window.location.pathname.startsWith('/login')) {
      const redirect = `${window.location.pathname || '/'}${window.location.search || ''}`
      recordH5Debug('auth:redirect-after-401', { redirect, status, message }, 'warn')
      redirectToDistributionAuth(redirect)
    }
    return Promise.reject(error)
  },
)

export default http
