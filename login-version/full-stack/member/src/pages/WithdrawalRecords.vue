<template>
  <main class="records-shell">
    <section class="records-page">
      <section class="hero-card">
        <header class="hero-head">
          <button type="button" class="back-btn" @click="router.back()"><van-icon name="arrow-left" /></button>
          <div class="hero-title">
            <span>微信零钱</span>
            <h1>提现记录</h1>
          </div>
          <button type="button" class="refresh-btn" :disabled="loading" @click="refreshAll">刷新</button>
        </header>

        <section class="summary-card">
          <div class="summary-item available">
            <span>可提现</span>
            <strong>¥{{ formatCent(availableAmount) }}</strong>
          </div>
          <div class="summary-item pending">
            <span>提现中</span>
            <strong>¥{{ formatCent(pendingAmount) }}</strong>
          </div>
          <div class="summary-item success">
            <span>已提现</span>
            <strong>¥{{ formatCent(withdrawnAmount) }}</strong>
          </div>
        </section>
      </section>

      <section class="record-card">
        <div class="record-title">
          <div>
            <h2>全部记录</h2>
            <p>共 {{ total }} 笔提现申请</p>
          </div>
          <span class="record-total">{{ total }} 笔</span>
        </div>

        <van-loading v-if="loading && !records.length" class="loading" size="22" />
        <van-empty v-else-if="!records.length" description="暂无提现记录" />

        <article v-for="item in records" :key="item.id" class="record-item">
          <div class="record-main">
            <div class="record-amount-block">
              <strong>¥{{ formatCent(item.amount) }}</strong>
              <span>{{ formatDate(item.createdAt) }}</span>
            </div>
            <em :class="['status-pill', statusClass(item.status)]">{{ item.statusLabel || statusText(item.status) }}</em>
          </div>
          <p v-if="item.rejectReason" class="reason">拒绝原因：{{ item.rejectReason }}</p>
          <p v-else-if="item.failReason" class="reason">失败原因：{{ item.failReason }}</p>
          <p v-else class="desc">单号：{{ item.outBillNo || item.id }}</p>
          <div v-if="item.canMockConfirm || item.canRequestMerchantTransfer || item.canCancelWithdrawal" class="record-actions">
            <button v-if="item.canMockConfirm" type="button" :disabled="confirmingId === item.id" @click="mockConfirm(item)">
              模拟确认收款
            </button>
            <button v-if="item.canRequestMerchantTransfer" type="button" class="primary" :disabled="confirmingId === item.id" @click="requestMerchantTransfer(item)">
              确认收款
            </button>
            <button v-if="item.canCancelWithdrawal" type="button" class="danger" :disabled="confirmingId === item.id" @click="cancelWithdrawal(item)">
              取消申请
            </button>
          </div>
        </article>

        <button v-if="hasMore" class="load-more" type="button" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? '加载中...' : '加载更多' }}
        </button>
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { cancelDistributionWithdrawal, getDistributionMe, getDistributionWithdrawals, mockConfirmDistributionWithdrawal, syncDistributionWithdrawal } from '@/api'
import { invokeMerchantTransfer } from '@/services/wechatTransfer'

const router = useRouter()
const PAGE_SIZE = 10
const me = ref<any>(null)
const records = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const loadingMore = ref(false)
const confirmingId = ref('')
const autoSyncingIds = ref<Record<string, boolean>>({})

const availableAmount = computed(() => Number(me.value?.stats?.availableWithdrawalAmount ?? me.value?.stats?.balanceAmount ?? 0))
const pendingAmount = computed(() => Number(me.value?.stats?.pendingWithdrawalAmount ?? 0))
const withdrawnAmount = computed(() => Number(me.value?.stats?.withdrawnAmount ?? 0))
const hasMore = computed(() => records.value.length < total.value)

function unwrap(resp: any) {
  return resp?.data ?? resp
}

function formatCent(value: any) {
  return (Number(value || 0) / 100).toFixed(2)
}

function formatDate(value: any) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function statusText(status: string) {
  const map: Record<string, string> = {
    PENDING: '待审核',
    APPROVED: '已通过/待打款',
    WAIT_USER_CONFIRM: '待确认收款',
    PROCESSING: '打款处理中',
    PAID: '已打款',
    REJECTED: '已拒绝',
    FAILED: '打款失败',
    CANCELLED: '已撤销',
    EXPIRED: '已过期',
  }
  return map[String(status || '').toUpperCase()] || status || '-'
}

function statusClass(status: string) {
  const value = String(status || '').toUpperCase()
  if (value === 'PAID') return 'success'
  if (['REJECTED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(value)) return 'danger'
  if (['WAIT_USER_CONFIRM', 'PROCESSING', 'APPROVED'].includes(value)) return 'warning'
  return 'pending'
}

function getErrorMessage(e: any, fallback = '操作失败，请稍后重试') {
  const msg = e?.response?.data?.message || e?.response?.data?.msg || e?.message || fallback
  return Array.isArray(msg) ? msg.join('；') : msg
}

async function loadMe() {
  me.value = unwrap(await getDistributionMe())
}

async function loadRecords(reset = false) {
  if (reset) {
    page.value = 1
    records.value = []
  }
  const data = unwrap(await getDistributionWithdrawals({ page: page.value, pageSize: PAGE_SIZE }))
  const list = Array.isArray(data?.items) ? data.items : []
  total.value = Number(data?.total || list.length || 0)
  records.value = reset ? list : records.value.concat(list)
  page.value += 1
  if (reset) autoSyncLatestWechatActive()
}

async function refreshAll() {
  loading.value = true
  try {
    await Promise.all([loadMe(), loadRecords(true)])
  } catch (e) {
    showToast(getErrorMessage(e, '加载失败，请稍后重试'))
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  try {
    await loadRecords(false)
  } catch (e) {
    showToast(getErrorMessage(e, '加载失败，请稍后重试'))
  } finally {
    loadingMore.value = false
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function isFinalWithdrawalStatus(status: any) {
  return ['PAID', 'REJECTED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(String(status || '').toUpperCase())
}

function isWechatActiveWithdrawal(item: any) {
  const status = String(item?.status || '').toUpperCase()
  return item?.transferMode === 'WECHAT' && ['WAIT_USER_CONFIRM', 'PROCESSING', 'APPROVED'].includes(status)
}

function patchRecord(latest: any) {
  if (!latest?.id) return
  const index = records.value.findIndex((item) => item.id === latest.id)
  if (index >= 0) records.value[index] = { ...records.value[index], ...latest }
}

async function syncRecordOnce(item: any, silent = true) {
  if (!item?.id || autoSyncingIds.value[item.id]) return null
  autoSyncingIds.value = { ...autoSyncingIds.value, [item.id]: true }
  try {
    const latest = unwrap(await syncDistributionWithdrawal(item.id))
    patchRecord(latest)
    return latest
  } catch (e) {
    if (!silent) showToast(getErrorMessage(e, '同步失败，请稍后重试'))
    return null
  } finally {
    const next = { ...autoSyncingIds.value }
    delete next[item.id]
    autoSyncingIds.value = next
  }
}

async function pollWithdrawalStatus(item: any, maxAttempts = 8) {
  let latest: any = null
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) await sleep(1800)
    latest = await syncRecordOnce(item, true)
    if (isFinalWithdrawalStatus(latest?.status)) break
  }
  await refreshAll()
  return latest
}

function autoSyncLatestWechatActive() {
  const target = records.value.find((item) => isWechatActiveWithdrawal(item))
  if (!target) return
  syncRecordOnce(target, true).then((latest) => {
    if (latest && String(latest.status || '').toUpperCase() !== String(target.status || '').toUpperCase()) {
      refreshAll()
    }
  })
}

async function mockConfirm(item: any) {
  confirmingId.value = item.id
  try {
    await mockConfirmDistributionWithdrawal(item.id)
    showToast('模拟确认完成')
    await refreshAll()
  } catch (e) {
    showToast(getErrorMessage(e, '模拟确认失败'))
  } finally {
    confirmingId.value = ''
  }
}

async function cancelWithdrawal(item: any) {
  try {
    await showConfirmDialog({
      title: '取消提现申请',
      message: '确认取消这笔提现申请？取消后冻结金额会退回可提现余额。',
      confirmButtonText: '确认取消',
      cancelButtonText: '再想想',
    })
  } catch {
    return
  }
  confirmingId.value = item.id
  try {
    await cancelDistributionWithdrawal(item.id)
    showToast('已取消提现申请')
    await refreshAll()
  } catch (e) {
    showToast(getErrorMessage(e, '取消失败'))
  } finally {
    confirmingId.value = ''
  }
}

async function requestMerchantTransfer(item: any) {
  if (!item.transferPackageInfo || !item.transferMchId || !item.transferAppId) {
    showToast('缺少微信确认收款参数')
    return
  }
  confirmingId.value = item.id
  try {
    const result = await invokeMerchantTransfer({
      mchId: item.transferMchId,
      appId: item.transferAppId,
      packageInfo: item.transferPackageInfo,
    })
    if (result.ok) {
      showToast('已确认收款，正在同步到账状态...')
      const latest = await pollWithdrawalStatus(item)
      if (String(latest?.status || '').toUpperCase() === 'PAID') {
        showToast('提现成功')
      } else if (isFinalWithdrawalStatus(latest?.status)) {
        showToast(latest?.failReason || latest?.rejectReason || '提现已结束')
      } else {
        showToast('微信已确认，系统正在同步到账状态')
      }
    } else if (result.cancelled) {
      showToast('你还没有完成收款确认')
    } else {
      showToast(result.message || '确认收款未完成，请稍后重试')
    }
  } finally {
    confirmingId.value = ''
  }
}

onMounted(refreshAll)
</script>

<style scoped>
.records-shell {
  min-height: 100dvh;
  background: #ffffff;
  padding: 14px 14px calc(30px + env(safe-area-inset-bottom));
  color: #18352b;
}
.records-page {
  min-height: calc(100dvh - 28px - env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.hero-card,
.record-card {
  border-radius: 24px;
  background: #ffffff;
  border: 1px solid #e3ece6;
  box-shadow: 0 10px 26px rgba(16, 24, 40, 0.05);
}
.hero-card {
  padding: 16px;
  background: linear-gradient(180deg, #fcfffd 0%, #f5faf7 100%);
}
.hero-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.hero-title {
  flex: 1;
  min-width: 0;
  text-align: center;
}
.hero-title span {
  display: block;
  margin-bottom: 3px;
  color: #6a8479;
  font-size: 12px;
  font-weight: 700;
}
.hero-title h1 {
  margin: 0;
  color: #18352b;
  font-size: 22px;
  line-height: 28px;
  font-weight: 900;
}
.back-btn,
.refresh-btn {
  flex: none;
  border: 0;
  border-radius: 999px;
  transition: transform .16s ease, opacity .16s ease;
}
.back-btn {
  width: 36px;
  height: 36px;
  background: #ffffff;
  color: #3b584c;
  box-shadow: inset 0 0 0 1px #e5ede8;
}
.refresh-btn {
  height: 34px;
  padding: 0 14px;
  background: #f0f7ff;
  color: #156c96;
  font-size: 12px;
  font-weight: 800;
}
.refresh-btn:disabled,
.back-btn:disabled {
  opacity: .5;
}
.summary-card {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}
.summary-item {
  border-radius: 18px;
  padding: 12px 10px;
  text-align: center;
  border: 1px solid #e6eeea;
  background: #ffffff;
}
.summary-item span {
  display: block;
  color: #6b857a;
  font-size: 11px;
  font-weight: 700;
}
.summary-item strong {
  display: block;
  margin-top: 6px;
  font-size: 18px;
  line-height: 22px;
  font-weight: 850;
}
.summary-item.available {
  background: linear-gradient(180deg, #fcfffd 0%, #f4faf7 100%);
}
.summary-item.available strong { color: #08a652; }
.summary-item.pending {
  background: linear-gradient(180deg, #fffdf9 0%, #fff7ea 100%);
}
.summary-item.pending strong { color: #d97706; }
.summary-item.success {
  background: linear-gradient(180deg, #fcfffd 0%, #f2faf5 100%);
}
.summary-item.success strong { color: #08a652; }
.record-card {
  flex: 1;
  min-height: 0;
  padding: 16px 14px;
}
.record-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.record-title h2 {
  margin: 0;
  color: #18352b;
  font-size: 18px;
  line-height: 24px;
  font-weight: 900;
}
.record-title p {
  margin: 4px 0 0;
  color: #7b9388;
  font-size: 12px;
}
.record-total {
  flex: none;
  align-self: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: #f6faf8;
  color: #728c80;
  font-size: 12px;
  line-height: 28px;
  font-weight: 800;
}
.loading {
  display: flex;
  justify-content: center;
  padding: 36px 0;
}
.record-item {
  border-radius: 18px;
  background: #ffffff;
  border: 1px solid #e7efea;
  padding: 14px;
  margin-top: 10px;
}
.record-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.record-amount-block strong {
  display: block;
  color: #08a652;
  font-size: 22px;
  line-height: 28px;
  font-weight: 900;
}
.record-amount-block span {
  display: block;
  margin-top: 4px;
  color: #7b9388;
  font-size: 12px;
}
.status-pill {
  flex: none;
  min-height: 30px;
  border-radius: 999px;
  padding: 0 12px;
  font-style: normal;
  font-size: 12px;
  line-height: 30px;
  font-weight: 900;
}
.status-pill.pending { background: #f2f6f4; color: #587467; }
.status-pill.warning { background: #fff6ea; color: #d97706; }
.status-pill.success { background: #eaf8ef; color: #08a652; }
.status-pill.danger { background: #fff1f1; color: #df4c4c; }
.desc,
.reason {
  margin: 9px 0 0;
  color: #6e887c;
  font-size: 12px;
  line-height: 18px;
  word-break: break-all;
}
.reason { color: #d45a5a; }
.record-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}
.record-actions button,
.load-more {
  width: 100%;
  height: 40px;
  border: 0;
  border-radius: 999px;
  background: #f3f8f5;
  color: #294439;
  font-size: 14px;
  font-weight: 900;
}
.record-actions button.primary {
  background: linear-gradient(135deg, #07c160 0%, #08b95b 100%);
  color: #fff;
  box-shadow: 0 10px 18px rgba(7, 193, 96, 0.18);
}
.record-actions button.danger {
  background: #fff3f3;
  color: #d93025;
}
.load-more {
  margin-top: 12px;
  background: #f8fbf9;
  box-shadow: inset 0 0 0 1px #e5ede8;
}
.record-actions button:disabled,
.load-more:disabled {
  opacity: .5;
}
.back-btn:active,
.refresh-btn:active,
.record-actions button:active,
.load-more:active {
  transform: scale(.98);
}
@media (min-width: 520px) {
  .records-shell { max-width: 430px; margin: 0 auto; }
}
</style>
