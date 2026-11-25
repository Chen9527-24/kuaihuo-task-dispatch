<template>
  <main class="withdraw-shell">
    <section class="withdraw-page">
      <section class="wallet-card">
        <div class="wallet-head">
          <div class="wallet-title-wrap">
            <span class="wallet-tag">微信零钱提现</span>
            <h1>账户余额</h1>
          </div>
          <button type="button" class="wallet-record-btn" @click="goRecords">提现记录</button>
        </div>

        <div class="wallet-balance">
          <span>可提现余额</span>
          <strong>¥{{ formatCent(availableAmount) }}</strong>
        </div>

        <div class="wallet-stats">
          <div class="wallet-stat pending">
            <span>提现中</span>
            <strong>¥{{ formatCent(pendingAmount) }}</strong>
          </div>
          <div class="wallet-stat success">
            <span>已提现</span>
            <strong>¥{{ formatCent(withdrawnAmount) }}</strong>
          </div>
        </div>
      </section>

      <section class="action-card">
        <div class="action-head">
          <div class="action-title-wrap">
            <strong>输入本次提现金额</strong>
            <button type="button" class="help-trigger" @click="rulesVisible = true">
              <van-icon name="question-o" size="15" />
            </button>
          </div>
          <button type="button" class="refresh-btn" :disabled="loading" @click="refreshAll">刷新余额</button>
        </div>

        <div class="amount-panel">
          <div class="amount-field">
            <span class="currency-symbol">¥</span>
            <input
              v-model="amountInput"
              type="text"
              inputmode="decimal"
              placeholder="请输入提现金额"
              @input="normalizeAmountInput"
              @blur="normalizeAmountOnBlur"
            />
          </div>
          <button type="button" class="all-btn" @click="fillAll">全部</button>
        </div>
        <div class="amount-limit-hint">单次提现最低0.1元，最高200元。</div>

        <div class="channel-row">
          <span>收款方式</span>
          <strong>微信零钱</strong>
        </div>
        <div class="hint-row">
          提交后会先占用可提现余额；微信确认页调起成功不代表已到账，最终结果以微信回调/后台查单为准。
        </div>

        <button class="submit-btn" type="button" :disabled="submitting || loading" @click="submitWithdrawal">
          {{ submitting ? '提交中...' : '提交提现申请' }}
        </button>
      </section>
    </section>

    <van-popup v-model:show="rulesVisible" round position="bottom" class="rules-popup">
      <section class="rules-panel">
        <div class="rules-title">
          <div>
            <span>提现说明</span>
            <h3>微信零钱提现规则</h3>
          </div>
          <button type="button" class="rules-close" @click="rulesVisible = false">
            <van-icon name="cross" size="16" />
          </button>
        </div>

        <div class="rules-list">
          <article>
            <strong>1. 收款方式</strong>
            <p>当前仅支持提现到微信零钱。</p>
          </article>
          <article>
            <strong>2. 提现限制</strong>
            <p>同一时间只能存在一笔待处理提现申请。</p>
          </article>
          <article>
            <strong>3. 余额占用</strong>
            <p>提交后会占用可提现余额；后台拒绝或打款失败后，金额会自动释放回可提现余额。</p>
          </article>
          <article>
            <strong>4. 收款确认</strong>
            <p>微信模式下提交后会调起确认收款页；若未弹出，可到提现记录中继续确认。</p>
          </article>
          <article>
            <strong>5. 到账说明</strong>
            <p>前端确认成功只代表确认流程完成，提现成功以微信支付回调或后台查单结果为准。</p>
          </article>
        </div>

        <button type="button" class="rules-confirm" @click="rulesVisible = false">我知道了</button>
      </section>
    </van-popup>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { invokeMerchantTransfer, isMerchantTransferRuntimeSupported } from '@/services/wechatTransfer'
import { createDistributionWithdrawal, getDistributionMe, syncDistributionWithdrawal } from '@/api'

declare global {
  interface Window {
    WeixinJSBridge?: {
      invoke: (name: string, payload: Record<string, any>, callback: (res: any) => void) => void
    }
  }
}

const router = useRouter()
const me = ref<any>(null)
const loading = ref(false)
const submitting = ref(false)
const rulesVisible = ref(false)
const amountInput = ref('')
const MIN_WITHDRAW_FEN = 10
const MAX_WITHDRAW_FEN = 20000
const MAX_WITHDRAW_YUAN = '200'

const availableAmount = computed(() => Number(me.value?.stats?.availableWithdrawalAmount ?? me.value?.stats?.balanceAmount ?? 0))
const pendingAmount = computed(() => Number(me.value?.stats?.pendingWithdrawalAmount ?? 0))
const withdrawnAmount = computed(() => Number(me.value?.stats?.withdrawnAmount ?? 0))

function unwrap(resp: any) {
  return resp?.data ?? resp
}

function formatCent(value: any) {
  return (Number(value || 0) / 100).toFixed(2)
}

function normalizeAmountInput() {
  let value = amountInput.value.replace(/[^0-9.]/g, '')
  const firstDot = value.indexOf('.')
  if (firstDot >= 0) {
    value = value.slice(0, firstDot + 1) + value.slice(firstDot + 1).replace(/\./g, '')
    const [integer, decimal = ''] = value.split('.')
    value = `${integer}.${decimal.slice(0, 2)}`
  }
  value = value.replace(/^0+(?=\d)/, '')
  const amount = yuanToFen(value)
  if (amount > MAX_WITHDRAW_FEN) {
    amountInput.value = MAX_WITHDRAW_YUAN
    showToast('单次提现最高200')
    return
  }
  amountInput.value = value
}

function normalizeAmountOnBlur() {
  const amount = yuanToFen(amountInput.value)
  if (!amount) return
  if (amount < MIN_WITHDRAW_FEN) {
    amountInput.value = '0.1'
    return
  }
  if (amount > MAX_WITHDRAW_FEN) {
    amountInput.value = MAX_WITHDRAW_YUAN
    showToast('单次提现最高200')
  }
}

function yuanToFen(value: string) {
  const raw = String(value || '').trim()
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return 0
  const [integer, decimal = ''] = raw.split('.')
  return Number(integer) * 100 + Number(decimal.padEnd(2, '0'))
}

function fillAll() {
  const fen = availableAmount.value
  if (fen <= 0) {
    showToast('当前暂无可提现余额')
    return
  }
  const withdrawFen = Math.min(fen, MAX_WITHDRAW_FEN)
  if (fen > MAX_WITHDRAW_FEN) showToast('单次提现最高200')
  const yuan = withdrawFen / 100
  amountInput.value = Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function getErrorMessage(e: any, fallback = '操作失败，请稍后重试') {
  const msg = e?.response?.data?.message || e?.response?.data?.msg || e?.message || fallback
  return Array.isArray(msg) ? msg.join('；') : msg
}

async function loadMe() {
  me.value = unwrap(await getDistributionMe())
}

async function refreshAll() {
  loading.value = true
  try {
    await loadMe()
  } catch (e) {
    showToast(getErrorMessage(e, '加载失败，请稍后重试'))
  } finally {
    loading.value = false
  }
}

async function submitWithdrawal() {
  const amount = yuanToFen(amountInput.value)
  if (amount <= 0) {
    showToast('请输入正确的提现金额')
    return
  }
  if (amount < MIN_WITHDRAW_FEN) {
    showToast('单次提现最低0.1')
    return
  }
  if (amount > MAX_WITHDRAW_FEN) {
    amountInput.value = MAX_WITHDRAW_YUAN
    showToast('单次提现最高200')
    return
  }
  if (amount > availableAmount.value) {
    showToast('提现金额不能超过可提现余额')
    return
  }
  if (!isMerchantTransferRuntimeSupported()) {
    showToast('请使用手机微信打开测试/正式 H5 域名后再申请微信提现')
    return
  }
  submitting.value = true
  try {
    const result = unwrap(await createDistributionWithdrawal({ amount, remark: '提现到微信零钱' }))
    amountInput.value = ''
    if (result?.canRequestMerchantTransfer || result?.transferPackageInfo || result?.package_info) {
      await requestMerchantTransfer(result)
    } else {
      showToast(result?.status === 'PENDING' ? '提现申请已提交，等待审核' : '提现申请已提交')
    }
    await refreshAll()
  } catch (e) {
    showToast(getErrorMessage(e, '提交失败，请稍后重试'))
  } finally {
    submitting.value = false
  }
}


function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function isFinalWithdrawalStatus(status: any) {
  return ['PAID', 'REJECTED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(String(status || '').toUpperCase())
}

async function syncWithdrawalStatus(id: string, maxAttempts = 8) {
  let latest: any = null
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) await sleep(1800)
    latest = unwrap(await syncDistributionWithdrawal(id))
    if (isFinalWithdrawalStatus(latest?.status)) break
  }
  return latest
}

async function requestMerchantTransfer(item: any) {
  const packageInfo = item?.transferPackageInfo || item?.package_info
  const mchId = item?.transferMchId || item?.mch_id
  const appId = item?.transferAppId || item?.app_id
  if (!packageInfo || !mchId || !appId) {
    showToast('提现申请已提交，请到提现记录中查看进度')
    return
  }
  const result = await invokeMerchantTransfer({ mchId, appId, packageInfo })
  if (result.ok) {
    showToast('已确认收款，正在同步到账状态...')
    try {
      const latest = await syncWithdrawalStatus(item.id)
      if (String(latest?.status || '').toUpperCase() === 'PAID') {
        showToast('提现成功')
      } else if (isFinalWithdrawalStatus(latest?.status)) {
        showToast(latest?.failReason || latest?.rejectReason || '提现已结束，请查看提现记录')
      } else {
        showToast('微信已确认，系统正在同步到账状态')
      }
    } catch (e) {
      showToast('微信已确认，状态同步稍有延迟，请稍后刷新记录')
    }
  } else if (result.cancelled) {
    showToast('你还没有完成收款确认，可到提现记录继续确认')
  } else {
    showToast(result.message || '确认收款未完成，可到提现记录稍后重试')
  }
}

function goRecords() {
  router.push('/withdrawals/records')
}

onMounted(refreshAll)
</script>

<style scoped>
.withdraw-shell {
  min-height: 100dvh;
  background: #ffffff;
  padding: 14px 14px calc(30px + env(safe-area-inset-bottom));
  color: #133128;
}
.withdraw-page {
  min-height: calc(100dvh - 28px - env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.wallet-card,
.action-card {
  border-radius: 24px;
  overflow: hidden;
  border: 1px solid #e3ece6;
  box-shadow: 0 10px 26px rgba(16, 24, 40, 0.05);
}
.wallet-card {
  position: relative;
  padding: 18px 16px 16px;
  background: linear-gradient(180deg, #fcfffd 0%, #f4faf7 100%);
}
.wallet-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(7, 193, 96, 0.04), transparent 42%);
  pointer-events: none;
}
.wallet-head,
.wallet-balance,
.wallet-stats {
  position: relative;
  z-index: 1;
}
.wallet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.wallet-title-wrap {
  min-width: 0;
}
.wallet-tag {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: #e8f7ef;
  color: #08a652;
  font-size: 11px;
  font-weight: 800;
}
.wallet-head h1 {
  margin: 10px 0 0;
  color: #18352b;
  font-size: 22px;
  line-height: 28px;
  font-weight: 900;
}
.wallet-record-btn,
.refresh-btn,
.help-trigger,
.all-btn,
.rules-close,
.rules-confirm {
  border: 0;
  border-radius: 999px;
  transition: transform .16s ease, opacity .16s ease;
}
.wallet-record-btn {
  flex: none;
  height: 32px;
  padding: 0 14px;
  background: #f0f7ff;
  color: #156c96;
  font-size: 12px;
  font-weight: 800;
}
.wallet-balance {
  margin-top: 18px;
}
.wallet-balance span,
.wallet-stat span,
.channel-row span {
  display: block;
  color: #6b857a;
  font-size: 12px;
  font-weight: 700;
}
.wallet-balance strong {
  display: block;
  margin-top: 8px;
  color: #0d8b48;
  font-size: 36px;
  line-height: 42px;
  font-weight: 900;
  letter-spacing: -0.02em;
}
.wallet-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-top: 16px;
}
.wallet-stat {
  border-radius: 18px;
  padding: 12px 14px;
  border: 1px solid #e4eee8;
  background: rgba(255, 255, 255, 0.92);
}
.wallet-stat strong {
  display: block;
  margin-top: 6px;
  font-size: 20px;
  line-height: 24px;
  font-weight: 850;
}
.wallet-stat.pending strong { color: #d97706; }
.wallet-stat.success strong { color: #08a652; }
.action-card {
  padding: 16px;
  flex: 1;
  min-height: 0;
  background: #ffffff;
}
.action-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.action-title-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.action-title-wrap strong {
  color: #18352b;
  font-size: 16px;
  line-height: 22px;
  font-weight: 900;
}
.help-trigger {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  background: #eef8f2;
  color: #08a652;
  box-shadow: inset 0 0 0 1px rgba(7, 193, 96, 0.16);
}
.refresh-btn {
  flex: none;
  height: 32px;
  padding: 0 12px;
  background: #f7f9f8;
  color: #5d796e;
  font-size: 12px;
  font-weight: 800;
  box-shadow: inset 0 0 0 1px #e6ede9;
}
.amount-panel {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}
.amount-field {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 56px;
  padding: 0 14px;
  border-radius: 18px;
  background: #f8fbf9;
  border: 1px solid #dfeae4;
}
.currency-symbol {
  flex: none;
  color: #08a652;
  font-size: 24px;
  line-height: 1;
  font-weight: 900;
}
.amount-field input {
  flex: 1;
  min-width: 0;
  width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #12834a;
  font-size: 21px;
  line-height: 28px;
  font-weight: 900;
  letter-spacing: -0.01em;
}
.amount-field input::placeholder {
  color: #b3c7bc;
  font-size: 18px;
  font-weight: 700;
}
.all-btn {
  flex: none;
  width: 58px;
  height: 38px;
  background: #e8f7ef;
  color: #08a652;
  font-size: 13px;
  font-weight: 900;
}
.amount-limit-hint {
  margin-top: 8px;
  color: #6a8479;
  font-size: 12px;
  line-height: 18px;
}
.channel-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid #e8f0eb;
}
.channel-row strong {
  color: #18352b;
  font-size: 15px;
  font-weight: 900;
}
.hint-row {
  margin-top: 8px;
  color: #6a8479;
  font-size: 12px;
  line-height: 18px;
}
.submit-btn {
  width: 100%;
  height: 44px;
  margin-top: 18px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, #07c160 0%, #08b95b 100%);
  color: #ffffff;
  font-size: 15px;
  font-weight: 900;
  box-shadow: 0 10px 18px rgba(7, 193, 96, 0.18);
}
.rules-popup {
  overflow: hidden;
  background: transparent;
}
.rules-panel {
  border-radius: 26px 26px 0 0;
  background: #ffffff;
  padding: 18px 16px calc(20px + env(safe-area-inset-bottom));
}
.rules-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.rules-title span {
  color: #6c8276;
  font-size: 12px;
  font-weight: 700;
}
.rules-title h3 {
  margin: 6px 0 0;
  color: #18352b;
  font-size: 18px;
  line-height: 24px;
  font-weight: 900;
}
.rules-close {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  background: #f4f8f6;
  color: #52675d;
}
.rules-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
}
.rules-list article {
  border-radius: 16px;
  background: #f8fbf9;
  border: 1px solid #e7efea;
  padding: 12px 14px;
}
.rules-list strong {
  display: block;
  color: #18352b;
  font-size: 14px;
  font-weight: 900;
}
.rules-list p {
  margin: 6px 0 0;
  color: #62796d;
  font-size: 13px;
  line-height: 20px;
}
.rules-confirm {
  width: 100%;
  height: 42px;
  margin-top: 16px;
  background: #07c160;
  color: #ffffff;
  font-size: 14px;
  font-weight: 900;
}
.wallet-record-btn:active,
.refresh-btn:active,
.help-trigger:active,
.all-btn:active,
.submit-btn:active,
.rules-close:active,
.rules-confirm:active {
  transform: scale(.98);
}
.submit-btn:disabled,
.refresh-btn:disabled,
.wallet-record-btn:disabled,
.all-btn:disabled {
  opacity: .56;
}
@media (min-width: 520px) {
  .withdraw-shell {
    max-width: 430px;
    margin: 0 auto;
  }
}
</style>
