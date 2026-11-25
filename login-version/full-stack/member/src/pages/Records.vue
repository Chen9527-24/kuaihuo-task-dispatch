<template>
  <main class="records-shell">
    <header class="records-topbar">
      <button type="button" class="back-btn" @click="goBack"><van-icon name="arrow-left" size="18" /></button>
      <div>
        <h1>完成记录</h1>
        <p>查看当前任务账号的完成、驳回、结算和放弃记录</p>
      </div>
      <span class="topbar-placeholder"></span>
    </header>

    <section class="record-tabs-wrap">
      <div class="record-tabs">
        <button
          v-for="item in tabs"
          :key="item.value"
          type="button"
          :class="['record-tab', { active: type === item.value }]"
          :style="statusTabStyle(item.value)"
          @click="switchType(item.value)"
        >
          <span>{{ item.label }}</span>
          <em>{{ tabCount(item.value) }}</em>
        </button>
      </div>
    </section>

    <section v-if="activeTaskAccount" class="record-account-card">
      <div>
        <span>当前任务账号</span>
        <strong>{{ activeTaskAccount.nickname || '未命名账号' }}</strong>
        <em>{{ maskPhone(activeTaskAccount.phone) }}</em>
      </div>
      <button type="button" @click="reloadActiveTaskAccount">刷新</button>
    </section>

    <van-pull-refresh
      :key="pullRefreshKey"
      v-model="refreshing"
      :disabled="!canPullRefresh"
      :pull-distance="78"
      :head-height="54"
      @touchstart.capture="preparePullRefresh"
      @touchmove.capture="handlePullMove"
      @touchend.capture="handlePullEnd(() => refreshing)"
      @touchcancel.capture="handlePullEnd(() => refreshing)"
      @refresh="refreshAll"
    >
      <section class="records-content">
        <van-skeleton v-if="firstLoading" title :row="8" class="record-card skeleton" />

        <van-empty v-else-if="!records.length" :description="emptyText" class="empty-card">
          <button class="secondary-btn" type="button" @click="refreshAll">重新加载</button>
        </van-empty>

        <van-list
          v-else
          v-model:loading="loadingMore"
          :finished="finished"
          :immediate-check="false"
          finished-text="没有更多记录了"
          @load="loadMore"
        >
          <section class="record-list">
            <article
              v-for="item in records"
              :key="item.participantId || item.id"
              class="record-card compact-record-card"
              :style="recordCardStyle(item.task?.platform)"
            >
              <div class="record-main">
                <div class="record-meta-line">
                  <span class="platform-pill" :style="recordChipStyle(item.task?.platform)">{{ platformLabel(item.task?.platform) }}</span>
                  <span :class="['record-status', statusClass(item)]">{{ statusLabel(item) }}</span>
                </div>
                <h2>{{ item.task?.title || '未命名任务' }}</h2>
                <p>{{ item.task?.copywriting || '按页面步骤完成互动，提交截图后由运营审核结算。' }}</p>
                <span class="record-time">{{ formatTime(item.rejectedAt || item.abandonedAt || item.settledAt || item.completedAt || item.updatedAt || item.createdAt) }}</span>
                <div v-if="recordKind(item) === 'rejected'" class="reject-panel">
                  <div>
                    <span>驳回原因</span>
                    <p>{{ rejectReasonText(item) }}</p>
                  </div>
                  <button type="button" :disabled="resubmittingId === String(item.participantId || item.id || '')" @click.stop="handleResubmit(item)">重新提交</button>
                </div>
              </div>
              <strong class="record-amount">{{ amountText(item) }}</strong>
            </article>
          </section>
        </van-list>
      </section>
    </van-pull-refresh>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { getDistributionOrders, getDistributionTaskAccounts, resubmitRejectedDistributionTask } from '@/api'
import { useTopPullRefresh } from '@/composables/useTopPullRefresh'
import { getThemeStyleVars, platformLabel } from '@/utils/platform'

const route = useRoute()
const router = useRouter()
const PAGE_SIZE = 10
const COUNT_SCAN_PAGE_SIZE = 100
const MAX_COUNT_SCAN_PAGES = 20
const MAX_LIST_SCAN_PAGES = 80

const records = ref<any[]>([])
const page = ref(1)
const total = ref(0)
const firstLoading = ref(false)
const loadingMore = ref(false)
const refreshing = ref(false)
const finished = ref(false)
const {
  canPullRefresh,
  pullRefreshKey,
  preparePullRefresh,
  handlePullMove,
  handlePullEnd,
  updatePullRefreshState,
} = useTopPullRefresh({
  disabled: () => loadingMore.value || firstLoading.value,
  topThreshold: 2,
})

const tabs = [
  { label: '全部', value: 'all' },
  { label: '已完成', value: 'completed' },
  { label: '已放弃', value: 'abandoned' },
  { label: '已驳回', value: 'rejected' },
  { label: '已结算', value: 'settled' },
]
const counts = ref<Record<string, number>>({ all: 0, completed: 0, abandoned: 0, rejected: 0, settled: 0 })
const taskAccounts = ref<any[]>([])
const activeTaskAccount = ref<any>(null)
const resubmittingId = ref('')
const type = computed(() => {
  const raw = String(route.query.type || 'all')
  const v = raw === 'income' || raw === 'withdrawable' ? 'settled' : raw
  return tabs.some((item) => item.value === v) ? v : 'all'
})
const emptyText = computed(() => {
  if (type.value === 'settled') return '暂无已结算任务'
  if (type.value === 'abandoned') return '暂无已放弃任务'
  if (type.value === 'rejected') return '暂无已驳回任务'
  if (type.value === 'completed') return '暂无已完成未结算任务'
  return '暂无任务记录'
})

function maskPhone(value: unknown) {
  const phone = normalizeRecordPhone(value)
  if (phone.length !== 11) return String(value || '')
  return `${phone.slice(0, 3)}****${phone.slice(7)}`
}

function normalizeRecordPhone(value: unknown) {
  return String(value || '').replace(/[^0-9]/g, '').slice(0, 11)
}

function unwrap(resp: any) {
  return resp?.data ?? resp
}

async function reloadActiveTaskAccount() {
  try {
    const data = unwrap(await getDistributionTaskAccounts())
    const items = Array.isArray(data?.items) ? data.items : []
    taskAccounts.value = items
    activeTaskAccount.value = data?.active || items.find((item: any) => item.isDefault) || items[0] || null
  } catch {
    taskAccounts.value = []
    activeTaskAccount.value = null
  }
  await refreshAll()
}

function statusTabStyle(_value: string) {
  return getThemeStyleVars('general')
}

function recordCardStyle(value: unknown) {
  return getThemeStyleVars(value)
}

function recordChipStyle(value: unknown) {
  return getThemeStyleVars(value)
}

function tabCount(value: string) {
  return Number(counts.value?.[value] ?? 0)
}

function formatCent(value: any) {
  return (Number(value || 0) / 100).toFixed(2)
}

function amountText(item: any) {
  const amount = item?.settlementAmount ?? item?.task?.rewardAmount ?? 0
  return `¥${formatCent(amount)}`
}

function recordKind(item: any): 'completed' | 'settled' | 'abandoned' | 'rejected' | 'other' {
  const status = String(item?.status || '').toUpperCase()
  const settlement = String(item?.settlementStatus || '').toUpperCase()
  if (settlement === 'REJECTED') return 'rejected'
  if (status === 'ABANDONED') return 'abandoned'
  if (status === 'COMPLETED' && settlement === 'SETTLED') return 'settled'
  if (status === 'COMPLETED') return 'completed'
  return 'other'
}

function statusLabel(item: any) {
  const kind = recordKind(item)
  if (kind === 'abandoned') return '已放弃'
  if (kind === 'rejected') return '已驳回'
  if (kind === 'settled') return '已结算'
  if (kind === 'completed') return '已完成'
  return String(item?.status || '').toUpperCase() || '未知状态'
}

function statusClass(item: any) {
  const kind = recordKind(item)
  return kind === 'other' ? '' : kind
}

function apiTypeForCurrentTab() {
  if (type.value === 'settled') return 'settled'
  if (type.value === 'abandoned') return 'abandoned'
  if (type.value === 'rejected') return 'rejected'
  // “已完成”在业务上代表已完成但未结算，因此从全部历史里取数后再前端区分。
  return 'all'
}

function matchesCurrentTab(item: any) {
  const kind = recordKind(item)
  if (type.value === 'all') return kind === 'completed' || kind === 'settled' || kind === 'abandoned' || kind === 'rejected'
  return kind === type.value
}

function isRecordForActiveTaskAccount(item: any) {
  const active = activeTaskAccount.value
  if (!active) return true

  const activeId = String(active?.id || '').trim()
  const itemAccountId = String(item?.taskAccountId || item?.taskAccount?.id || '').trim()
  if (activeId && itemAccountId && activeId === itemAccountId) return true

  const activePhone = normalizeRecordPhone(active?.phone)
  const itemPhone = normalizeRecordPhone(
    item?.taskAccountPhone ||
    item?.phone ||
    item?.visitorPhone ||
    item?.visitor?.phone ||
    item?.taskAccount?.phone ||
    '',
  )
  if (activePhone && itemPhone && activePhone === itemPhone) return true

  // 兼容历史数据：早期任务记录可能没有 taskAccountId；若用户只有一个任务账号，则归到当前账号下展示。
  if (!itemAccountId && taskAccounts.value.length <= 1) return true
  return false
}

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n)
}

function formatTime(input: any) {
  if (!input) return '--'
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return String(input)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function rejectReasonText(item: any) {
  return String(item?.rejectReason || item?.settlementRemark || item?.rejectRemark || '').trim() || '未填写驳回原因'
}

function cacheCurrentTask(value: any) {
  if (!value) return
  try {
    localStorage.setItem('distributionCurrentTask', JSON.stringify({ ...value, __snapshotVersion: 3 }))
  } catch {}
}

async function handleResubmit(item: any) {
  const id = String(item?.participantId || item?.id || '').trim()
  if (!id || resubmittingId.value) return
  resubmittingId.value = id
  try {
    const data = unwrap(await resubmitRejectedDistributionTask(id))
    const currentTask = data?.currentTask || null
    if (currentTask) cacheCurrentTask(currentTask)
    showToast('已进入重新提交流程')
    router.push('/task-current')
  } catch (e: any) {
    const rawMsg = e?.response?.data?.message || e?.response?.data?.msg || e?.message || '重新提交失败，请稍后重试'
    showToast(Array.isArray(rawMsg) ? rawMsg.join('；') : rawMsg)
  } finally {
    resubmittingId.value = ''
  }
}

async function refreshAccountCounts() {
  const nextCounts = { all: 0, completed: 0, abandoned: 0, rejected: 0, settled: 0 }
  let scanPage = 1
  let scanned = 0
  let serverTotal = 0

  while (scanPage <= MAX_COUNT_SCAN_PAGES) {
    const data = unwrap(await getDistributionOrders({ page: scanPage, pageSize: COUNT_SCAN_PAGE_SIZE, type: 'all' }))
    const list = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []
    serverTotal = Number(data?.total || serverTotal || 0)
    scanned += list.length

    for (const item of list) {
      if (!isRecordForActiveTaskAccount(item)) continue
      const kind = recordKind(item)
      if (kind === 'completed' || kind === 'settled' || kind === 'abandoned' || kind === 'rejected') {
        nextCounts.all += 1
        nextCounts[kind] += 1
      }
    }

    if (list.length < COUNT_SCAN_PAGE_SIZE || (serverTotal > 0 && scanned >= serverTotal)) break
    scanPage += 1
  }

  counts.value = nextCounts
  total.value = Number(nextCounts[type.value] ?? nextCounts.all)
}

async function loadRecords(reset = false) {
  if (loadingMore.value && !reset) return
  if (finished.value && !reset) return
  if (reset) {
    page.value = 1
    total.value = 0
    records.value = []
    finished.value = false
    firstLoading.value = true
  }
  loadingMore.value = true
  try {
    if (reset) await refreshAccountCounts()

    const collected: any[] = []
    let exhausted = false
    let scannedPages = 0
    const apiType = apiTypeForCurrentTab()

    while (collected.length < PAGE_SIZE && !exhausted && scannedPages < MAX_LIST_SCAN_PAGES) {
      const data = unwrap(await getDistributionOrders({ page: page.value, pageSize: PAGE_SIZE, type: apiType }))
      const list = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []
      const serverTotal = Number(data?.total || 0)
      scannedPages += 1

      collected.push(...list.filter(isRecordForActiveTaskAccount).filter(matchesCurrentTab))
      page.value += 1

      exhausted = list.length < PAGE_SIZE || (serverTotal > 0 && (page.value - 1) * PAGE_SIZE >= serverTotal)
      if (!list.length) exhausted = true
    }

    records.value = reset ? collected : records.value.concat(collected)
    finished.value = exhausted
  } finally {
    loadingMore.value = false
    firstLoading.value = false
  }
}

async function refreshAll() {
  refreshing.value = true
  try {
    await loadRecords(true)
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.response?.data?.msg || e?.message || '加载失败，请稍后重试'
    showToast(Array.isArray(msg) ? msg.join('；') : msg)
  } finally {
    refreshing.value = false
  }
}

async function loadMore() {
  if (records.value.length < PAGE_SIZE) {
    finished.value = true
    return
  }
  try {
    await loadRecords(false)
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.response?.data?.msg || e?.message || '加载失败，请稍后重试'
    showToast(Array.isArray(msg) ? msg.join('；') : msg)
    loadingMore.value = false
  }
}

function scrollToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
}

function goBack() {
  const from = String(route.query.from || '').trim()
  if (from === 'home' || from === 'profile') {
    router.replace({ path: '/', query: { tab: from } })
    return
  }
  if (window.history.length > 1) router.back()
  else router.replace({ path: '/', query: { tab: 'profile' } })
}

function switchType(next: string) {
  if (next === type.value) {
    scrollToTop()
    return
  }
  router.replace({ path: '/records', query: { type: next, from: route.query.from } })
  nextTick(() => {
    scrollToTop()
    updatePullRefreshState()
  })
}

watch(type, () => {
  updatePullRefreshState()
  refreshAll()
})
onMounted(reloadActiveTaskAccount)
</script>

<style scoped>
.records-shell {
  position: relative;
  box-sizing: border-box;
  min-height: 100dvh;
  padding: 8px 14px 22px;
  background: #f5f7f8;
  color: #0f172a;
}

.records-topbar { display: grid; grid-template-columns: 38px 1fr 38px; align-items: center; gap: 8px; margin-bottom: 8px; }
.back-btn { width: 36px; height: 36px; border: 0; border-radius: 999px; background: #fff; color: #0f172a; display: grid; place-items: center; box-shadow: none; }
.records-topbar h1 { margin: 0; text-align: center; color: #0f172a; font-size: 18px; line-height: 24px; font-weight: 950; }
.records-topbar p { margin: 2px 0 0; text-align: center; color: #94a3b8; font-size: 11px; line-height: 16px; font-weight: 800; }
.topbar-placeholder { width: 36px; height: 36px; }
.record-tabs-wrap { position: sticky; top: 0; z-index: 20; padding: 6px 0 10px; background: rgba(245,247,248,.96); backdrop-filter: blur(12px); }
.record-tabs { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; border-radius: 18px; background: #fff; border: 1px solid #e7ebef; padding: 4px; box-shadow: none; }
.record-tab { height: 31px; border: 0; border-radius: 14px; background: transparent; color: #475569; font-size: 12px; font-weight: 900; display: inline-flex; align-items: center; justify-content: center; gap: 4px; }
.record-tab em { min-width: 16px; height: 16px; border-radius: 999px; background: rgba(100,116,139,.12); color: #64748b; padding: 0 5px; display: inline-flex; align-items: center; justify-content: center; font-style: normal; font-size: 10px; line-height: 16px; font-weight: 950; }
.record-tab.active { background: var(--theme-solid); color: #fff; box-shadow: none; }
.record-tab.active em { background: rgba(255,255,255,.18); color: #fff; }
.record-account-card { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; border: 1px solid #e7ebef; border-radius: 18px; background: #fff; padding: 10px 12px; }
.record-account-card div { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.record-account-card span { color: #94a3b8; font-size: 11px; font-weight: 900; }
.record-account-card strong { color: #0f172a; font-size: 14px; line-height: 18px; }
.record-account-card em { color: #64748b; font-size: 12px; font-style: normal; }
.record-account-card button { flex: none; height: 30px; border: 0; border-radius: 999px; background: #f1f5f9; color: #334155; padding: 0 12px; font-size: 12px; font-weight: 900; }
.records-content { padding-top: 2px; }
.record-list { display: flex; flex-direction: column; gap: 10px; }
.record-card,
.empty-card,
.skeleton { border: 1px solid var(--theme-card-border, #e5e7eb); border-radius: 20px; background: var(--theme-card-bg, #fff); box-shadow: none; backdrop-filter: none; }
.compact-record-card { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 116px; padding: 13px 14px; overflow: hidden; }
.compact-record-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 14px;
  bottom: 14px;
  width: 3px;
  border-radius: 999px;
  background: var(--theme-solid);
  opacity: .34;
}
.record-main { flex: 1; min-width: 0; }
.record-meta-line { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
.platform-pill { border-radius: 999px; background: var(--theme-pill-bg); color: var(--theme-pill-text); padding: 4px 9px; font-size: 11px; font-weight: 900; box-shadow: none; }
.record-status { border-radius: 999px; background: #f1f5f9; color: #64748b; padding: 3px 7px; font-size: 11px; font-weight: 900; }
.record-status.completed { background: #dcfce7; color: #16a34a; }
.record-status.settled { background: #ffedd5; color: #f97316; }
.record-status.abandoned { background: #fee2e2; color: #ef4444; }
.record-status.rejected { background: #fee2e2; color: #dc2626; }
.record-amount { flex: none; align-self: flex-start; color: #f97316; font-size: 17px; line-height: 1; }
.record-card h2 { margin: 10px 0 5px; font-size: 16px; line-height: 22px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.record-card p { margin: 0; color: #64748b; font-size: 12px; line-height: 18px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.record-time { display: block; margin-top: 8px; color: #94a3b8; font-size: 11px; font-weight: 800; }
.reject-panel {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
  border-radius: 14px;
  background: #fff7f7;
  border: 1px solid #fecaca;
  padding: 9px 10px;
}
.reject-panel div { min-width: 0; flex: 1; }
.reject-panel span { display: block; margin-bottom: 3px; color: #dc2626; font-size: 11px; line-height: 15px; font-weight: 950; }
.reject-panel p { margin: 0; color: #7f1d1d; font-size: 12px; line-height: 17px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.reject-panel button { flex: none; height: 30px; border: 0; border-radius: 999px; background: #dc2626; color: #fff; padding: 0 10px; font-size: 12px; font-weight: 950; }
.reject-panel button:disabled { opacity: .55; }
.empty-card { padding: 34px 0; }
.secondary-btn { height: 34px; border: 1px solid #e5e7eb; border-radius: 999px; background: #fff; padding: 0 14px; color: #334155; font-weight: 900; box-shadow: none; }
@media (min-width: 520px) { .records-shell { max-width: 430px; margin: 0 auto; } }
</style>
