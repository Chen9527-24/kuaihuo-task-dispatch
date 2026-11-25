<template>
  <main class="login-shell">
    <section class="brand-card">
      <div class="brand-badge">任务端</div>
      <h1>登录任务系统</h1>
      <p>使用手机号登录；站点管理员可另行配置微信服务号授权登录。</p>
    </section>

    <section class="form-card">
      <label class="field">
        <span>姓名/昵称</span>
        <div>
          <van-icon name="user-o" size="18" />
          <input v-model.trim="nickname" placeholder="请输入真实姓名或昵称" />
        </div>
      </label>

      <label class="field">
        <span>手机号</span>
        <div>
          <van-icon name="phone-o" size="18" />
          <input v-model="phone" inputmode="numeric" maxlength="11" placeholder="请输入常用手机号" @input="onPhoneInput" />
        </div>
      </label>

      <label class="field">
        <span>短信验证码</span>
        <div class="sms-input-wrap">
          <van-icon name="comment-o" size="18" />
          <input v-model="smsCode" inputmode="numeric" maxlength="6" placeholder="请输入验证码" @input="onSmsCodeInput" />
          <button type="button" class="sms-btn" :disabled="!canSendLoginSms" @click.stop="handleSendSmsCode">{{ loginSmsButtonText }}</button>
        </div>
      </label>

      <van-button class="submit-btn" color="#08101f" :loading="loading" @click="submit">登录 / 注册</van-button>
      <p class="tip">手机号会用于任务领取、后台识别和后续结算关联。</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { distributionLogin } from '@/api'
import { isValidPhone, normalizePhone } from '@/services/phone'
import { normalizeRedirectPath, saveAppToken } from '@/services/wechatAuth'
import { extractMockSmsCode, useSmsCode } from '@/composables/useSmsCode'

const route = useRoute()
const router = useRouter()
const nickname = ref('')
const phone = ref('')
const smsCode = ref('')
const loading = ref(false)
const { canSend: canSendLoginSms, buttonText: loginSmsButtonText, sendCode: sendLoginSmsCode } = useSmsCode({
  scene: 'login',
  phone: () => phone.value,
})

function onPhoneInput() {
  phone.value = normalizePhone(phone.value).slice(0, 11)
}

function onSmsCodeInput() {
  smsCode.value = String(smsCode.value || '').replace(/[^0-9]/g, '').slice(0, 6)
}

function errorMsg(e: any, fallback: string) {
  const msg = e?.response?.data?.message || e?.response?.data?.msg || e?.message || fallback
  return Array.isArray(msg) ? msg.join('；') : msg
}

async function handleSendSmsCode() {
  const cleanPhone = normalizePhone(phone.value)
  phone.value = cleanPhone
  if (!isValidPhone(cleanPhone)) {
    showToast('请输入正确的手机号')
    return
  }
  try {
    const data = await sendLoginSmsCode()
    const mockCode = extractMockSmsCode(data)
    if (mockCode) smsCode.value = mockCode
    showToast(mockCode ? '验证码已发送，已自动填入' : '验证码已发送')
  } catch (e: any) {
    showToast(errorMsg(e, '验证码发送失败'))
  }
}

async function submit() {
  const cleanName = String(nickname.value || '').trim()
  if (!cleanName) {
    showToast('请输入姓名/昵称')
    return
  }
  const cleanPhone = normalizePhone(phone.value)
  phone.value = cleanPhone
  if (!isValidPhone(cleanPhone)) {
    showToast('请输入正确的手机号')
    return
  }
  const cleanSmsCode = String(smsCode.value || '').replace(/[^0-9]/g, '').slice(0, 6)
  smsCode.value = cleanSmsCode
  if (!cleanSmsCode) {
    showToast('请输入短信验证码')
    return
  }
  loading.value = true
  try {
    const res: any = await distributionLogin({ phone: cleanPhone, nickname: cleanName, smsCode: cleanSmsCode })
    const token = String(res?.data?.token || res?.data?.appToken || res?.token || res?.appToken || '')
    if (!saveAppToken(token)) throw new Error('登录结果缺少 token')
    showToast('登录成功')
    const redirect = normalizeRedirectPath(Array.isArray(route.query.redirect) ? route.query.redirect[0] : route.query.redirect || '/')
    router.replace(redirect)
  } catch (e: any) {
    showToast(errorMsg(e, '登录失败，请稍后再试'))
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-shell {
  box-sizing: border-box;
  min-height: 100dvh;
  padding: 38px 22px;
  background:
    radial-gradient(circle at 20% -6%, rgba(7, 193, 96, .2), transparent 35%),
    radial-gradient(circle at 90% 0%, rgba(99, 102, 241, .18), transparent 34%),
    linear-gradient(180deg, #f8fbff 0%, #edf5f3 100%);
  color: #0f172a;
}
.brand-card,
.form-card {
  max-width: 430px;
  margin: 0 auto;
  border: 1px solid rgba(255,255,255,.76);
  border-radius: 30px;
  background: rgba(255,255,255,.88);
  box-shadow: 0 18px 48px rgba(15, 23, 42, .08);
  backdrop-filter: blur(18px);
}
.brand-card { padding: 26px 24px; }
.brand-badge { display: inline-flex; height: 30px; align-items: center; border-radius: 999px; background: #08101f; color: #fff; padding: 0 12px; font-size: 12px; font-weight: 900; }
h1 { margin: 16px 0 8px; font-size: 30px; line-height: 1.08; letter-spacing: -.05em; }
p { margin: 0; color: #64748b; font-size: 14px; line-height: 23px; }
.form-card { margin-top: 18px; padding: 22px; }
.field { display: block; margin-bottom: 16px; }
.field span { display: block; margin: 0 0 8px 2px; color: #334155; font-size: 13px; font-weight: 900; }
.field div { display: flex; height: 54px; align-items: center; gap: 10px; border-radius: 18px; background: #f8fafc; padding: 0 16px; color: #94a3b8; box-shadow: inset 0 0 0 1px #eef2f7; }
.field div:focus-within { background: #fff; box-shadow: inset 0 0 0 1px #0f172a, 0 12px 24px rgba(15,23,42,.08); }
input { flex: 1; min-width: 0; border: 0; background: transparent; color: #0f172a; font-size: 15px; outline: none; }
.sms-input-wrap { padding-right: 8px !important; }
.sms-btn { flex: 0 0 auto; height: 36px; border: 0; border-radius: 999px; background: #08101f; color: #fff; padding: 0 12px; font-size: 12px; font-weight: 900; }
.sms-btn:disabled { background: #cbd5e1; color: #fff; }
.submit-btn { width: 100%; height: 50px; margin-top: 4px; border-radius: 999px; font-size: 16px; font-weight: 900; }
.tip { margin-top: 14px; text-align: center; color: #94a3b8; font-size: 12px; line-height: 20px; }
</style>
