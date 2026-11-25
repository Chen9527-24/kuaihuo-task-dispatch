<template>
  <main class="bind-shell">
    <section class="bind-card">
      <div class="bind-head">
        <span>{{ mode === 'leader' ? '团长身份绑定' : '加入任务团队' }}</span>
        <h1>{{ mode === 'leader' ? '绑定团长身份' : '输入邀请码' }}</h1>
        <p>{{ mode === 'leader' ? '团长绑定后也可以作为成员接任务。' : '加入团队后才能查看对应任务、收益和提现。' }}</p>
      </div>

      <van-field v-model="code" :label="mode === 'leader' ? '团长码' : '邀请码'" clearable placeholder="请输入邀请码" />
      <template v-if="mode === 'leader'">
        <van-field v-model="phone" label="手机号" clearable type="tel" maxlength="11" placeholder="请输入团长手机号" @input="onPhoneInput" />
        <van-field v-model="nickname" label="昵称" clearable placeholder="请输入任务昵称" />
        <van-field v-model="smsCode" label="验证码" clearable type="tel" maxlength="6" placeholder="请输入短信验证码" @input="onSmsCodeInput">
          <template #button>
            <button type="button" class="sms-btn" :disabled="!canSendLeaderSms" @click.stop="handleSendSmsCode">{{ leaderSmsButtonText }}</button>
          </template>
        </van-field>
      </template>

      <section v-if="detail" class="preview-card">
        <span>即将加入</span>
        <strong>{{ detail.groupName || detail.name || '-' }}</strong>
        <p>{{ detail.tenantName || detail.tenant?.name || '-' }}</p>
      </section>

      <button type="button" class="primary-btn" :disabled="submitting" @click="submit">
        {{ submitting ? '处理中...' : mode === 'leader' ? '确认绑定团长' : '确认加入团队' }}
      </button>
      <button type="button" class="ghost-btn" @click="returnHome()">返回首页</button>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { bindDistributionInvite, bindDistributionLeaderCode, getDistributionInviteDetail, getDistributionLeaderCodeDetail, getDistributionMe } from '@/api'
import { extractMockSmsCode, useSmsCode } from '@/composables/useSmsCode'
import { isValidPhone, normalizePhone } from '@/services/phone'
import { getStoredAppToken } from '@/services/wechatAuth'
import { setupInviteWechatShare } from '@/services/wechatShare'

const route = useRoute()
const router = useRouter()
function returnHome() {
  return router.replace({ path: '/', query: { taskId: route.query.taskId } })
}

const mode = ref<'member' | 'leader'>('member')
const code = ref('')
const phone = ref('')
const nickname = ref('')
const smsCode = ref('')
const detail = ref<any>(null)
const submitting = ref(false)
let lastLoadedKey = ''
let detailLoadingKey = ''
const { canSend: canSendLeaderSms, buttonText: leaderSmsButtonText, sendCode: sendLeaderSmsCode } = useSmsCode({
  scene: 'leader_bind',
  phone: () => phone.value,
})

function unwrap(resp: any) { return resp?.data ?? resp }
function readInitial() {
  const leaderCode = String(route.query.leaderCode || '').trim()
  const invite = String(route.query.invite || '').trim()
  if (leaderCode) {
    mode.value = 'leader'
    code.value = leaderCode
  } else {
    mode.value = 'member'
    code.value = invite
  }
}
function errorMsg(e: any) {
  const msg = e?.response?.data?.message || e?.response?.data?.msg || e?.message || '操作失败，请稍后重试'
  return Array.isArray(msg) ? msg.join('；') : msg
}
function onPhoneInput() {
  phone.value = normalizePhone(phone.value).slice(0, 11)
}
function onSmsCodeInput() {
  smsCode.value = String(smsCode.value || '').replace(/[^0-9]/g, '').slice(0, 6)
}
async function handleSendSmsCode() {
  const cleanPhone = normalizePhone(phone.value)
  phone.value = cleanPhone
  if (!isValidPhone(cleanPhone)) return showToast('请输入正确手机号')
  try {
    const data = await sendLeaderSmsCode()
    const mockCode = extractMockSmsCode(data)
    if (mockCode) smsCode.value = mockCode
    showToast(mockCode ? '验证码已发送，已自动填入' : '验证码已发送')
  } catch (e) {
    showToast(errorMsg(e))
  }
}
async function loadDetail() {
  const raw = code.value.trim()
  if (!raw) return
  const key = `${mode.value}:${raw}`
  if (detailLoadingKey === key) return
  if (lastLoadedKey === key && detail.value) return
  detailLoadingKey = key
  lastLoadedKey = key
  detail.value = null
  try {
    detail.value = unwrap(mode.value === 'leader' ? await getDistributionLeaderCodeDetail(raw) : await getDistributionInviteDetail(raw))
    setupShareCard()
  } catch (e) {
    lastLoadedKey = ''
    showToast(errorMsg(e))
  } finally {
    if (detailLoadingKey === key) detailLoadingKey = ''
  }
}
function setupShareCard() {
  const raw = code.value.trim()
  if (!raw) return
  const groupName = detail.value?.groupName || detail.value?.name || '相关页面'
  const link = new URL('/', window.location.origin)
  link.searchParams.set(mode.value === 'leader' ? 'leaderCode' : 'invite', raw)
  setupInviteWechatShare({
    title: mode.value === 'leader' ? `邀请你查看${groupName}团长页面` : `邀请你查看${groupName}`,
    desc: mode.value === 'leader' ? '打开页面查看身份绑定方式。' : '打开页面查看相关信息和加入方式。',
    link: link.toString(),
  })
}
async function redirectBoundMemberInvite() {
  if (mode.value !== 'member' || !getStoredAppToken()) return false
  try {
    const me = unwrap(await getDistributionMe())
    if (!me?.needBindInvite) {
      returnHome()
      return true
    }
  } catch {}
  return false
}
async function submit() {
  const raw = code.value.trim()
  if (!raw) return showToast(mode.value === 'leader' ? '请输入团长身份码' : '请输入邀请码')
  if (mode.value === 'leader') {
    phone.value = normalizePhone(phone.value).slice(0, 11)
    smsCode.value = String(smsCode.value || '').replace(/[^0-9]/g, '').slice(0, 6)
    if (!isValidPhone(phone.value.trim())) return showToast('请输入正确手机号')
    if (!nickname.value.trim()) return showToast('请输入昵称')
    if (!smsCode.value) return showToast('请输入短信验证码')
  }
  submitting.value = true
  try {
    if (mode.value === 'leader') {
      await bindDistributionLeaderCode({ leaderCode: raw, phone: phone.value.trim(), nickname: nickname.value.trim(), smsCode: smsCode.value })
      showToast('团长身份已绑定')
    } else {
      await bindDistributionInvite({ inviteCode: raw })
      showToast('已加入团队')
    }
    returnHome()
  } catch (e) {
    showToast(errorMsg(e))
  } finally {
    submitting.value = false
  }
}
watch(code, () => { if (code.value.trim().length >= 4) loadDetail() })
onMounted(async () => {
  readInitial()
  setupShareCard()
  if (await redirectBoundMemberInvite()) return
  loadDetail()
})
</script>

<style scoped>
.bind-shell { min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 24px 18px; background: #fff; color: #111827; }
.bind-card { width: 100%; max-width: 420px; border: 1px solid #e5e7eb; border-radius: 24px; padding: 22px 18px; box-shadow: 0 14px 36px rgba(15,23,42,.06); background: #fff; }
.bind-head span { color: #07c160; font-size: 12px; font-weight: 900; }
.bind-head h1 { margin: 8px 0 8px; font-size: 24px; line-height: 30px; font-weight: 950; }
.bind-head p { margin: 0 0 18px; color: #64748b; font-size: 13px; line-height: 20px; }
.preview-card { margin: 14px 0 4px; border-radius: 18px; background: #f7faf8; border: 1px solid #e5efe9; padding: 13px 14px; }
.preview-card span { color: #64748b; font-size: 12px; font-weight: 800; }
.preview-card strong { display: block; margin-top: 4px; font-size: 17px; color: #111827; }
.preview-card p { margin: 4px 0 0; color: #64748b; font-size: 13px; }
.sms-btn { height: 32px; border: 0; border-radius: 999px; background: #07c160; color: #fff; padding: 0 10px; font-size: 12px; font-weight: 900; }
.sms-btn:disabled { background: #cbd5e1; }
.primary-btn, .ghost-btn { width: 100%; height: 44px; border: 0; border-radius: 999px; margin-top: 14px; font-weight: 900; }
.primary-btn { background: #07c160; color: #fff; box-shadow: 0 10px 20px rgba(7,193,96,.18); }
.primary-btn:disabled { opacity: .58; }
.ghost-btn { background: #f8fafc; color: #475569; }
</style>
