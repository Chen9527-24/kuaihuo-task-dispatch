<template>
  <main class="complete-shell">
    <section class="complete-card">
      <div class="icon-wrap"><van-icon name="passed" size="30" /></div>
      <h1>完善账号资料</h1>
      <p>首次微信授权后需要绑定姓名和手机号，完成后才可以领取任务。</p>

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
          <button type="button" class="sms-btn" :disabled="!canSendProfileSms" @click.stop="handleSendSmsCode">{{ profileSmsButtonText }}</button>
        </div>
      </label>

      <van-button class="submit-btn" color="#08101f" :loading="loading" @click="submit">保存并进入任务大厅</van-button>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { distributionUpdateProfile, getDistributionMe } from '@/api'
import { isValidPhone, normalizePhone } from '@/services/phone'
import { extractMockSmsCode, useSmsCode } from '@/composables/useSmsCode'

const router = useRouter()
const route = useRoute()
const nickname = ref('')
const phone = ref('')
const smsCode = ref('')
const loading = ref(false)
const { canSend: canSendProfileSms, buttonText: profileSmsButtonText, sendCode: sendProfileSmsCode } = useSmsCode({
  scene: 'profile',
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
    const data = await sendProfileSmsCode()
    const mockCode = extractMockSmsCode(data)
    if (mockCode) smsCode.value = mockCode
    showToast(mockCode ? '验证码已发送，已自动填入' : '验证码已发送')
  } catch (e: any) {
    showToast(errorMsg(e, '验证码发送失败'))
  }
}

onMounted(async () => {
  try {
    const res: any = await getDistributionMe()
    const user = res?.data?.user || res?.user || {}
    nickname.value = String(user?.nickname || '')
    phone.value = String(user?.phone || '')
  } catch {}
})

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
    await distributionUpdateProfile({ phone: cleanPhone, nickname: cleanName, smsCode: cleanSmsCode })
    showToast('保存成功')
    const from = String(route.query.from || '').trim()
    router.replace({ path: '/', query: { tab: from === 'profile' ? 'profile' : undefined, taskId: route.query.taskId } })
  } catch (e: any) {
    showToast(errorMsg(e, '保存失败，请稍后再试'))
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.complete-shell {
  box-sizing: border-box;
  min-height: 100dvh;
  padding: 38px 22px;
  background:
    radial-gradient(circle at 18% -8%, rgba(7, 193, 96, .2), transparent 36%),
    linear-gradient(180deg, #f8fbff 0%, #edf5f3 100%);
  color: #0f172a;
}
.complete-card {
  max-width: 430px;
  margin: 0 auto;
  border: 1px solid rgba(255,255,255,.76);
  border-radius: 32px;
  background: rgba(255,255,255,.9);
  padding: 26px 22px;
  box-shadow: 0 18px 48px rgba(15, 23, 42, .08);
  backdrop-filter: blur(18px);
}
.icon-wrap { display: grid; width: 62px; height: 62px; place-items: center; border-radius: 24px; background: #dcfce7; color: #16a34a; }
h1 { margin: 18px 0 8px; font-size: 28px; line-height: 1.1; letter-spacing: -.05em; }
p { margin: 0 0 22px; color: #64748b; font-size: 14px; line-height: 23px; }
.field { display: block; margin-bottom: 16px; }
.field span { display: block; margin: 0 0 8px 2px; color: #334155; font-size: 13px; font-weight: 900; }
.field div { display: flex; height: 54px; align-items: center; gap: 10px; border-radius: 18px; background: #f8fafc; padding: 0 16px; color: #94a3b8; box-shadow: inset 0 0 0 1px #eef2f7; }
.field div:focus-within { background: #fff; box-shadow: inset 0 0 0 1px #0f172a, 0 12px 24px rgba(15,23,42,.08); }
input { flex: 1; min-width: 0; border: 0; background: transparent; color: #0f172a; font-size: 15px; outline: none; }
.sms-input-wrap { padding-right: 8px !important; }
.sms-btn { flex: 0 0 auto; height: 36px; border: 0; border-radius: 999px; background: #08101f; color: #fff; padding: 0 12px; font-size: 12px; font-weight: 900; }
.sms-btn:disabled { background: #cbd5e1; color: #fff; }
.submit-btn { width: 100%; height: 50px; margin-top: 4px; border-radius: 999px; font-size: 16px; font-weight: 900; }
</style>
