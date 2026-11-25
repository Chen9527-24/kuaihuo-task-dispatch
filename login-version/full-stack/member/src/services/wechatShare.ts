import { getWechatJsSdkSignature } from '@/api'
import { isWeChatBrowser } from '@/services/wechatAuth'
import { getH5EntryUrl, isH5DebugEnabled, recordH5Debug } from '@/services/debug'

type ShareOptions = {
  title?: string
  desc?: string
  link?: string
  imgUrl?: string
}

declare global {
  interface Window {
    wx?: any
  }
}

let sdkLoading: Promise<void> | null = null
let configuredShareKey = ''
let pendingShareConfig: Promise<void> | null = null

// 微信服务端会按分享链接和图片 URL 缓存卡片。仅覆盖同名图片文件时，
// 已存在的缓存可能仍显示旧图；统一由此版本号生成新的图片 URL 和分享链接。
export const SHARE_CARD_VERSION = 'open-source-1'
export const DEFAULT_SHARE_IMAGE = String(import.meta.env.VITE_WECHAT_SHARE_IMAGE_URL || '').trim()
const DEFAULT_SHARE_TITLE = '邀请你查看页面'
const DEFAULT_SHARE_DESC = '打开页面查看相关信息和加入方式。'

function unwrap(resp: any) {
  return resp?.data ?? resp
}

function isIOSWechat() {
  return /MicroMessenger/i.test(window.navigator.userAgent || '') && /\b(iPhone|iPad|iPod)\b/i.test(window.navigator.userAgent || '')
}

function withoutHash(value: string) {
  return String(value || '').split('#')[0]
}

function signatureUrl() {
  const current = withoutHash(window.location.href)
  const entry = withoutHash(getH5EntryUrl())
  return isIOSWechat() && entry ? entry : current
}

function absoluteUrl(value: string) {
  try {
    return new URL(value, window.location.origin).toString()
  } catch {
    return value
  }
}

/**
 * 只用于微信分享卡片的链接版本化：
 * - 不修改邀请码 invite 参数；
 * - 不影响现有绑定邀请码逻辑；
 * - 让微信将本次分享视为新的链接，避免继续使用旧卡片缓存。
 */
export function withShareCacheVersion(value: string) {
  try {
    const url = new URL(value, window.location.origin)
    url.searchParams.set('shareV', SHARE_CARD_VERSION)
    return url.toString()
  } catch {
    return value
  }
}

function normalizeShareText(value: string, fallback: string) {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, 60) || fallback
}

function loadWechatSdk() {
  if (window.wx) return Promise.resolve()
  if (sdkLoading) return sdkLoading
  sdkLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('微信 JS-SDK 加载失败'))
    document.head.appendChild(script)
  })
  return sdkLoading
}

function waitWxReady(timeoutMs = 5000) {
  return new Promise<void>((resolve, reject) => {
    let done = false
    const timer = window.setTimeout(() => {
      if (done) return
      done = true
      recordH5Debug('wechat-share:ready-timeout', { timeoutMs }, 'warn')
      reject(new Error('微信 JS-SDK ready 超时'))
    }, timeoutMs)
    const finish = (type: 'resolve' | 'reject', payload?: any) => {
      if (done) return
      done = true
      window.clearTimeout(timer)
      if (type === 'resolve') resolve()
      else reject(payload instanceof Error ? payload : new Error('微信 JS-SDK config 失败'))
    }
    window.wx.ready(() => {
      recordH5Debug('wechat-share:ready', {})
      finish('resolve')
    })
    window.wx.error((error: any) => {
      recordH5Debug('wechat-share:config-error', error, 'warn')
      finish('reject', error)
    })
  })
}

function withShareCallbacks(type: string, payload: Record<string, any>) {
  return {
    ...payload,
    success: (res: any) => recordH5Debug(`wechat-share:${type}:success`, res || {}),
    fail: (res: any) => recordH5Debug(`wechat-share:${type}:fail`, res || {}, 'warn'),
    cancel: (res: any) => recordH5Debug(`wechat-share:${type}:cancel`, res || {}, 'warn'),
    complete: (res: any) => recordH5Debug(`wechat-share:${type}:complete`, res || {}),
  }
}

async function doSetupInviteWechatShare(options: ShareOptions = {}) {
  const signUrl = signatureUrl()
  const title = normalizeShareText(options.title || DEFAULT_SHARE_TITLE, DEFAULT_SHARE_TITLE)
  const desc = normalizeShareText(options.desc || DEFAULT_SHARE_DESC, DEFAULT_SHARE_DESC)
  const link = absoluteUrl(options.link || window.location.href)
  const configuredImage = String(options.imgUrl || DEFAULT_SHARE_IMAGE).trim()
  const imgUrl = configuredImage ? absoluteUrl(configuredImage) : ''
  const shareKey = JSON.stringify({ signUrl, title, desc, link, imgUrl })

  if (configuredShareKey === shareKey) {
    recordH5Debug('wechat-share:skip', { reason: 'same-config', link })
    return
  }

  recordH5Debug('wechat-share:start', {
    href: window.location.href,
    entryUrl: getH5EntryUrl(),
    signatureUrl: signUrl,
    isIOSWechat: isIOSWechat(),
    link,
  })

  await loadWechatSdk()
  recordH5Debug('wechat-share:sdk-loaded', {})
  const signature = unwrap(await getWechatJsSdkSignature(signUrl))
  recordH5Debug('wechat-share:signature-ready', {
    appId: signature.appId,
    timestamp: signature.timestamp,
    nonceStr: signature.nonceStr,
    hasSignature: Boolean(signature.signature),
    link,
    imgUrl,
  })

  const readyPromise = waitWxReady()
  window.wx.config({
    debug: isH5DebugEnabled(),
    appId: signature.appId,
    timestamp: signature.timestamp,
    nonceStr: signature.nonceStr,
    signature: signature.signature,
    jsApiList: ['updateAppMessageShareData', 'updateTimelineShareData', 'onMenuShareAppMessage', 'onMenuShareTimeline', 'showOptionMenu'],
  })

  await readyPromise
  const appMessagePayload = { title, desc, link, ...(imgUrl ? { imgUrl } : {}) }
  const timelinePayload = { title, link, ...(imgUrl ? { imgUrl } : {}) }

  if (window.wx.updateAppMessageShareData) window.wx.updateAppMessageShareData(withShareCallbacks('update-app-message', appMessagePayload))
  if (window.wx.updateTimelineShareData) window.wx.updateTimelineShareData(withShareCallbacks('update-timeline', timelinePayload))
  if (window.wx.onMenuShareAppMessage) window.wx.onMenuShareAppMessage(withShareCallbacks('menu-app-message', appMessagePayload))
  if (window.wx.onMenuShareTimeline) window.wx.onMenuShareTimeline(withShareCallbacks('menu-timeline', timelinePayload))

  configuredShareKey = shareKey
  recordH5Debug('wechat-share:configured', { title, desc, link, imgUrl })
}

export async function setupInviteWechatShare(options: ShareOptions = {}) {
  if (!isWeChatBrowser()) {
    recordH5Debug('wechat-share:skip', { reason: 'not-wechat', href: window.location.href })
    return
  }
  if (pendingShareConfig) {
    recordH5Debug('wechat-share:queue', { reason: 'pending-config' })
    await pendingShareConfig.catch(() => undefined)
  }
  pendingShareConfig = doSetupInviteWechatShare(options)
  try {
    await pendingShareConfig
  } catch (error: any) {
    recordH5Debug('wechat-share:setup-failed', { message: error?.message || String(error) }, 'warn')
  } finally {
    pendingShareConfig = null
  }
}

export function showWechatShareMenu() {
  if (!isWeChatBrowser()) return false
  try {
    if (typeof window.wx?.showOptionMenu !== 'function') return false
    window.wx.showOptionMenu({
      success: (res: any) => recordH5Debug('wechat-share:show-option-menu:success', res || {}),
      fail: (res: any) => recordH5Debug('wechat-share:show-option-menu:fail', res || {}, 'warn'),
    })
    return true
  } catch (error: any) {
    recordH5Debug('wechat-share:show-option-menu:error', { message: error?.message || String(error) }, 'warn')
    return false
  }
}

