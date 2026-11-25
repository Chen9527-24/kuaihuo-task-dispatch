import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { sendDistributionSmsCode } from '@/api'
import { isValidPhone, normalizePhone } from '@/services/phone'

type SmsScene = 'login' | 'profile' | 'leader_bind' | 'task_account'

type UseSmsCodeOptions = {
  scene: SmsScene
  phone: () => string
}

function unwrap(resp: any) {
  return resp?.data ?? resp
}

export function extractMockSmsCode(data: any) {
  // 真实短信接口不会返回验证码。仅保留非生产环境的 mock 自动回填，避免生产页面因异常响应泄露验证码。
  const stage = import.meta.env.VITE_APP_ENV || import.meta.env.MODE
  if (stage === 'production') return ''
  if (String(data?.provider || '').trim().toLowerCase() !== 'mock') return ''
  const raw = data?.mockCode ?? ''
  return String(raw || '').replace(/[^0-9]/g, '').slice(0, 6)
}

function storageKey(scene: SmsScene, phone: string) {
  return `distribution_sms_countdown:${scene}:${phone}`
}

function readExpireAt(scene: SmsScene, phone: string) {
  if (!phone) return 0
  try {
    const raw = Number(localStorage.getItem(storageKey(scene, phone)) || 0)
    return Number.isFinite(raw) ? raw : 0
  } catch {
    return 0
  }
}

function writeExpireAt(scene: SmsScene, phone: string, expireAt: number) {
  if (!phone) return
  try {
    localStorage.setItem(storageKey(scene, phone), String(expireAt))
  } catch {}
}

function clearExpireAt(scene: SmsScene, phone: string) {
  if (!phone) return
  try {
    localStorage.removeItem(storageKey(scene, phone))
  } catch {}
}

export function useSmsCode(options: UseSmsCodeOptions) {
  const sending = ref(false)
  const remainingSeconds = ref(0)
  let timer: number | undefined

  const phoneValue = computed(() => normalizePhone(options.phone()).slice(0, 11))
  const canSend = computed(() => isValidPhone(phoneValue.value) && !sending.value && remainingSeconds.value <= 0)
  const buttonText = computed(() => remainingSeconds.value > 0 ? `${remainingSeconds.value}s 后重发` : '获取验证码')

  function refreshCountdown() {
    const phone = phoneValue.value
    if (!phone) {
      remainingSeconds.value = 0
      return
    }
    const expireAt = readExpireAt(options.scene, phone)
    const left = Math.ceil((expireAt - Date.now()) / 1000)
    remainingSeconds.value = Math.max(0, left)
    if (left <= 0 && expireAt) clearExpireAt(options.scene, phone)
  }

  function startTimer() {
    if (timer) window.clearInterval(timer)
    refreshCountdown()
    timer = window.setInterval(refreshCountdown, 1000)
  }

  function startCountdown(seconds = 60) {
    const phone = phoneValue.value
    const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60
    writeExpireAt(options.scene, phone, Date.now() + safeSeconds * 1000)
    refreshCountdown()
  }

  async function sendCode() {
    const phone = phoneValue.value
    if (!isValidPhone(phone)) throw new Error('请输入正确的手机号')
    if (remainingSeconds.value > 0) throw new Error(`请 ${remainingSeconds.value} 秒后再获取验证码`)
    sending.value = true
    try {
      const data = unwrap(await sendDistributionSmsCode({ phone, scene: options.scene }))
      const resendAfter = Number(data?.resendAfterSeconds || 60)
      startCountdown(resendAfter)
      return data
    } finally {
      sending.value = false
    }
  }

  watch(phoneValue, refreshCountdown)
  onMounted(startTimer)
  onBeforeUnmount(() => { if (timer) window.clearInterval(timer) })

  return {
    sending,
    remainingSeconds,
    canSend,
    buttonText,
    sendCode,
    refreshCountdown,
  }
}
