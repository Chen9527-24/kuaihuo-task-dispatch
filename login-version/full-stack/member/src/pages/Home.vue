<template>
  <main class="shell">
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
      <section v-if="activeTab === 'home'" class="content home-content">
        <div v-if="sharedTaskId" class="shared-task-heading">
          <strong>分享给你的任务</strong>
          <button type="button" @click="showAllTasks">查看全部任务</button>
        </div>
        <van-skeleton v-if="firstLoading" title :row="8" class="task-card skeleton" />

        <van-empty v-else-if="!tasks.length" :description="sharedTaskId ? '这项任务暂不可领取或不在你的团队范围内' : '当前暂无可领取任务'" class="empty-card">
          <button class="secondary-btn" type="button" @click="refreshAll">重新加载</button>
        </van-empty>

        <van-list
          v-else
          v-model:loading="loadingMore"
          :finished="finished"
          :immediate-check="false"
          finished-text="没有更多任务了"
          @load="loadMoreTasks"
        >
          <section class="task-list">
            <article
              v-for="task in tasks"
              :key="task.id"
              class="task-card compact-task-card"
              :style="taskCardStyle(task.platform)"
            >
              <div class="task-main">
                <div class="task-meta-line">
                  <span class="platform-pill" :style="platformChipStyle(task.platform)">{{ platformLabel(task.platform) }}</span>
                  <span class="remain">剩余 {{ task.availableCommentCount ?? 0 }}/{{ task.targetCommentCount ?? 0 }}</span>
                </div>
                <h3>{{ task.title || '未命名任务' }}</h3>
                <p class="task-desc">{{ task.copywriting || '按页面步骤完成互动，提交截图后由运营审核结算。' }}</p>
              </div>

              <aside class="task-action">
                <strong class="reward">¥{{ formatCent(task.rewardAmount) }}</strong>
                <button
                  class="claim-pill"
                  type="button"
                  :class="taskButtonClass(task)"
                  :style="taskButtonStyle(task)"
                  :disabled="claimingId === task.id"
                  @click="handleTaskAction(task)"
                >
                  {{ taskButtonText(task) }}
                </button>
              </aside>
            </article>
          </section>
        </van-list>
      </section>

      <section v-else class="content profile-content">
        <article class="profile-card">
          <div class="profile-top">
            <div class="profile-avatar">{{ avatarText }}</div>
            <div class="profile-main">
              <p>当前身份 · {{ identityLabel }}</p>
              <h2>{{ me?.user?.nickname || me?.user?.phone || '微信用户' }}</h2>
              <span>{{ me?.user?.phone ? maskPhone(me.user.phone) : '未绑定手机号' }}</span>
            </div>
            <em :class="['profile-status', { danger: statusText !== '正常' }]">{{ statusText }}</em>
          </div>

          <div v-if="bindingInfo" class="team-line">
            <span>当前团队</span>
            <strong>{{ bindingInfo.tenantName || bindingInfo.tenant?.name || '-' }} · {{ bindingInfo.groupName || bindingInfo.group?.name || '-' }}</strong>
          </div>
          <button v-if="activeTaskAccount" class="account-line" type="button" @click="accountSheetVisible = true">
            <span>任务账号</span>
            <strong>{{ activeTaskAccount.nickname }} · {{ maskPhone(activeTaskAccount.phone) }}</strong>
            <van-icon class="click-arrow" name="arrow" size="15" />
          </button>

          <div v-if="!profileCompleted" class="complete-tip">
            <div>
              <strong>资料未完善</strong>
              <span>绑定姓名和手机号后才可以领取任务。</span>
            </div>
            <button type="button" @click="goProfileComplete">去完善 <van-icon name="arrow" size="13" /></button>
          </div>

          <div class="stats-grid">
            <button class="stat-card" type="button" @click="goRecords('settled')">
              <span>收益明细</span>
              <strong>{{ me?.stats?.totalSettledOrders ?? 0 }}<small>单</small></strong>
              <van-icon class="stat-arrow" name="arrow" size="13" />
            </button>
            <button class="stat-card account" type="button" @click.stop="goWithdrawals">
              <span>账户余额</span>
              <strong>¥{{ formatCent(me?.stats?.balanceAmount) }}</strong>
              <van-icon class="stat-arrow" name="arrow" size="13" />
            </button>
            <div class="stat-card readonly">
              <span>今日可放弃</span>
              <strong>{{ me?.stats?.todayRemainingAbandonCount ?? 2 }}<small>次</small></strong>
            </div>
          </div>
        </article>

        <article class="profile-list-card">
          <div class="current-row">
            <button class="current-help" type="button" @click="openCurrentDetail">
              <span>当前任务</span>
              <van-icon name="question-o" size="15" />
              <van-icon class="click-arrow" name="arrow" size="14" />
            </button>
            <div v-if="currentTask" class="current-actions">
              <button class="mini-btn primary" type="button" @click="continueCurrent">继续</button>
              <button class="mini-btn danger" type="button" :disabled="abandoning" @click="requestAbandonCurrent">放弃</button>
            </div>
            <span v-else class="no-current-text">暂无进行中任务</span>
          </div>
          <button v-if="isLeader" class="profile-row" type="button" @click="goLeaderCenter">
            <span>团长中心</span>
            <strong>{{ isActiveLeader ? '团队数据与邀请' : '团长已停用，暂不可操作' }}</strong>
            <van-icon class="click-arrow" name="arrow" size="15" />
          </button>
          <button v-else class="profile-row" type="button" @click="openLeaderApplication">
            <span>申请成为团长</span>
            <strong>{{ leaderApplicationActionText }}</strong>
            <van-icon class="click-arrow" name="arrow" size="15" />
          </button>
          <button class="profile-row" type="button" @click="goRecords('all')">
            <span>完成记录</span>
            <strong>全部状态</strong>
            <van-icon class="click-arrow" name="arrow" size="15" />
          </button>
          <button class="profile-row" type="button" @click="goWithdrawals">
            <span>提现</span>
            <strong>微信零钱 · 可提现 ¥{{ formatCent(me?.stats?.availableWithdrawalAmount ?? me?.stats?.balanceAmount) }}</strong>
            <van-icon class="click-arrow" name="arrow" size="15" />
          </button>
          <button class="profile-row" type="button" @click="refreshAll">
            <span>同步状态</span>
            <strong>刷新数据</strong>
            <van-icon class="click-arrow" name="arrow" size="15" />
          </button>
        </article>

        <van-popup v-model:show="leaderApplicationVisible" position="bottom" round>
          <section class="leader-application-panel">
            <header>
              <div>
                <span>团长申请</span>
                <h3>申请创建团长团队</h3>
              </div>
              <button type="button" aria-label="关闭" @click="leaderApplicationVisible = false"><van-icon name="cross" /></button>
            </header>
            <p>审核通过后，系统会为你创建团长团队并切换为团长身份。任务是否分佣、分多少，只在后台创建具体任务时配置。</p>
            <p v-if="String(leaderApplication?.status || '').toUpperCase() === 'REJECTED' && leaderApplication?.reviewRemark" class="leader-application-review">上次驳回原因：{{ leaderApplication.reviewRemark }}</p>
            <van-field :model-value="leaderApplicationForm.contactPhone" label="当前手机号" readonly placeholder="请先完善手机号" />
            <van-field v-model="leaderApplicationForm.requestedGroupName" label="团队名称" maxlength="100" placeholder="例如：小林任务团队" />
            <van-field v-model="leaderApplicationForm.reason" label="申请说明" type="textarea" rows="3" maxlength="500" show-word-limit placeholder="建议填写团队资源、运营计划或申请原因" />
            <label class="leader-application-agreement"><input v-model="leaderApplicationForm.agreedToLeaderRules" type="checkbox" /> 我已了解团长身份、团队管理与任务结算规则</label>
            <button class="leader-application-submit" type="button" :disabled="leaderApplicationSubmitting" @click="submitLeaderApplication">
              {{ leaderApplicationSubmitting ? '提交中...' : '提交申请' }}
            </button>
          </section>
        </van-popup>

        <van-popup v-model:show="currentDetailVisible" class="current-detail-popup" round>
          <section class="current-detail-panel">
            <header>
              <div>
                <span>当前领取任务</span>
                <h3>{{ currentTask?.task?.title || '暂无进行中任务' }}</h3>
              </div>
              <button type="button" @click="currentDetailVisible = false"><van-icon name="cross" /></button>
            </header>
            <template v-if="currentTask">
              <div class="detail-grid">
                <div><span>平台</span><strong>{{ platformLabel(currentTask?.task?.platform) }}</strong></div>
                <div><span>奖励</span><strong>¥{{ formatCent(currentTask?.task?.rewardAmount) }}</strong></div>
                <div><span>作者</span><strong>{{ currentTask?.task?.authorName || '-' }}</strong></div>
                <div><span>领取状态</span><strong>进行中</strong></div>
              </div>
              <p>{{ currentTask?.task?.copywriting || '按页面步骤完成互动，提交截图后由运营审核结算。' }}</p>
              <div class="popup-actions">
                <button class="mini-btn primary" type="button" @click="continueCurrent">继续</button>
                <button class="mini-btn danger" type="button" :disabled="abandoning" @click="requestAbandonCurrent">放弃</button>
              </div>
            </template>
            <van-empty v-else image-size="72" description="当前没有进行中的任务" />
          </section>
        </van-popup>

        <van-popup v-model:show="abandonConfirmVisible" class="abandon-confirm-popup" round>
          <section class="abandon-panel">
            <div class="abandon-icon"><van-icon name="warning-o" size="20" /></div>
            <h3>确认放弃当前任务？</h3>
            <p>放弃后会释放当前评论，今日可放弃次数会减少。</p>
            <div class="abandon-actions">
              <button type="button" class="cancel" @click="abandonConfirmVisible = false">再想想</button>
              <button type="button" class="confirm" :disabled="abandoning" @click="confirmAbandonCurrent">确认放弃</button>
            </div>
          </section>
        </van-popup>
      </section>
    </van-pull-refresh>

    <van-popup v-model:show="accountSheetVisible" position="bottom" round>
      <section class="account-panel">
        <header>
          <h3>切换任务账号</h3>
          <div class="account-panel-actions">
            <button type="button" class="secondary" @click="recognitionSheetVisible = true">识别信息</button>
            <button type="button" @click="newAccountVisible = true">新增账号</button>
          </div>
        </header>
        <button v-for="item in taskAccounts" :key="item.id" type="button" :class="['account-option', { active: activeTaskAccount?.id === item.id }]" @click="handleSwitchTaskAccount(item.id)">
          <div>
            <strong>{{ item.nickname }}</strong>
            <span>{{ maskPhone(item.phone) }}</span>
          </div>
          <em>{{ activeTaskAccount?.id === item.id ? '当前' : '切换' }}</em>
        </button>
      </section>
    </van-popup>

    <van-popup v-model:show="recognitionSheetVisible" position="bottom" round>
      <section class="account-panel recognition-panel">
        <header>
          <div>
            <h3>主页识别信息</h3>
            <p>仅展示截图识别候选，不会修改任务账号昵称或手机号。</p>
          </div>
          <button type="button" class="secondary" @click="recognitionSheetVisible = false">关闭</button>
        </header>
        <template v-if="activeTaskAccount?.homepageRecognitions?.length">
          <article v-for="item in activeTaskAccount.homepageRecognitions" :key="item.expectedPlatform" class="recognition-card">
            <div class="recognition-card-head">
              <strong>{{ platformLabel(item.expectedPlatform) }}</strong>
              <span :class="['recognition-status', recognitionStatusClass(item.status)]">{{ recognitionStatusText(item.status) }}</span>
            </div>
            <template v-if="item.status === 'PENDING' || item.status === 'PROCESSING' || item.status === 'NOT_REQUESTED'">
              <p class="recognition-muted"><van-loading size="14px" /> 正在识别主页信息，可先继续完成任务。</p>
            </template>
            <template v-else>
              <div v-if="item.nicknameCandidate" class="recognition-row"><span>昵称候选</span><strong>{{ item.nicknameCandidate }}</strong></div>
              <div v-if="item.accountIdCandidate" class="recognition-row"><span>账号 ID 候选</span><strong>{{ item.accountIdCandidate }}</strong></div>
              <div v-if="item.detectedPlatform" class="recognition-row"><span>识别平台</span><strong>{{ platformLabel(item.detectedPlatform) }}</strong></div>
              <p v-if="item.error" class="recognition-muted">{{ item.error }}</p>
              <p v-else-if="!item.nicknameCandidate && !item.accountIdCandidate" class="recognition-muted">未识别到稳定候选，请核对主页截图。</p>
            </template>
          </article>
        </template>
        <van-empty v-else image-size="72" description="当前任务账号暂无主页识别信息" />
      </section>
    </van-popup>

    <van-popup v-model:show="newAccountVisible" position="bottom" round>
      <section class="account-panel">
        <header>
          <h3>新增任务账号</h3>
        </header>
        <van-field v-model="accountForm.phone" label="手机号" type="tel" maxlength="11" placeholder="请输入手机号" @input="onAccountPhoneInput" />
        <van-field v-model="accountForm.nickname" label="昵称" placeholder="请输入昵称" />
        <van-field v-model="accountForm.smsCode" label="验证码" type="tel" maxlength="6" placeholder="请输入短信验证码" @input="onAccountSmsCodeInput">
          <template #button>
            <button type="button" class="account-sms-btn" :disabled="!canSendTaskAccountSms" @click.stop="handleSendTaskAccountSmsCode">{{ taskAccountSmsButtonText }}</button>
          </template>
        </van-field>
        <button class="account-submit" type="button" :disabled="accountSubmitting" @click="handleCreateTaskAccount">{{ accountSubmitting ? '保存中...' : '保存账号' }}</button>
      </section>
    </van-popup>

    <section
      v-if="activeTab === 'home' && !sharedTaskId"
      class="filter-fab-anchor"
      :style="filterFabAnchorStyle"
    >
      <transition name="fab-panel">
        <div v-if="filterFabExpanded" :class="['filter-fab-panel', fabExpandToLeft ? 'to-left' : 'to-right']">
          <button
            v-for="item in platforms"
            :key="item.value || 'all'"
            type="button"
            :class="['fab-filter-item', { active: activePlatform === item.value }]"
            :style="platformTabStyle(item.value)"
            @click.stop="switchPlatform(item.value); filterFabExpanded = false"
          >
            {{ item.label }}
          </button>
        </div>
      </transition>
      <button
        type="button"
        class="filter-fab"
        @click.stop="toggleFilterFab"
        @touchstart.stop="onFilterFabTouchStart"
        @touchmove.stop.prevent="onFilterFabTouchMove"
        @touchend.stop="onFilterFabTouchEnd"
      >
        <span class="filter-fab-icon"><van-icon name="filter-o" size="18" /></span>
      </button>
    </section>

    <nav class="bottom-tab" :class="{ paired: sharedTaskId }">
      <button type="button" :class="{ active: activeTab === 'home' }" @click="switchMainTab('home')">
        <van-icon name="wap-home-o" size="17" />
        <span>任务大厅</span>
      </button>
      <button v-if="!sharedTaskId" class="quick-claim" type="button" :class="{ muted: hasCurrent }" :disabled="quickClaiming" :style="quickClaimStyle" @click="oneClickClaim">
        <span>{{ quickClaiming ? '领取中' : '快速领取' }}</span>
      </button>
      <button type="button" :class="{ active: activeTab === 'profile' }" @click="switchMainTab('profile')">
        <van-icon name="user-o" size="17" />
        <span>我的</span>
      </button>
    </nav>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { abandonDistributionCurrentTask, applyDistributionLeader, claimDistributionTask, createDistributionTaskAccount, getDistributionMe, getDistributionTasks, switchDistributionTaskAccount } from '@/api'
import { useTopPullRefresh } from '@/composables/useTopPullRefresh'
import { extractMockSmsCode, useSmsCode } from '@/composables/useSmsCode'
import { isValidPhone, normalizePhone } from '@/services/phone'
import { getThemeStyleVars, platformLabel, resolveDistributionPlatformParam, toDistributionPlatformParam } from '@/utils/platform'

const router = useRouter()
const route = useRoute()
const HOME_ACTIVE_TAB_KEY = 'distributionHomeActiveTab'
const sharedTaskId = computed(() => typeof route.query.taskId === 'string' ? route.query.taskId.trim() : '')
const PAGE_SIZE = 10
const CURRENT_TASK_CACHE_VERSION = 3

function showAllTasks() {
  const { taskId, postId, type, ...query } = route.query
  router.replace({ path: '/', query })
}

function readSavedMainTab() {
  if (sharedTaskId.value) return 'home' as const
  const routeTab = String(route.query.tab || '').trim()
  if (routeTab === 'profile') return 'profile' as const
  if (routeTab === 'home') return 'home' as const
  try {
    return sessionStorage.getItem(HOME_ACTIVE_TAB_KEY) === 'profile' ? 'profile' as const : 'home' as const
  } catch {
    return 'home' as const
  }
}

const me = ref<any>(null)
const tasks = ref<any[]>([])
const currentTask = ref<any>(null)
const firstLoading = ref(false)
const loadingMore = ref(false)
const finished = ref(false)
const refreshing = ref(false)
const claimingId = ref('')
const quickClaiming = ref(false)
const abandoning = ref(false)
const currentDetailVisible = ref(false)
const abandonConfirmVisible = ref(false)
const accountSheetVisible = ref(false)
const recognitionSheetVisible = ref(false)
const newAccountVisible = ref(false)
const accountSubmitting = ref(false)
const accountForm = ref({ phone: '', nickname: '', smsCode: '' })
const leaderApplicationVisible = ref(false)
const leaderApplicationSubmitting = ref(false)
const leaderApplicationForm = ref({ requestedGroupName: '', reason: '', contactPhone: '', agreedToLeaderRules: false })
const activePlatform = ref('')
const activeTab = ref<'home' | 'profile'>(readSavedMainTab())
const filterFabExpanded = ref(false)
const filterFabX = ref(0)
const filterFabY = ref(0)
let filterFabStartX = 0
let filterFabStartY = 0
let filterFabOriginX = 0
let filterFabOriginY = 0
let filterFabMoved = false
let filterFabIgnoreClick = false
const page = ref(1)
const total = ref(0)
const { canSend: canSendTaskAccountSms, buttonText: taskAccountSmsButtonText, sendCode: sendTaskAccountSmsCode } = useSmsCode({
  scene: 'task_account',
  phone: () => accountForm.value.phone,
})

const {
  canPullRefresh,
  pullRefreshKey,
  preparePullRefresh,
  handlePullMove,
  handlePullEnd,
  updatePullRefreshState,
} = useTopPullRefresh({
  active: () => activeTab.value === 'home',
  disabled: () => loadingMore.value || firstLoading.value,
  topThreshold: 2,
})

const platforms = [
  { label: '全部', value: '' },
  { label: '抖音', value: 'DOUYIN' },
  { label: '视频号', value: 'WECHAT_VIDEO' },
  { label: '小红书', value: 'XIAOHONGSHU' },
]

const hasCurrent = computed(() => Boolean(currentTask.value))
const avatarText = computed(() => String(me.value?.user?.nickname || me.value?.user?.phone || '微').slice(-2))
const statusText = computed(() => {
  const rawStatus = String(me.value?.status?.status || me.value?.status || me.value?.user?.status || '').toUpperCase()
  if (rawStatus === 'RESTRICTED') return '受限'
  if (rawStatus === 'DISABLED') return '停用'
  return '正常'
})
const profileCompleted = computed(() => {
  const user = me.value?.user || {}
  if (typeof user.isProfileCompleted === 'boolean') return user.isProfileCompleted
  return /^1[3-9]\d{9}$/.test(String(user.phone || '')) && Boolean(String(user.nickname || '').trim())
})

const bindingInfo = computed(() => me.value?.binding || null)
const taskAccounts = computed(() => Array.isArray(me.value?.taskAccounts) ? me.value.taskAccounts : [])
const activeTaskAccount = computed(() => me.value?.activeTaskAccount || taskAccounts.value.find((item: any) => item.isDefault) || taskAccounts.value[0] || null)
const identityRole = computed(() => {
  const explicitRole = String(me.value?.identity?.role || '').trim().toUpperCase()
  if (explicitRole) return explicitRole
  const group = bindingInfo.value?.group
  const leaderUserId = String(group?.leaderUserId || '').trim()
  const groupEnabled = String(group?.status || 'ENABLED').toUpperCase() === 'ENABLED'
  return groupEnabled && leaderUserId && leaderUserId === String(me.value?.user?.id || '').trim() ? 'LEADER' : 'MEMBER'
})
const isLeader = computed(() => identityRole.value === 'LEADER')
const isActiveLeader = computed(() => {
  if (!isLeader.value) return false
  const groupStatus = String(me.value?.identity?.leaderGroup?.status || 'ENABLED').trim().toUpperCase()
  return groupStatus === 'ENABLED'
})
const identityLabel = computed(() => {
  const backendLabel = String(me.value?.identity?.label || '').trim()
  if (backendLabel) return backendLabel
  if (identityRole.value === 'LEADER') return '团长'
  if (identityRole.value === 'MEMBER') return '成员'
  return '访客'
})
const leaderApplication = computed(() => me.value?.leaderApplication || null)
const leaderApplicationActionText = computed(() => {
  const status = String(leaderApplication.value?.status || '').toUpperCase()
  if (status === 'PENDING') return '申请审核中'
  if (status === 'REJECTED') return '已驳回，可重新申请'
  if (status === 'APPROVED' && !leaderApplication.value?.canReapply) return '审核已通过，正在同步'
  if (status === 'APPROVED' && leaderApplication.value?.canReapply) return '团长身份已解绑；加入团队后可重新申请'
  return '创建并管理自己的团队'
})

const GENERAL_THEME_STYLE = getThemeStyleVars('general')
const QUICK_THEME_STYLE = getThemeStyleVars('quick')
const quickClaimStyle = QUICK_THEME_STYLE

const fabExpandToLeft = computed(() => {
  if (typeof window === 'undefined') return true
  return filterFabX.value > window.innerWidth / 2
})

const filterFabAnchorStyle = computed(() => ({
  left: `${filterFabX.value}px`,
  top: `${filterFabY.value}px`,
}))

function platformTabStyle(value: unknown) {
  return getThemeStyleVars(value || 'general')
}

function taskCardStyle(value: unknown) {
  return getThemeStyleVars(value)
}

function platformChipStyle(value: unknown) {
  return getThemeStyleVars(value)
}

function taskButtonStyle(task: any) {
  const state = taskButtonState(task)
  if (state === 'current' || state === 'claimable') return getThemeStyleVars(task?.platform)
  if (state === 'completed') return getThemeStyleVars(task?.platform)
  return GENERAL_THEME_STYLE
}

function unwrap(resp: any) {
  return resp?.data ?? resp
}

function formatCent(value: any) {
  return (Number(value || 0) / 100).toFixed(2)
}

function maskPhone(phone: string) {
  const s = String(phone || '')
  return s.length >= 7 ? `${s.slice(0, 3)}****${s.slice(-4)}` : s
}

function recognitionStatusText(value: unknown) {
  const status = String(value || '').toUpperCase()
  if (status === 'PENDING' || status === 'PROCESSING' || status === 'NOT_REQUESTED') return '识别中'
  if (status === 'SUCCEEDED') return '已识别'
  if (status === 'REVIEW_REQUIRED') return '待核验'
  if (status === 'FAILED') return '识别失败'
  if (status === 'NOT_ENABLED') return '暂未开启'
  return '未识别'
}

function recognitionStatusClass(value: unknown) {
  const status = String(value || '').toUpperCase()
  if (status === 'SUCCEEDED') return 'success'
  if (status === 'REVIEW_REQUIRED') return 'warning'
  if (status === 'FAILED') return 'danger'
  return 'pending'
}

function taskButtonState(task: any) {
  const id = String(task?.id || '')
  const currentTaskId = String(currentTask.value?.task?.id || currentTask.value?.taskId || '')
  if (id && currentTaskId && id === currentTaskId) return 'current'
  const raw = String(task?.userTaskStatus || '').toUpperCase()
  if (raw === 'CURRENT' || task?.isCurrentForMe) return 'current'
  if (raw === 'COMPLETED' || task?.isCompletedByMe) return 'completed'
  return 'claimable'
}

function taskButtonText(task: any) {
  if (claimingId.value === task?.id) return '...'
  const state = taskButtonState(task)
  if (state === 'current') return '进行中'
  if (state === 'completed') return '已完成'
  return '领取'
}

function taskButtonClass(task: any) {
  const state = taskButtonState(task)
  return {
    current: state === 'current',
    completed: state === 'completed',
    muted: state !== 'claimable' || (hasCurrent.value && state !== 'current'),
  }
}

function readCachedCurrent() {
  try {
    const raw = localStorage.getItem('distributionCurrentTask')
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function currentTaskIdentityCandidates(value: any) {
  const task = value?.task || {}
  return [
    value?.participantId,
    value?.visitorToken,
    task.id,
    value?.taskId,
    value?.dailyTaskId,
    task.postId,
    value?.postId,
    task.dailyTaskId,
    value?.id,
  ]
    .map(item => String(item ?? '').trim())
    .filter(Boolean)
}

function isSameCurrentTask(a: any, b: any) {
  const left = currentTaskIdentityCandidates(a)
  const right = new Set(currentTaskIdentityCandidates(b))
  return left.some(item => right.has(item))
}

function mergeClaimedCurrentWithTask(current: any, seedTask?: any, platformHint = '', trustSeed = Boolean(seedTask)) {
  if (!current) return current
  const next = { ...current }
  const currentTask = current?.task || {}
  const seed = seedTask || {}
  const mergedTask = trustSeed ? { ...seed, ...currentTask } : { ...currentTask }
  const currentPlatform = resolveDistributionPlatformParam(currentTask?.platform, current?.platform, currentTask?.videoUrl, current)
  const seedPlatform = resolveDistributionPlatformParam(seed?.platform, platformHint, seed?.videoUrl, seed)
  const stablePlatform = currentPlatform || (trustSeed ? seedPlatform : '') || resolveDistributionPlatformParam(platformHint)
  if (stablePlatform) mergedTask.platform = stablePlatform
  const currentUrls = Array.isArray(currentTask?.videoUrl) ? currentTask.videoUrl.filter(Boolean) : (currentTask?.videoUrl ? [currentTask.videoUrl] : [])
  const seedUrls = Array.isArray(seed?.videoUrl) ? seed.videoUrl.filter(Boolean) : (seed?.videoUrl ? [seed.videoUrl] : [])
  const canReuseSeedUrls = trustSeed && seedUrls.length && !currentUrls.length && (!currentPlatform || !seedPlatform || currentPlatform === seedPlatform)
  if (canReuseSeedUrls) mergedTask.videoUrl = seed.videoUrl
  if (trustSeed && seed?.title && !currentTask?.title) mergedTask.title = seed.title
  if (trustSeed && seed?.authorName && !currentTask?.authorName) mergedTask.authorName = seed.authorName
  if (Object.keys(mergedTask).length) next.task = mergedTask
  if (!next.taskId && mergedTask.id) next.taskId = mergedTask.id
  next.__snapshotVersion = CURRENT_TASK_CACHE_VERSION
  return next
}

function mergeCurrentWithCached(value: any) {
  const cached = readCachedCurrent()
  if (!value || !cached) return value
  const currentParticipantId = String(value?.participantId || '').trim()
  const cachedParticipantId = String(cached?.participantId || '').trim()
  if (!isSameCurrentTask(value, cached) && currentParticipantId && cachedParticipantId && currentParticipantId !== cachedParticipantId) return value
  const cacheTrusted = Number(cached?.__snapshotVersion || 0) >= CURRENT_TASK_CACHE_VERSION
  return mergeClaimedCurrentWithTask(value, cached.task, cacheTrusted ? resolveDistributionPlatformParam(cached.task?.platform, cached.platform, cached.task?.videoUrl, cached) : '', cacheTrusted)
}

function cacheCurrent(value: any) {
  try {
    if (value) {
      const platform = resolveDistributionPlatformParam(value?.task?.platform, value?.platform, value?.task?.videoUrl, value)
      if (platform) {
        if (!value.task) value.task = {}
        value.task.platform = platform
      }
      value.__snapshotVersion = CURRENT_TASK_CACHE_VERSION
      localStorage.setItem('distributionCurrentTask', JSON.stringify(value))
    } else {
      localStorage.removeItem('distributionCurrentTask')
    }
  } catch {}
}

async function loadMe() {
  const data = unwrap(await getDistributionMe())
  me.value = data
  if (!data?.needBindInvite && (route.query.invite || route.query.leaderCode)) {
    router.replace({ path: '/', query: { taskId: sharedTaskId.value || undefined } })
    return
  }
  if ((data?.needBindInvite || route.query.leaderCode) && route.name !== 'BindInvite') {
    router.replace({ path: '/bind-invite', query: { invite: route.query.invite, leaderCode: route.query.leaderCode, taskId: sharedTaskId.value || undefined } })
    return
  }
  currentTask.value = mergeCurrentWithCached(data?.currentTask || null)
  cacheCurrent(currentTask.value)
  if (data?.user && !data.user.isProfileCompleted) {
    router.replace({ path: '/profile-complete', query: { from: activeTab.value, taskId: sharedTaskId.value || undefined } })
  }
}

async function loadTasks(reset = false) {
  if (loadingMore.value && !reset) return
  if (finished.value && !reset) return
  if (reset) {
    page.value = 1
    total.value = 0
    tasks.value = []
    finished.value = false
    firstLoading.value = true
  }
  loadingMore.value = true
  try {
    const params: any = { page: page.value, pageSize: PAGE_SIZE, scope: 'claimable' }
    if (sharedTaskId.value) params.taskId = sharedTaskId.value
    else if (activePlatform.value) params.platform = toDistributionPlatformParam(activePlatform.value)
    if (activeTaskAccount.value?.id) params.taskAccountId = activeTaskAccount.value.id
    const data = unwrap(await getDistributionTasks(params))
    const list = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []
    if ((params.taskId || '') !== sharedTaskId.value) return
    total.value = Number(data?.total || list.length || 0)
    tasks.value = reset ? list : tasks.value.concat(list)
    page.value += 1
    finished.value = list.length < PAGE_SIZE || (total.value > 0 && tasks.value.length >= total.value)
  } finally {
    loadingMore.value = false
    firstLoading.value = false
  }
}

async function refreshAll() {
  refreshing.value = true
  try {
    await loadMe()
    if (me.value?.needBindInvite) return
    await loadTasks(true)
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.response?.data?.msg || e?.message || '加载失败，请稍后重试'
    showToast(Array.isArray(msg) ? msg.join('；') : msg)
  } finally {
    refreshing.value = false
  }
}

async function loadMoreTasks() {
  try {
    await loadTasks(false)
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.response?.data?.msg || e?.message || '加载失败，请稍后重试'
    showToast(Array.isArray(msg) ? msg.join('；') : msg)
    loadingMore.value = false
  }
}

function clampFilterFabPosition(x: number, y: number) {
  if (typeof window === 'undefined') return { x: 0, y: 0 }
  const width = 56
  const height = 56
  const minX = 10
  const maxX = Math.max(minX, window.innerWidth - width - 10)
  const minY = 96
  const maxY = Math.max(minY, window.innerHeight - height - 96)
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  }
}

function initFilterFabPosition() {
  if (filterFabX.value || filterFabY.value || typeof window === 'undefined') return
  const { x, y } = clampFilterFabPosition(window.innerWidth - 74, Math.max(320, window.innerHeight - 230))
  filterFabX.value = x
  filterFabY.value = y
}

function snapFilterFabToEdge() {
  if (typeof window === 'undefined') return
  const snappedX = filterFabX.value + 28 < window.innerWidth / 2 ? 10 : Math.max(10, window.innerWidth - 66)
  const next = clampFilterFabPosition(snappedX, filterFabY.value)
  filterFabX.value = next.x
  filterFabY.value = next.y
}

function toggleFilterFab() {
  if (filterFabIgnoreClick) {
    filterFabIgnoreClick = false
    return
  }
  filterFabExpanded.value = !filterFabExpanded.value
}

function onFilterFabTouchStart(event: TouchEvent) {
  const touch = event.touches[0]
  if (!touch) return
  filterFabStartX = touch.clientX
  filterFabStartY = touch.clientY
  filterFabOriginX = filterFabX.value
  filterFabOriginY = filterFabY.value
  filterFabMoved = false
}

function onFilterFabTouchMove(event: TouchEvent) {
  const touch = event.touches[0]
  if (!touch) return
  const deltaX = touch.clientX - filterFabStartX
  const deltaY = touch.clientY - filterFabStartY
  if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) filterFabMoved = true
  const next = clampFilterFabPosition(filterFabOriginX + deltaX, filterFabOriginY + deltaY)
  filterFabX.value = next.x
  filterFabY.value = next.y
}

function onFilterFabTouchEnd() {
  filterFabIgnoreClick = true
  if (filterFabMoved) {
    filterFabExpanded.value = false
    snapFilterFabToEdge()
  } else {
    filterFabExpanded.value = !filterFabExpanded.value
  }
  setTimeout(() => {
    filterFabIgnoreClick = false
  }, 220)
}

function handleResize() {
  const next = clampFilterFabPosition(filterFabX.value, filterFabY.value)
  filterFabX.value = next.x
  filterFabY.value = next.y
}

function scrollToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
}

function switchPlatform(value: string) {
  filterFabExpanded.value = false
  if (activePlatform.value === value) return
  activePlatform.value = value
  scrollToTop()
  loadTasks(true)
}

function continueCurrent() {
  if (!currentTask.value) {
    showToast('暂无进行中任务')
    return
  }
  currentDetailVisible.value = false
  cacheCurrent(currentTask.value)
  router.push({ path: '/task-current', query: { from: activeTab.value, taskId: sharedTaskId.value || undefined } })
}

function goLeaderCenter() {
  if (!isActiveLeader.value) {
    showToast('团长已停用，暂不能进入团长中心')
    return
  }
  router.push('/leader-center')
}

function openLeaderApplication() {
  if (isLeader.value) {
    goLeaderCenter()
    return
  }
  if (!bindingInfo.value?.group) {
    showToast('请先加入一个团队后再申请成为团长')
    router.push('/bind-invite')
    return
  }
  const status = String(leaderApplication.value?.status || '').toUpperCase()
  if (status === 'PENDING') {
    showToast('申请正在审核中，请耐心等待')
    return
  }
  if (status === 'APPROVED' && !leaderApplication.value?.canReapply) {
    showToast('申请已审核通过，正在同步团长身份')
    void loadMe()
    return
  }
  const nickname = String(me.value?.user?.nickname || '').trim()
  leaderApplicationForm.value = {
    requestedGroupName: String(leaderApplication.value?.requestedGroupName || `${nickname || '我的'}任务团队`).slice(0, 100),
    reason: status === 'REJECTED' ? '' : String(leaderApplication.value?.reason || '').slice(0, 500),
    contactPhone: String(me.value?.user?.phone || me.value?.profile?.phone || '').trim(),
    agreedToLeaderRules: false,
  }
  leaderApplicationVisible.value = true
}

async function submitLeaderApplication() {
  const requestedGroupName = String(leaderApplicationForm.value.requestedGroupName || '').trim()
  const reason = String(leaderApplicationForm.value.reason || '').trim()
  const contactPhone = String(leaderApplicationForm.value.contactPhone || '').trim()
  if (requestedGroupName.length < 2) {
    showToast('团队名称至少需要 2 个字')
    return
  }
  if (!/^1[3-9]\d{9}$/.test(contactPhone)) {
    showToast('请先在个人资料完善有效手机号')
    return
  }
  if (!leaderApplicationForm.value.agreedToLeaderRules) {
    showToast('请先确认已了解团长规则')
    return
  }
  leaderApplicationSubmitting.value = true
  try {
    await applyDistributionLeader({ requestedGroupName, reason: reason || undefined, contactPhone, agreedToLeaderRules: true })
    leaderApplicationVisible.value = false
    showToast('申请已提交，请等待后台审核')
    await loadMe()
  } catch (error: any) {
    const msg = error?.response?.data?.message || error?.response?.data?.msg || error?.message || '提交失败，请稍后重试'
    showToast(Array.isArray(msg) ? msg.join('；') : msg)
  } finally {
    leaderApplicationSubmitting.value = false
  }
}

function goWithdrawals() {
  router.push({ path: '/withdrawals', query: { from: activeTab.value, taskId: sharedTaskId.value || undefined } })
}

function openCurrentDetail() {
  if (!currentTask.value) {
    showToast('当前暂无正在进行的任务')
    return
  }
  currentDetailVisible.value = true
}

function requestAbandonCurrent() {
  if (!currentTask.value) {
    showToast('暂无可放弃任务')
    return
  }
  abandonConfirmVisible.value = true
}

async function confirmAbandonCurrent() {
  if (!currentTask.value) {
    showToast('暂无可放弃任务')
    abandonConfirmVisible.value = false
    return
  }
  abandoning.value = true
  try {
    await abandonDistributionCurrentTask({ reason: '用户主动放弃任务' })
    showToast('已放弃当前任务')
    currentTask.value = null
    cacheCurrent(null)
    currentDetailVisible.value = false
    abandonConfirmVisible.value = false
    await refreshAll()
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.response?.data?.msg || e?.message || '放弃失败，请稍后重试'
    showToast(Array.isArray(msg) ? msg.join('；') : msg)
  } finally {
    abandoning.value = false
  }
}

function goProfileComplete() {
  router.push({ path: '/profile-complete', query: { from: activeTab.value, taskId: sharedTaskId.value || undefined } })
}

function goRecords(type: 'all' | 'completed' | 'settled' | 'abandoned') {
  router.push({ path: '/records', query: { type, from: activeTab.value } })
}

async function doClaim(payload: any, claimId = 'quick', seedTask?: any, platformHint = '') {
  const resetClaiming = () => {
    if (claimId === 'quick') quickClaiming.value = false
    else claimingId.value = ''
  }
  if (hasCurrent.value) {
    showToast('请先完成当前任务')
    resetClaiming()
    return
  }
  if (!profileCompleted.value) {
    showToast('请先完善资料')
    resetClaiming()
    router.push({ path: '/profile-complete', query: { from: activeTab.value, taskId: sharedTaskId.value || undefined } })
    return
  }
  try {
    const data = unwrap(await claimDistributionTask(payload))
    const current = mergeClaimedCurrentWithTask(data?.currentTask || data, seedTask, platformHint)
    cacheCurrent(current)
    currentTask.value = current
    showToast('领取任务成功')
    router.push({ path: '/task-current', query: { from: activeTab.value, taskId: sharedTaskId.value || undefined } })
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.response?.data?.msg || e?.message || '领取失败，请稍后重试'
    showToast(Array.isArray(msg) ? msg.join('；') : msg)
  } finally {
    resetClaiming()
  }
}

function handleTaskAction(task: any) {
  const state = taskButtonState(task)
  if (state === 'current') {
    showToast('当前任务正在进行中')
    continueCurrent()
    return
  }
  if (state === 'completed') {
    showToast('该任务已完成，不能重复领取')
    return
  }
  claimTask(task)
}

async function claimTask(task: any) {
  if (hasCurrent.value) {
    showToast('已有正在进行的任务，请完成任务后再继续领取')
    return
  }
  claimingId.value = task.id
  const payload: any = { taskId: task.id }
  let platformHint = ''
  if (task.platform) {
    const platform = toDistributionPlatformParam(task.platform)
    if (platform) {
      payload.platform = platform
      platformHint = platform
    }
  }
  if (activeTaskAccount.value?.id) payload.taskAccountId = activeTaskAccount.value.id
  await doClaim(payload, task.id, task, platformHint || task.platform)
}

async function oneClickClaim() {
  if (hasCurrent.value) {
    showToast('已有正在进行的任务，请完成任务后再继续领取')
    return
  }
  quickClaiming.value = true
  const payload: any = {}
  let platformHint = ''
  if (activePlatform.value) {
    const platform = toDistributionPlatformParam(activePlatform.value)
    if (platform) {
      payload.platform = platform
      platformHint = platform
    }
  }
  if (activeTaskAccount.value?.id) payload.taskAccountId = activeTaskAccount.value.id
  await doClaim(payload, 'quick', undefined, platformHint)
}

async function handleSwitchTaskAccount(id: string) {
  if (!id || id === activeTaskAccount.value?.id) return
  try {
    await switchDistributionTaskAccount(id)
    accountSheetVisible.value = false
    showToast('已切换任务账号')
    await refreshAll()
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || '切换失败'
    showToast(Array.isArray(msg) ? msg.join('；') : msg)
  }
}

function onAccountPhoneInput() {
  accountForm.value.phone = normalizePhone(accountForm.value.phone).slice(0, 11)
}

function onAccountSmsCodeInput() {
  accountForm.value.smsCode = String(accountForm.value.smsCode || '').replace(/[^0-9]/g, '').slice(0, 6)
}

async function handleSendTaskAccountSmsCode() {
  accountForm.value.phone = normalizePhone(accountForm.value.phone).slice(0, 11)
  if (!isValidPhone(accountForm.value.phone)) return showToast('请输入正确手机号')
  try {
    const data = await sendTaskAccountSmsCode()
    const mockCode = extractMockSmsCode(data)
    if (mockCode) accountForm.value.smsCode = mockCode
    showToast(mockCode ? '验证码已发送，已自动填入' : '验证码已发送')
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || '验证码发送失败'
    showToast(Array.isArray(msg) ? msg.join('；') : msg)
  }
}

async function handleCreateTaskAccount() {
  const phone = normalizePhone(accountForm.value.phone).slice(0, 11)
  const nickname = accountForm.value.nickname.trim()
  const smsCode = String(accountForm.value.smsCode || '').replace(/[^0-9]/g, '').slice(0, 6)
  accountForm.value.phone = phone
  accountForm.value.smsCode = smsCode
  if (!isValidPhone(phone)) return showToast('请输入正确手机号')
  if (!nickname) return showToast('请输入昵称')
  if (!smsCode) return showToast('请输入短信验证码')
  accountSubmitting.value = true
  try {
    await createDistributionTaskAccount({ phone, nickname, smsCode })
    showToast('任务账号已新增')
    accountForm.value = { phone: '', nickname: '', smsCode: '' }
    newAccountVisible.value = false
    accountSheetVisible.value = false
    await refreshAll()
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || '新增失败'
    showToast(Array.isArray(msg) ? msg.join('；') : msg)
  } finally {
    accountSubmitting.value = false
  }
}

function switchMainTab(tab: 'home' | 'profile') {
  if (activeTab.value === tab) {
    scrollToTop()
    return
  }
  activeTab.value = tab
  nextTick(() => {
    scrollToTop()
    updatePullRefreshState()
  })
}

watch(activeTab, (value) => {
  if (value !== 'home') filterFabExpanded.value = false
  try {
    sessionStorage.setItem(HOME_ACTIVE_TAB_KEY, value)
  } catch {}
  nextTick(() => {
    updatePullRefreshState()
    if (document.documentElement.scrollHeight <= window.innerHeight + 8) {
      window.scrollTo({ top: 0, left: 0 })
    }
  })
})

watch(sharedTaskId, () => {
  if (route.name !== 'Home') return
  activeTab.value = 'home'
  if (me.value && !me.value.needBindInvite) loadTasks(true)
})

watch(() => route.query.tab, (value) => {
  const next = String(value || '').trim()
  if (next === 'home' || next === 'profile') activeTab.value = next
})

onMounted(() => {
  initFilterFabPosition()
  window.addEventListener('resize', handleResize)
  refreshAll()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
.shared-task-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.shared-task-heading button { background: none; border: 0; color: #415795; font: inherit; font-size: 14px; cursor: pointer; }

.shell {
  box-sizing: border-box;
  min-height: 100dvh;
  padding: 8px 12px calc(64px + env(safe-area-inset-bottom));
  background: #ffffff;
  color: #0f172a;
}
.platform-tab {
  height: 30px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: #475569;
  font-size: 12px;
  font-weight: 900;
}
.content { margin-top: 0; }
.home-content { padding-top: 10px; }
.filter-fab-anchor {
  position: fixed;
  z-index: 29;
}
.filter-fab {
  width: 56px;
  height: 56px;
  border: 0;
  border-radius: 999px;
  background: #ffffff;
  box-shadow: 0 10px 22px rgba(15, 23, 42, .10);
  border: 1px solid #e5e7eb;
  color: #334155;
  display: grid;
  place-items: center;
}
.filter-fab::after {
  content: '';
  position: absolute;
  right: 12px;
  top: 12px;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #cbd5e1;
  box-shadow: 0 0 0 2px rgba(255,255,255,.96);
}
.filter-fab-icon {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: transparent;
  color: #64748b;
}
.filter-fab-panel {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: grid;
  grid-template-columns: repeat(4, auto);
  gap: 6px;
  padding: 7px;
  border-radius: 18px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 10px 22px rgba(15, 23, 42, .08);
}
.filter-fab-panel.to-left { right: calc(100% + 10px); }
.filter-fab-panel.to-right { left: calc(100% + 10px); }
.fab-filter-item {
  min-width: 58px;
  height: 32px;
  border: 0;
  border-radius: 999px;
  padding: 0 10px;
  background: #ffffff;
  color: #58677a;
  font-size: 12px;
  font-weight: 900;
}
.fab-filter-item.active {
  background: var(--theme-solid);
  color: #fff;
}
.fab-filter-item:active,
.filter-fab:active { transform: scale(.98); }
.fab-panel-enter-active, .fab-panel-leave-active { transition: all .18s ease; }
.fab-panel-enter-from, .fab-panel-leave-to { opacity: 0; transform: translateY(-50%) scale(.94); }
.task-card,
.profile-card,
.profile-list-card,
.empty-card,
.skeleton {
  border: 1px solid var(--theme-card-border, #e5e7eb);
  border-radius: 20px;
  background: var(--theme-card-bg, #fff);
  box-shadow: none;
  backdrop-filter: none;
}
.task-list { display: flex; flex-direction: column; gap: 10px; }
.task-card { position: relative; padding: 13px 14px; overflow: hidden; box-sizing: border-box; border: 1px solid var(--theme-card-border, #e5e7eb); border-left: 5px solid var(--theme-solid); background: var(--theme-card-bg, #fff); }
.compact-task-card { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 118px; }
.task-main { flex: 1; min-width: 0; }
.task-meta-line { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
.platform-pill { border-radius: 999px; background: var(--theme-pill-bg); color: var(--theme-pill-text); padding: 4px 9px; font-size: 11px; font-weight: 900; box-shadow: 0 4px 10px var(--theme-shadow, rgba(17,24,39,.10)); }
.remain { color: #64748b; font-size: 12px; font-weight: 800; }
.reward { flex: none; color: #f97316; font-size: 17px; line-height: 1; }
.task-card h3 { margin: 10px 0 5px; font-size: 16px; line-height: 22px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.task-desc { margin: 0; color: #64748b; font-size: 12px; line-height: 18px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.task-action { flex: none; width: 54px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; align-self: stretch; }
.claim-pill { min-width: 52px; height: 32px; white-space: nowrap; border: 0; border-radius: 999px; background: var(--theme-solid); color: #fff; padding: 0 10px; font-size: 13px; font-weight: 950; box-shadow: none; }
.claim-pill.muted { background: #94a3b8; box-shadow: none; }
.claim-pill.current { background: var(--theme-solid); box-shadow: none; }
.claim-pill.completed { border: 1px solid var(--theme-soft-border); background: rgba(255,255,255,.76); color: var(--theme-pill-text); box-shadow: none; }
.claim-pill:disabled,
.quick-claim:disabled,
.quick-claim.muted { opacity: .58; }
.secondary-btn { height: 34px; border: 1px solid #e5e7eb; border-radius: 999px; background: #fff; padding: 0 14px; color: #334155; font-weight: 900; box-shadow: none; }
.team-line,
.account-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  border: 0;
  border-radius: 16px;
  background: #f8fafc;
  padding: 10px 12px;
  width: 100%;
}
.team-line span,
.account-line span { color: #64748b; font-size: 12px; font-weight: 900; }
.team-line strong,
.account-line strong { color: #0f172a; font-size: 13px; font-weight: 950; text-align: right; }
.account-panel { padding: 18px 16px calc(18px + env(safe-area-inset-bottom)); background: #fff; }
.account-panel header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.account-panel h3 { margin: 0; font-size: 18px; font-weight: 950; color: #0f172a; }
.account-panel header button { height: 32px; border: 0; border-radius: 999px; background: #eef8f2; color: #07a652; padding: 0 12px; font-weight: 900; }

.account-panel-actions { display: flex; align-items: center; gap: 8px; }
.account-panel header button.secondary { background: #f1f5f9; color: #475569; }
.recognition-panel header { align-items: flex-start; }
.recognition-panel header p { margin: 5px 0 0; color: #64748b; font-size: 12px; line-height: 18px; }
.recognition-card { margin-top: 10px; border: 1px solid #e5e7eb; border-radius: 16px; background: #fff; padding: 12px; }
.recognition-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.recognition-card-head strong { color: #0f172a; font-size: 14px; }
.recognition-status { border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 900; }
.recognition-status.pending { background: #eff6ff; color: #2563eb; }
.recognition-status.success { background: #ecfdf5; color: #059669; }
.recognition-status.warning { background: #fff7ed; color: #d97706; }
.recognition-status.danger { background: #fff1f2; color: #e11d48; }
.recognition-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; border-radius: 10px; background: #f8fafc; padding: 8px 9px; }
.recognition-row span { color: #64748b; font-size: 12px; font-weight: 800; }
.recognition-row strong { min-width: 0; color: #0f172a; font-size: 12px; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recognition-muted { display: flex; align-items: center; gap: 6px; margin: 10px 0 0; color: #64748b; font-size: 12px; line-height: 18px; }
.account-option { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px; border: 1px solid #e5e7eb; border-radius: 16px; background: #fff; padding: 12px; margin-top: 8px; }
.account-option.active { border-color: #07c160; background: #f3fbf6; }
.account-option strong { display: block; font-size: 15px; color: #0f172a; }
.account-option span { display: block; margin-top: 4px; color: #64748b; font-size: 12px; }
.account-option em { font-style: normal; color: #07a652; font-size: 12px; font-weight: 900; }
.account-sms-btn { height: 32px; border: 0; border-radius: 999px; background: #07c160; color: #fff; padding: 0 10px; font-size: 12px; font-weight: 900; }
.account-sms-btn:disabled { background: #cbd5e1; }
.account-submit { width: 100%; height: 42px; margin-top: 14px; border: 0; border-radius: 999px; background: #07c160; color: #fff; font-weight: 950; }
.leader-application-panel { padding: 18px 17px calc(22px + env(safe-area-inset-bottom)); background: #fff; }
.leader-application-panel header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.leader-application-panel header span { color: #16a34a; font-size: 12px; font-weight: 900; }
.leader-application-panel header h3 { margin: 5px 0 0; color: #0f172a; font-size: 18px; line-height: 24px; font-weight: 950; }
.leader-application-panel header button { display: grid; width: 32px; height: 32px; place-items: center; border: 0; border-radius: 999px; background: #f1f5f9; color: #475569; }
.leader-application-panel > p { margin: 0 0 13px; border-radius: 14px; background: #f0fdf4; padding: 10px 11px; color: #166534; font-size: 12px; line-height: 18px; }
.leader-application-panel > p.leader-application-review { margin-top: -5px; background: #fff7ed; color: #9a3412; }
.leader-application-panel :deep(.van-cell) { padding-left: 0; padding-right: 0; }
.leader-application-agreement { display: flex; align-items: flex-start; gap: 8px; margin-top: 12px; color: #475569; font-size: 12px; line-height: 18px; }
.leader-application-agreement input { width: 16px; height: 16px; margin-top: 1px; accent-color: #07c160; }
.leader-application-submit { width: 100%; height: 44px; margin-top: 14px; border: 0; border-radius: 14px; background: #07c160; color: #fff; font-size: 15px; font-weight: 950; }
.leader-application-submit:disabled { opacity: .55; }
.profile-content { display: flex; flex-direction: column; gap: 12px; padding-top: 10px; }
.profile-card { padding: 17px; }
.profile-top { display: flex; align-items: center; gap: 12px; }
.profile-avatar { width: 54px; height: 54px; border-radius: 999px; display: grid; place-items: center; background: #111827; color: #fff; font-size: 18px; font-weight: 900; letter-spacing: .5px; }
.profile-main { flex: 1; min-width: 0; }
.profile-main p { margin: 0 0 4px; color: #64748b; font-size: 12px; font-weight: 900; }
.profile-main h2 { margin: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 20px; }
.profile-main span { display: block; margin-top: 4px; color: #64748b; font-size: 13px; }
.profile-status { flex: none; border-radius: 999px; background: #dcfce7; color: #16a34a; padding: 6px 10px; font-size: 12px; font-style: normal; font-weight: 900; }
.profile-status.danger { background: #fee2e2; color: #ef4444; }
.complete-tip { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 15px; border-radius: 18px; background: #fff7ed; padding: 12px; }
.complete-tip strong { display: block; color: #9a3412; font-size: 14px; }
.complete-tip span { display: block; margin-top: 3px; color: #c2410c; font-size: 12px; }
.complete-tip button { flex: none; height: 32px; border: 0; border-radius: 999px; background: #fb923c; color: #fff; padding: 0 12px; font-weight: 900; }
.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 15px; }
.stats-grid .stat-card { position: relative; display: block; box-sizing: border-box; width: 100%; min-width: 0; border: 0; border-radius: 17px; background: #f8fafc; padding: 10px 18px 10px 6px; text-align: center; transition: transform .16s ease, background .16s ease; }
.stats-grid button.stat-card:active { transform: scale(.98); }
.stats-grid .stat-card.account { background: #f1f5f9; }
.stats-grid .stat-card.readonly { padding-right: 6px; }
.stats-grid span { display: block; color: #64748b; font-size: 11px; font-weight: 850; }
.stats-grid strong { display: flex; align-items: baseline; justify-content: center; gap: 2px; margin-top: 6px; font-size: 16px; line-height: 20px; color: #0f172a; font-weight: 950; }
.stats-grid small { font-size: 10px; line-height: 1; color: #64748b; font-weight: 900; }
.profile-list-card { overflow: hidden; }
.current-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid #eef2f7; padding: 13px 15px; }
.current-help { display: inline-flex; align-items: center; gap: 6px; border: 0; background: transparent; color: #334155; font-size: 15px; font-weight: 900; padding: 0; }
.current-help .van-icon { color: #94a3b8; }
.current-actions { display: flex; align-items: center; gap: 8px; }
.no-current-text { color: #94a3b8; font-size: 13px; font-weight: 900; }
.mini-btn { height: 31px; min-width: 54px; border-radius: 999px; border: 0; padding: 0 12px; font-size: 12px; font-weight: 950; }
.mini-btn.primary { background: #111827; color: #fff; box-shadow: none; }
.mini-btn.danger { background: #fff1f2; color: #e11d48; }
.mini-btn:disabled { opacity: .48; }
.current-detail-popup { width: min(340px, 86vw); overflow: hidden; background: transparent; }
.current-detail-panel { padding: 18px; border-radius: 24px; background: rgba(255,255,255,.96); box-shadow: 0 20px 60px rgba(15,23,42,.18); }
.current-detail-panel header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.current-detail-panel header span { color: #64748b; font-size: 12px; font-weight: 900; }
.current-detail-panel header h3 { margin: 6px 0 0; color: #0f172a; font-size: 17px; line-height: 24px; }
.current-detail-panel header button { flex: none; width: 30px; height: 30px; border: 0; border-radius: 999px; background: #f1f5f9; color: #475569; }
.detail-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 9px; margin-top: 16px; }
.detail-grid div { border-radius: 16px; background: #f8fafc; padding: 10px; }
.detail-grid span { display: block; color: #94a3b8; font-size: 11px; font-weight: 800; }
.detail-grid strong { display: block; margin-top: 5px; color: #0f172a; font-size: 13px; }
.current-detail-panel p { margin: 14px 0 0; border-radius: 16px; background: #f8fafc; padding: 12px; color: #64748b; font-size: 13px; line-height: 20px; }
.popup-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
.popup-actions .mini-btn { width: 100%; height: 36px; }
.abandon-confirm-popup { width: min(312px, 82vw); overflow: hidden; background: transparent; }
.abandon-panel { border-radius: 24px; background: rgba(255,255,255,.98); box-shadow: 0 20px 64px rgba(15,23,42,.20); padding: 18px; text-align: center; }
.abandon-icon { width: 40px; height: 40px; margin: 0 auto 10px; display: grid; place-items: center; border-radius: 999px; background: #fff1f2; color: #e11d48; }
.abandon-panel h3 { margin: 0; color: #0f172a; font-size: 17px; line-height: 24px; }
.abandon-panel p { margin: 8px 8px 16px; color: #64748b; font-size: 13px; line-height: 20px; }
.abandon-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.abandon-actions button { height: 38px; border: 0; border-radius: 999px; font-size: 13px; font-weight: 950; }
.abandon-actions .cancel { background: #f8fafc; color: #475569; }
.abandon-actions .confirm { background: #ef4444; color: #fff; box-shadow: 0 8px 18px rgba(239,68,68,.18); }
.abandon-actions .confirm:disabled { opacity: .58; }
.profile-row { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 12px; border: 0; border-bottom: 1px solid #eef2f7; background: transparent; padding: 15px 17px; text-align: left; }
.profile-row:last-child { border-bottom: 0; }
.profile-row span { color: #334155; font-size: 15px; font-weight: 900; }
.profile-row strong { flex: 1; min-width: 0; color: #64748b; font-size: 13px; font-weight: 800; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.click-arrow { flex: none; color: #cbd5e1; }
.stat-arrow { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: #cbd5e1; }
.profile-row.danger span { color: #ef4444; }
.empty-card { padding: 34px 0; }
.bottom-tab {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 28;
  display: grid;
  grid-template-columns: 1fr 104px 1fr;
  align-items: center;
  gap: 8px;
  height: calc(54px + env(safe-area-inset-bottom));
  border: 1px solid rgba(255,255,255,.84);
  border-bottom: 0;
  border-radius: 22px 22px 0 0;
  background: rgba(255,255,255,.94);
  box-shadow: none;
  backdrop-filter: blur(12px);
  padding: 5px 12px calc(5px + env(safe-area-inset-bottom));
}
.bottom-tab.paired { grid-template-columns: repeat(2, 1fr); }
.bottom-tab > button:not(.quick-claim) { display: flex; height: 40px; flex-direction: column; align-items: center; justify-content: center; gap: 1px; border: 0; border-radius: 16px; background: transparent; color: #94a3b8; font-size: 10px; font-weight: 900; }
.bottom-tab > button.active:not(.quick-claim) { background: #f1f5f9; color: #111827; }
.quick-claim { height: 40px; border: 0; border-radius: 999px; background: var(--theme-solid); color: #fff; box-shadow: none; font-size: 13px; font-weight: 950; }
@media (min-width: 520px) {
  .shell { max-width: 430px; margin: 0 auto; }
  .bottom-tab { left: 50%; right: auto; width: 430px; transform: translateX(-50%); }
}
</style>
