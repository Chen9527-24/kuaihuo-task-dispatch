type DebugLevel = 'info' | 'warn' | 'error'

type DebugEntry = {
  id: number
  time: string
  level: DebugLevel
  event: string
  payload?: any
}

const DEBUG_LOG_KEY = 'h5DebugLogs'
const MAX_LOG_COUNT = 100
const QUERY_KEY = 'h5Debug'
const H5_ENTRY_URL = safeWindow()?.location.href || ''

let initialized = false
let seq = 0

function safeWindow() {
  return typeof window !== 'undefined' ? window : null
}

function isEnabledValue(value: string | null) {
  if (value === null) return false
  const clean = String(value).trim().toLowerCase()
  if (!clean) return false
  return !['0', 'false', 'off', 'no', 'close'].includes(clean)
}

function redactSensitiveText(value: string) {
  return value.replace(/([?&](?:token|appToken|authorization|access_token)=)[^&#]+/gi, '$1***')
}

function getDebugQueryValue() {
  const win = safeWindow()
  if (!win) return null
  try {
    const params = new URLSearchParams(win.location.search || '')
    return params.has(QUERY_KEY) ? params.get(QUERY_KEY) : null
  } catch {}
  return null
}

function applyUrlSwitch() {
  const win = safeWindow()
  if (!win) return
  try {
    const params = new URLSearchParams(win.location.search || '')
    if (isEnabledValue(params.get('clearH5Debug'))) {
      win.localStorage.removeItem(DEBUG_LOG_KEY)
    }
  } catch {}
}

applyUrlSwitch()

export function isH5DebugEnabled() {
  return isEnabledValue(getDebugQueryValue())
}

export function getH5EntryUrl() {
  return H5_ENTRY_URL
}

function simplifyValue(value: any, depth = 0): any {
  if (value == null) return value
  if (typeof value === 'string') {
    const clean = redactSensitiveText(value)
    return clean.length > 1000 ? `${clean.slice(0, 1000)}...(已截断)` : clean
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'function') return '[Function]'
  if (depth >= 4) return '[DepthLimited]'
  if (Array.isArray(value)) return value.slice(0, 20).map(item => simplifyValue(item, depth + 1))
  if (typeof value === 'object') {
    const output: Record<string, any> = {}
    Object.keys(value).slice(0, 80).forEach(key => {
      const lower = key.toLowerCase()
      if (lower.includes('authorization') || lower.includes('token') || lower.includes('cookie')) {
        output[key] = value[key] ? '存在（已隐藏）' : value[key]
      } else {
        output[key] = simplifyValue(value[key], depth + 1)
      }
    })
    return output
  }
  return String(value)
}

function readLogs(): DebugEntry[] {
  const win = safeWindow()
  if (!win) return []
  try {
    const raw = win.localStorage.getItem(DEBUG_LOG_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLogs(logs: DebugEntry[]) {
  const win = safeWindow()
  if (!win) return
  try {
    win.localStorage.setItem(DEBUG_LOG_KEY, JSON.stringify(logs.slice(-MAX_LOG_COUNT)))
  } catch {}
}

export function getH5DebugLogs() {
  return readLogs()
}

export function clearH5DebugLogs() {
  writeLogs([])
  emitLogChange()
}

function emitLogChange() {
  const win = safeWindow()
  if (!win) return
  try {
    win.dispatchEvent(new CustomEvent('h5-debug-log-change'))
  } catch {}
}

export function recordH5Debug(event: string, payload: any = {}, level: DebugLevel = 'info') {
  if (!isH5DebugEnabled()) return
  const entry: DebugEntry = {
    id: Date.now() * 1000 + seq++,
    time: new Date().toISOString(),
    level,
    event,
    payload: simplifyValue(payload),
  }
  const logs = readLogs()
  logs.push(entry)
  writeLogs(logs)
  emitLogChange()
  try {
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'
    ;(console as any)[method]?.(`[H5Debug] ${event}`, entry.payload)
  } catch {}
}

function resolveEnvInfo() {
  const env = (import.meta as any).env || {}
  return {
    href: window.location.href,
    entryUrl: getH5EntryUrl(),
    origin: window.location.origin,
    pathname: window.location.pathname,
    search: window.location.search,
    userAgent: window.navigator.userAgent,
    apiBaseUrl: env.VITE_API_BASE_URL || '',
    oauthApiBaseUrl: env.VITE_WECHAT_OAUTH_API_BASE_URL || '',
    oauthEnabled: env.VITE_ENABLE_WECHAT_OAUTH ?? '',
    oauthReturnOrigin: env.VITE_WECHAT_OAUTH_RETURN_ORIGIN || '',
    defaultTenantsId: env.VITE_DEFAULT_TENANTS_ID || '',
    tokenExists: Boolean(window.localStorage.getItem('token') || window.localStorage.getItem('appToken')),
  }
}

function formatLogs() {
  const logs = readLogs()
  if (!logs.length) return '暂无日志。请刷新页面或重新操作触发请求。'
  return logs
    .map(item => `[${item.time}] [${item.level}] ${item.event}\n${JSON.stringify(item.payload || {}, null, 2)}`)
    .join('\n\n')
}

function fallbackCopy(text: string) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'readonly')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    document.execCommand('copy')
  } finally {
    document.body.removeChild(textarea)
  }
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  fallbackCopy(text)
}

export function initH5DebugPanel() {
  const win = safeWindow()
  applyUrlSwitch()
  if (!win || initialized || !isH5DebugEnabled()) return
  initialized = true

  recordH5Debug('debug:boot', resolveEnvInfo())

  win.addEventListener('error', event => {
    recordH5Debug('window:error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error?.message || String(event.error || ''),
    }, 'error')
  })
  win.addEventListener('unhandledrejection', event => {
    const reason: any = event.reason || {}
    recordH5Debug('window:unhandledrejection', {
      message: reason?.message || String(reason || ''),
      name: reason?.name,
      stack: reason?.stack,
      response: reason?.response?.data,
      status: reason?.response?.status,
      code: reason?.code,
    }, 'error')
  })
  win.addEventListener('online', () => recordH5Debug('network:online'))
  win.addEventListener('offline', () => recordH5Debug('network:offline', {}, 'warn'))
  document.addEventListener('visibilitychange', () => {
    recordH5Debug('page:visibilitychange', { visibilityState: document.visibilityState })
  })
  win.addEventListener('pageshow', event => {
    recordH5Debug('page:pageshow', { persisted: event.persisted, href: win.location.href })
  })

  const style = document.createElement('style')
  style.textContent = `
.h5-debug-trigger{position:fixed;right:10px;bottom:90px;z-index:2147483647;border:0;border-radius:999px;padding:8px 10px;background:#111827;color:#fff;font-size:12px;box-shadow:0 6px 16px rgba(0,0,0,.25)}
.h5-debug-panel{position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;max-height:70vh;background:#111827;color:#f9fafb;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);display:none;overflow:hidden;font-size:12px}
.h5-debug-panel.open{display:flex;flex-direction:column}
.h5-debug-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px;border-bottom:1px solid rgba(255,255,255,.16)}
.h5-debug-title{font-weight:700}.h5-debug-actions{display:flex;gap:6px;flex-wrap:wrap}.h5-debug-actions button{border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;border-radius:8px;padding:5px 8px;font-size:12px}
.h5-debug-body{white-space:pre-wrap;word-break:break-word;overflow:auto;padding:10px;line-height:1.45;max-height:calc(70vh - 54px)}
`
  document.head.appendChild(style)

  const trigger = document.createElement('button')
  trigger.type = 'button'
  trigger.className = 'h5-debug-trigger'
  trigger.textContent = '调试'

  const panel = document.createElement('section')
  panel.className = 'h5-debug-panel'
  panel.innerHTML = `
    <div class="h5-debug-header">
      <div class="h5-debug-title">H5 真机调试日志</div>
      <div class="h5-debug-actions">
        <button type="button" data-action="copy">复制</button>
        <button type="button" data-action="clear">清空</button>
        <button type="button" data-action="close">收起</button>
      </div>
    </div>
    <pre class="h5-debug-body"></pre>
  `
  const body = panel.querySelector('.h5-debug-body') as HTMLElement
  const refresh = () => {
    body.textContent = formatLogs()
  }
  refresh()

  trigger.addEventListener('click', () => {
    panel.classList.toggle('open')
    refresh()
  })
  panel.addEventListener('click', async event => {
    const target = event.target as HTMLElement
    const action = target?.getAttribute?.('data-action')
    if (!action) return
    if (action === 'close') panel.classList.remove('open')
    if (action === 'clear') {
      clearH5DebugLogs()
      refresh()
    }
    if (action === 'copy') {
      await copyText(formatLogs())
      recordH5Debug('debug:copy-logs')
      refresh()
    }
  })
  win.addEventListener('h5-debug-log-change', refresh)

  document.body.appendChild(trigger)
  document.body.appendChild(panel)

  ;(win as any).__H5_DEBUG__ = {
    logs: getH5DebugLogs,
    clear: clearH5DebugLogs,
    record: recordH5Debug,
    env: resolveEnvInfo,
  }
}
