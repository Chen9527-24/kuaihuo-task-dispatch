import { isWeChatBrowser } from '@/services/wechatAuth'
import { recordH5Debug } from '@/services/debug'

declare global {
  interface Window {
    WeixinJSBridge?: {
      invoke: (name: string, payload: Record<string, any>, callback: (res: any) => void) => void
    }
  }
}

export type MerchantTransferPayload = {
  mchId: string
  appId: string
  packageInfo: string
}

export type MerchantTransferResult = {
  ok: boolean
  cancelled: boolean
  message: string
  raw: any
}

export function isMerchantTransferRuntimeSupported() {
  return isWeChatBrowser()
}

function waitForWeixinJSBridge(timeoutMs = 5000) {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (window.WeixinJSBridge?.invoke) return Promise.resolve(window.WeixinJSBridge)

  return new Promise<NonNullable<typeof window.WeixinJSBridge> | null>((resolve) => {
    let done = false
    let timer: number | undefined

    const finish = (bridge: NonNullable<typeof window.WeixinJSBridge> | null) => {
      if (done) return
      done = true
      if (timer) window.clearTimeout(timer)
      document.removeEventListener('WeixinJSBridgeReady', onReady)
      resolve(bridge)
    }

    const onReady = () => finish(window.WeixinJSBridge?.invoke ? window.WeixinJSBridge : null)

    document.addEventListener('WeixinJSBridgeReady', onReady, false)
    timer = window.setTimeout(() => finish(window.WeixinJSBridge?.invoke ? window.WeixinJSBridge : null), timeoutMs)
  })
}

function normalizeWechatMessage(res: any) {
  const errMsg = String(res?.err_msg || res?.errmsg || res?.message || '')
  const errDesc = String(res?.err_desc || res?.errMsg || '')
  const merged = [errMsg, errDesc].filter(Boolean).join('；')
  return merged || '微信未返回明确结果'
}

export async function invokeMerchantTransfer(payload: MerchantTransferPayload): Promise<MerchantTransferResult> {
  recordH5Debug('withdraw:request-merchant-transfer:start', {
    mchId: payload.mchId,
    appId: payload.appId,
    hasPackageInfo: !!payload.packageInfo,
    isWeChat: isWeChatBrowser(),
    ua: window.navigator.userAgent,
    href: window.location.href,
  }, 'warn')

  if (!isWeChatBrowser()) {
    const message = '请使用手机微信打开测试/正式 H5 域名后确认收款，微信开发者工具或本地 localhost 不能完成真实收款确认'
    recordH5Debug('withdraw:request-merchant-transfer:not-wechat', { message }, 'warn')
    return { ok: false, cancelled: false, message, raw: null }
  }

  const bridge = await waitForWeixinJSBridge()
  if (!bridge?.invoke) {
    const message = '微信确认收款组件未就绪，请重新打开页面后再试'
    recordH5Debug('withdraw:request-merchant-transfer:no-bridge', { message }, 'warn')
    return { ok: false, cancelled: false, message, raw: null }
  }

  return new Promise((resolve) => {
    bridge.invoke(
      'requestMerchantTransfer',
      {
        mchId: payload.mchId,
        appId: payload.appId,
        package: payload.packageInfo,
      },
      (res: any) => {
        const message = normalizeWechatMessage(res)
        const lower = message.toLowerCase()
        const result = {
          ok: lower.includes('ok'),
          cancelled: lower.includes('cancel'),
          message,
          raw: res,
        }
        recordH5Debug('withdraw:request-merchant-transfer:callback', result, result.ok ? 'info' : 'warn')
        resolve(result)
      },
    )
  })
}
