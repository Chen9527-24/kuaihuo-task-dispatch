<template>
  <main class="leader-shell">
    <header class="leader-topbar">
      <button class="back-btn" type="button" aria-label="返回" @click="goBack"><van-icon name="arrow-left" size="19" /></button>
      <h1>团长中心</h1>
      <button class="refresh-btn" type="button" :disabled="loading" @click="loadData"><van-icon name="replay" size="17" /> 刷新</button>
    </header>

    <section v-if="loading && !leaderData" class="leader-loading-card">
      <van-skeleton title :row="10" />
    </section>

    <template v-else-if="leaderData">
      <section class="leader-hero">
        <span class="hero-eyebrow">团队经营</span>
        <h2>{{ leaderData.group?.name || '我的团队' }}</h2>
        <p>{{ leaderData.group?.tenantName || '当前租户' }}</p>
      </section>

      <section class="summary-card">
        <div class="section-head">
          <div>
            <span>团队累计</span>
            <h3>邀请成员的经营数据</h3>
          </div>
          <small>仅统计成功邀请成员</small>
        </div>
        <div class="summary-grid">
          <div>
            <span>累计邀请</span>
            <strong>{{ totals.invitedMemberCount }}<small>人</small></strong>
          </div>
          <div>
            <span>已完成订单</span>
            <strong>{{ totals.completedOrderCount }}<small>单</small></strong>
          </div>
          <div>
            <span>成功提现</span>
            <strong class="money">{{ formatAmount(totals.paidWithdrawalAmount) }}</strong>
          </div>
          <div>
            <span>团长佣金</span>
            <strong class="money">{{ formatAmount(totals.commissionAmount) }}</strong>
          </div>
        </div>
      </section>

      <section class="range-card">
        <div class="section-head">
          <div>
            <span>时间筛选</span>
            <h3>{{ rangeSummary }}</h3>
          </div>
        </div>
        <div class="range-tabs">
          <button v-for="item in ranges" :key="item.key" type="button" :class="{ active: selectedRange === item.key }" @click="selectRange(item.key)">{{ item.label }}</button>
        </div>
        <div v-if="selectedRange === 'custom'" class="custom-range">
          <label>
            <span>开始日期</span>
            <input v-model="customStartDate" type="date" :max="customEndDate || today" />
          </label>
          <label>
            <span>结束日期</span>
            <input v-model="customEndDate" type="date" :min="customStartDate" :max="today" />
          </label>
          <button type="button" :disabled="loading" @click="applyCustomRange">查询</button>
        </div>
        <div class="period-grid">
          <div>
            <span>新增邀请</span>
            <strong>{{ period.newInvitedMemberCount }}<small>人</small></strong>
          </div>
          <div>
            <span>完成订单</span>
            <strong>{{ period.completedOrderCount }}<small>单</small></strong>
          </div>
          <div>
            <span>成功提现</span>
            <strong class="money">{{ formatAmount(period.paidWithdrawalAmount) }}</strong>
          </div>
          <div>
            <span>本期佣金</span>
            <strong class="money">{{ formatAmount(period.commissionAmount) }}</strong>
          </div>
        </div>
        <p class="range-tip">完成订单按成员完成任务时间统计；成功提现仅统计状态为“已到账”的记录。</p>
      </section>

      <section class="invite-card">
        <div class="section-head">
          <div>
            <span>邀请成员</span>
            <h3>分享邀请码或邀请链接</h3>
          </div>
        </div>

        <div class="invite-code-box">
          <div>
            <span>成员邀请码</span>
            <strong>{{ invitation.memberInviteCode || '-' }}</strong>
          </div>
          <button type="button" @click="copyInviteCode"><van-icon name="description" size="16" /> 复制</button>
        </div>

        <div class="invite-link-box">
          <span>邀请链接</span>
          <p>{{ inviteLink || '-' }}</p>
          <button type="button" @click="copyInviteLink"><van-icon name="link-o" size="16" /> 复制链接</button>
        </div>

        <button class="share-btn" type="button" :disabled="sharing" @click="shareInvite">
          <van-icon name="share-o" size="18" />
          {{ sharing ? '正在生成邀请卡片...' : '分享邀请卡片' }}
        </button>
        <p class="share-tip">在微信服务号内点击后会配置邀请卡片；请按右上角“···”发送给好友或群聊。</p>
      </section>
    </template>

    <section v-else class="leader-error-card">
      <van-empty image-size="82" description="暂时无法加载团长中心" />
      <button type="button" @click="loadData">重新加载</button>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { getDistributionLeaderCenter } from '@/api'
import { isWeChatBrowser } from '@/services/wechatAuth'
import { DEFAULT_SHARE_IMAGE, setupInviteWechatShare, showWechatShareMenu, withShareCacheVersion } from '@/services/wechatShare'

const router = useRouter()
const leaderData = ref<any>(null)
const loading = ref(false)
const sharing = ref(false)
const selectedRange = ref<'all' | 'today' | '7d' | '30d' | 'custom'>('all')
const customStartDate = ref('')
const customEndDate = ref('')
let loadVersion = 0

const ranges = [
  { key: 'all', label: '全部' },
  { key: 'today', label: '今天' },
  { key: '7d', label: '近 7 天' },
  { key: '30d', label: '近 30 天' },
  { key: 'custom', label: '自定义' },
] as const

function unwrap(resp: any) {
  return resp?.data ?? resp
}

function errorMsg(error: any, fallback = '加载失败，请稍后重试') {
  const message = error?.response?.data?.message || error?.response?.data?.msg || error?.message || fallback
  return Array.isArray(message) ? message.join('；') : String(message)
}

function toDateString(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(value: Date, days: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

const today = computed(() => toDateString(new Date()))
const totals = computed(() => leaderData.value?.totals || { invitedMemberCount: 0, completedOrderCount: 0, paidWithdrawalAmount: 0, commissionAmount: 0, commissionOrderCount: 0 })
const period = computed(() => leaderData.value?.period || { newInvitedMemberCount: 0, completedOrderCount: 0, paidWithdrawalAmount: 0, commissionAmount: 0, commissionOrderCount: 0 })
const invitation = computed(() => leaderData.value?.invitation || {})
const inviteLink = computed(() => {
  const raw = String(invitation.value?.memberInviteUrl || '').trim()
  const code = String(invitation.value?.memberInviteCode || '').trim()
  try {
    return new URL(raw || `/?invite=${encodeURIComponent(code)}`, window.location.origin).toString()
  } catch {
    return raw
  }
})
const rangeSummary = computed(() => {
  if (selectedRange.value === 'all') return '全部时间'
  const start = String(leaderData.value?.period?.startDate || '').trim()
  const end = String(leaderData.value?.period?.endDate || '').trim()
  return start && end ? `${start} 至 ${end}` : '请选择日期范围'
})

function rangeParams() {
  const now = new Date()
  const endDate = toDateString(now)
  if (selectedRange.value === 'today') return { startDate: endDate, endDate }
  if (selectedRange.value === '7d') return { startDate: toDateString(addDays(now, -6)), endDate }
  if (selectedRange.value === '30d') return { startDate: toDateString(addDays(now, -29)), endDate }
  if (selectedRange.value === 'custom') {
    return { startDate: customStartDate.value, endDate: customEndDate.value }
  }
  return {}
}

async function loadData() {
  if (selectedRange.value === 'custom' && (!customStartDate.value || !customEndDate.value)) {
    showToast('请选择开始日期和结束日期')
    return
  }
  if (selectedRange.value === 'custom' && customStartDate.value > customEndDate.value) {
    showToast('开始日期不能晚于结束日期')
    return
  }

  const currentLoad = ++loadVersion
  loading.value = true
  try {
    const data = unwrap(await getDistributionLeaderCenter(rangeParams()))
    if (currentLoad !== loadVersion) return
    leaderData.value = data
    void configureShareCard(data)
  } catch (error: any) {
    if (currentLoad !== loadVersion) return
    // 切换筛选失败时保留上一份成功数据，避免网络抖动把团长中心误清空。
    showToast(errorMsg(error))
  } finally {
    if (currentLoad === loadVersion) loading.value = false
  }
}

async function selectRange(value: typeof selectedRange.value) {
  selectedRange.value = value
  if (value === 'custom') {
    if (!customStartDate.value || !customEndDate.value) {
      const now = new Date()
      customEndDate.value = toDateString(now)
      customStartDate.value = toDateString(addDays(now, -6))
    }
    return
  }
  await loadData()
}

async function applyCustomRange() {
  await loadData()
}

function formatAmount(value: any) {
  return `¥${(Number(value || 0) / 100).toFixed(2)}`
}

async function copyText(value: string, successText: string) {
  const text = String(value || '').trim()
  if (!text) {
    showToast('暂无可复制内容')
    return
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const input = document.createElement('textarea')
      input.value = text
      input.setAttribute('readonly', 'readonly')
      input.style.position = 'fixed'
      input.style.opacity = '0'
      document.body.appendChild(input)
      input.select()
      const copied = document.execCommand('copy')
      document.body.removeChild(input)
      if (!copied) throw new Error('浏览器不支持复制')
    }
    showToast(successText)
  } catch {
    showToast('复制失败，请长按后手动复制')
  }
}

function copyInviteCode() {
  return copyText(invitation.value?.memberInviteCode, '邀请码已复制')
}

function copyInviteLink() {
  return copyText(inviteLink.value, '邀请链接已复制')
}

function shareOptions(data = leaderData.value) {
  const groupName = String(data?.group?.name || '任务团队').trim()
  return {
    title: `邀请加入${groupName}`,
    desc: '完成平台互动任务可获得收益，点击加入团队。',
    // 仅分享时增加 shareV；复制链接仍保持原邀请码链接，避免影响既有使用习惯。
    link: withShareCacheVersion(inviteLink.value),
    imgUrl: DEFAULT_SHARE_IMAGE,
  }
}

async function configureShareCard(data = leaderData.value) {
  if (!data || !inviteLink.value) return
  await setupInviteWechatShare(shareOptions(data))
}

async function shareInvite() {
  if (!inviteLink.value) {
    showToast('邀请链接生成失败，请稍后重试')
    return
  }
  sharing.value = true
  try {
    await configureShareCard()
    if (isWeChatBrowser()) {
      showWechatShareMenu()
      showToast('邀请卡片已生成，请点击右上角“···”分享')
      return
    }
    await copyInviteLink()
  } finally {
    sharing.value = false
  }
}

function goBack() {
  if (window.history.length > 1) {
    router.back()
    return
  }
  router.replace({ path: '/', query: { tab: 'profile' } })
}

onMounted(() => {
  void loadData()
})
</script>

<style scoped>
.leader-shell { min-height: 100dvh; padding: 0 16px calc(28px + env(safe-area-inset-bottom)); background: linear-gradient(180deg, #ecfdf3 0, #f6f8fb 280px, #f6f8fb 100%); color: #0f172a; }
.leader-topbar { height: 58px; display: flex; align-items: center; justify-content: space-between; }
.leader-topbar h1 { margin: 0; font-size: 18px; line-height: 24px; font-weight: 900; }
.back-btn, .refresh-btn { border: 0; background: transparent; color: #334155; font-size: 13px; font-weight: 800; }
.back-btn { display: inline-flex; width: 38px; height: 38px; align-items: center; justify-content: center; border-radius: 12px; background: rgba(255,255,255,.72); }
.refresh-btn { display: inline-flex; align-items: center; gap: 4px; padding: 8px 4px; }
.refresh-btn:disabled { opacity: .55; }
.leader-hero { padding: 18px 18px 20px; border-radius: 24px; background: linear-gradient(135deg, #0aa75c, #07c160 58%, #48d597); color: #fff; box-shadow: 0 16px 30px rgba(7,193,96,.22); }
.hero-eyebrow, .section-head span { display: block; font-size: 12px; font-weight: 900; letter-spacing: .04em; }
.leader-hero h2 { margin: 8px 0 5px; font-size: 25px; line-height: 32px; font-weight: 950; }
.leader-hero p { margin: 0; color: rgba(255,255,255,.78); font-size: 13px; }
.summary-card, .range-card, .invite-card, .leader-loading-card, .leader-error-card { margin-top: 14px; border: 1px solid rgba(226,232,240,.86); border-radius: 22px; background: rgba(255,255,255,.96); box-shadow: 0 10px 28px rgba(15,23,42,.05); }
.summary-card, .range-card, .invite-card { padding: 17px; }
.leader-loading-card, .leader-error-card { padding: 24px 16px; }
.section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.section-head span { color: #16a34a; }
.section-head h3 { margin: 5px 0 0; font-size: 17px; line-height: 23px; font-weight: 950; }
.section-head small { margin-top: 6px; color: #94a3b8; font-size: 11px; white-space: nowrap; }
.summary-grid, .period-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; margin-top: 16px; }
.summary-grid > div, .period-grid > div { min-width: 0; padding: 12px 9px; border-radius: 16px; background: #f8fafc; }
.summary-grid span, .period-grid span { display: block; overflow: hidden; color: #64748b; font-size: 11px; line-height: 17px; text-overflow: ellipsis; white-space: nowrap; }
.summary-grid strong, .period-grid strong { display: block; overflow: hidden; margin-top: 5px; color: #0f172a; font-size: 19px; line-height: 25px; font-weight: 950; text-overflow: ellipsis; white-space: nowrap; }
.summary-grid small, .period-grid small { margin-left: 2px; color: #94a3b8; font-size: 11px; font-weight: 800; }
.summary-grid strong.money, .period-grid strong.money { color: #16a34a; font-size: 16px; }
.range-tabs { display: flex; gap: 7px; overflow-x: auto; margin: 15px -1px 0; padding-bottom: 1px; scrollbar-width: none; }
.range-tabs::-webkit-scrollbar { display: none; }
.range-tabs button { flex: 0 0 auto; min-width: 58px; height: 32px; border: 1px solid #e2e8f0; border-radius: 999px; background: #fff; color: #64748b; font-size: 12px; font-weight: 850; }
.range-tabs button.active { border-color: #07c160; background: #ecfdf3; color: #159447; }
.custom-range { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; align-items: end; margin-top: 14px; }
.custom-range label { min-width: 0; }
.custom-range label span { display: block; margin: 0 0 5px 2px; color: #64748b; font-size: 11px; font-weight: 800; }
.custom-range input { width: 100%; height: 36px; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; padding: 0 7px; color: #334155; font-size: 11px; outline: none; }
.custom-range input:focus { border-color: #07c160; }
.custom-range button { height: 36px; border: 0; border-radius: 10px; background: #07c160; color: #fff; padding: 0 11px; font-size: 12px; font-weight: 900; }
.custom-range button:disabled { opacity: .55; }
.period-grid { margin-top: 14px; }
.range-tip, .share-tip { margin: 12px 0 0; color: #94a3b8; font-size: 11px; line-height: 18px; }
.invite-code-box { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 15px; padding: 14px; border-radius: 16px; background: linear-gradient(135deg, #ecfdf3, #f7fef9); }
.invite-code-box span, .invite-link-box > span { display: block; color: #64748b; font-size: 11px; font-weight: 800; }
.invite-code-box strong { display: block; margin-top: 4px; color: #16a34a; font-size: 22px; letter-spacing: .08em; font-weight: 950; }
.invite-code-box button, .invite-link-box button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; flex: 0 0 auto; height: 32px; border: 0; border-radius: 999px; background: #fff; color: #159447; padding: 0 11px; font-size: 12px; font-weight: 900; box-shadow: 0 4px 10px rgba(22,163,74,.1); }
.invite-link-box { margin-top: 11px; padding: 13px 14px; border-radius: 16px; background: #f8fafc; }
.invite-link-box p { margin: 6px 0 11px; overflow: hidden; color: #475569; font-size: 12px; line-height: 18px; text-overflow: ellipsis; white-space: nowrap; }
.share-btn { display: flex; width: 100%; height: 46px; align-items: center; justify-content: center; gap: 7px; margin-top: 14px; border: 0; border-radius: 14px; background: #07c160; color: #fff; font-size: 15px; font-weight: 950; box-shadow: 0 10px 18px rgba(7,193,96,.18); }
.share-btn:disabled { opacity: .58; }
.leader-error-card button { display: block; width: 140px; height: 38px; margin: 0 auto; border: 0; border-radius: 999px; background: #07c160; color: #fff; font-size: 13px; font-weight: 900; }
@media (max-width: 360px) { .leader-shell { padding-left: 12px; padding-right: 12px; } .summary-card, .range-card, .invite-card { padding: 14px; } .summary-grid, .period-grid { gap: 6px; } .summary-grid > div, .period-grid > div { padding: 10px 7px; } .custom-range { grid-template-columns: 1fr 1fr; } .custom-range button { grid-column: 1 / -1; } }
</style>
