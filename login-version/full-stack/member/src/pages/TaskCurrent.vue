<template>
  <main class="current-shell">
    <section class="page-body current-page-body">
      <van-empty v-if="!loading && !current" description="暂无进行中的任务" class="empty-card">
        <van-button round color="#0b0b19" @click="router.replace('/')">返回任务大厅</van-button>
      </van-empty>

      <template v-else-if="current">
        <section class="current-content-stack">
          <article class="current-task-card" :style="currentTaskCardStyle">
            <div class="current-task-head">
              <div class="current-task-meta">
                <span class="platform-chip" :style="currentTaskChipStyle">{{ platformLabel(task.platform) }}</span>
                <span>{{ task.authorName || '未知作者' }}</span>
              </div>
              <strong class="task-reward">¥{{ formatCent(task.rewardAmount) }}</strong>
            </div>
            <h1>{{ task.title || '未命名任务' }}</h1>
            <p>{{ task.copywriting || '按页面步骤完成互动，提交截图后由运营审核结算。' }}</p>
          </article>

          <TaskSteps
            :key="currentTaskKey"
            distribution-mode
            :platform="legacyPlatform"
            :post-id="numericPostId"
            :tenants-id="task.tenantId || DEFAULT_TENANTS_ID"
            :post-url="primaryPostUrl"
            :post-urls="postUrls"
            :initial-user-name="initialUserName"
            :initial-user-phone="initialUserPhone"
            :homepage-proof-cache-user-id="homepageProofCacheUserId"
            :homepage-proof-cache-task-account-id="homepageProofCacheTaskAccountId"
            :homepage-proof-cache-task-account-count="homepageProofCacheTaskAccountCount"
            :initial-visitor-token="visitorToken"
            :initial-claim-record-id="claimRecordId"
            :initial-claimed-comment="commentContent"
            @refresh-detail="loadCurrent"
            @distribution-completed="handleCompleted"
          />

          <section class="page-helper-card">
            <div class="helper-icon"><van-icon name="shield-o" size="18" /></div>
            <div>
              <h3>提交后由运营审核结算</h3>
              <p>完成互动并上传截图后，系统会保留当前任务进度，审核通过后会自动计入收益明细。</p>
            </div>
          </section>
        </section>
      </template>

      <van-skeleton v-else title :row="8" class="loading-card" />
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import TaskSteps from '@/components/TaskSteps.vue'
import { getDistributionMe } from '@/api'
import { resolveDefaultTenantsId } from '@/constant'
import { getThemeStyleVars, normalizeLegacyPlatform, platformLabel, resolveDistributionPlatformParam } from '@/utils/platform'
import { useCurrentPostStore } from '@/store/current'

const router = useRouter()
const store = useCurrentPostStore()
const DEFAULT_TENANTS_ID = resolveDefaultTenantsId()
const CURRENT_TASK_CACHE_VERSION = 3
const EXTERNAL_RETURN_REFRESH_KEY = 'distributionExternalReturnRefreshAt'

function readCachedCurrent() {
  try {
    const raw = localStorage.getItem('distributionCurrentTask')
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function knownLegacyPlatform(value: unknown) {
  const platform = normalizeLegacyPlatform(value)
  return platform === 'unknown' ? '' : platform
}

function firstKnownPlatformRaw(...values: unknown[]) {
  return resolveDistributionPlatformParam(...values)
}

function taskIdentityCandidates(value: any) {
  const t = value?.task || {}
  return [
    value?.participantId,
    value?.visitorToken,
    t.id,
    value?.taskId,
    value?.dailyTaskId,
    value?.postId,
    t.postId,
    t.dailyTaskId,
    value?.id,
  ]
    .map(item => String(item ?? '').trim())
    .filter(Boolean)
}

function isSameCurrentTask(a: any, b: any) {
  const left = taskIdentityCandidates(a)
  const right = new Set(taskIdentityCandidates(b))
  return left.some(item => right.has(item))
}

function normalizeUrlList(value: any) {
  if (Array.isArray(value)) return value.map((item: any) => String(item || '').trim()).filter(Boolean)
  const one = String(value || '').trim()
  return one ? [one] : []
}

function mergeCurrentWithCached(value: any, cached: any) {
  if (!value) return null
  if (!cached) return value

  const sameTask = isSameCurrentTask(value, cached)
  const currentParticipantId = String(value?.participantId || '').trim()
  const cachedParticipantId = String(cached?.participantId || '').trim()
  if (!sameTask && currentParticipantId && cachedParticipantId && currentParticipantId !== cachedParticipantId) return value

  const currentTask = value?.task || {}
  const cachedTask = cached?.task || {}
  const cacheTrusted = Number(cached?.__snapshotVersion || 0) >= CURRENT_TASK_CACHE_VERSION
  const currentPlatformRaw = firstKnownPlatformRaw(currentTask.platform, value?.platform, currentTask.videoUrl, value)
  const cachedPlatformRaw = firstKnownPlatformRaw(cachedTask.platform, cached?.platform, cachedTask.videoUrl, cached)
  const preferredPlatformRaw = currentPlatformRaw || (cacheTrusted ? cachedPlatformRaw : '')
  const currentUrls = normalizeUrlList(currentTask.videoUrl)
  const cachedUrls = normalizeUrlList(cachedTask.videoUrl)
  const canReuseCachedUrls = cacheTrusted && cachedUrls.length && !currentUrls.length && (!currentPlatformRaw || !cachedPlatformRaw || currentPlatformRaw === cachedPlatformRaw)
  const mergedTask = cacheTrusted ? { ...cachedTask, ...currentTask } : { ...currentTask }

  if (preferredPlatformRaw) mergedTask.platform = preferredPlatformRaw
  if (canReuseCachedUrls) mergedTask.videoUrl = cachedTask.videoUrl
  if (cacheTrusted && cachedTask.title && !currentTask.title) mergedTask.title = cachedTask.title
  if (cacheTrusted && cachedTask.authorName && !currentTask.authorName) mergedTask.authorName = cachedTask.authorName

  return {
    ...cached,
    ...value,
    task: mergedTask,
  }
}

const cachedOnEntry = readCachedCurrent()
const current = ref<any>(cachedOnEntry)
const cachedCurrent = ref<any>(cachedOnEntry)
const me = ref<any>(null)
const loadedCurrentFromServer = ref(false)
const loading = ref(!cachedOnEntry)

const task = computed(() => current.value?.task || {})
const currentTaskKey = computed(() => `${String(current.value?.participantId || current.value?.id || current.value?.taskId || task.value?.id || 'current')}:${legacyPlatform.value}`)
const postUrls = computed(() => {
  const urls = normalizeUrlList(task.value?.videoUrl)
  if (urls.length) return urls
  return normalizeUrlList(cachedCurrent.value?.task?.videoUrl)
})
const primaryPostUrl = computed(() => postUrls.value[0] || '')
const numericPostId = computed(() => {
  const raw = Number(task.value?.postId || task.value?.id || current.value?.taskId || 0)
  return Number.isFinite(raw) && raw > 0 ? raw : 0
})
const legacyPlatform = computed(() => {
  const cacheTrusted = Number(cachedCurrent.value?.__snapshotVersion || 0) >= CURRENT_TASK_CACHE_VERSION
  if (!cacheTrusted && !loadedCurrentFromServer.value) return 'unknown'
  const raw = cacheTrusted
    ? firstKnownPlatformRaw(task.value?.platform, current.value?.platform, task.value?.videoUrl, current.value, cachedCurrent.value?.task?.platform, cachedCurrent.value?.platform, cachedCurrent.value?.task?.videoUrl)
    : firstKnownPlatformRaw(task.value?.platform, current.value?.platform, task.value?.videoUrl, current.value)
  return knownLegacyPlatform(raw) || 'unknown'
})
const commentContent = computed(() => String(current.value?.commentContent || current.value?.visitor?.currentCommentContent || '').trim())
const visitorToken = computed(() => String(current.value?.visitorToken || current.value?.visitor?.visitorToken || '').trim())
const claimRecordId = computed(() => String(current.value?.commentId || current.value?.visitor?.currentCommentId || '').trim())
const initialUserName = computed(() => String(me.value?.user?.nickname || current.value?.visitor?.visitorName || '').trim())
const initialUserPhone = computed(() => String(me.value?.user?.phone || current.value?.visitor?.phone || '').trim())
const homepageProofCacheUserId = computed(() => String(me.value?.user?.id || '').trim())
const homepageProofCacheTaskAccountId = computed(() => String(current.value?.taskAccountId || me.value?.activeTaskAccount?.id || '').trim())
const homepageProofCacheTaskAccountCount = computed(() => Array.isArray(me.value?.taskAccounts) ? me.value.taskAccounts.length : 0)
const currentTaskCardStyle = computed(() => getThemeStyleVars(task.value?.platform))
const currentTaskChipStyle = computed(() => getThemeStyleVars(task.value?.platform))


function formatCent(value: any) {
  return (Number(value || 0) / 100).toFixed(2)
}

function cacheCurrent(value: any) {
  try {
    if (value) {
      const previousCached = cachedCurrent.value
      const merged = mergeCurrentWithCached(value, previousCached)
      if (merged?.task && !merged.task.platform) {
        const platform = firstKnownPlatformRaw(merged.task.platform, merged.platform, merged.task.videoUrl, previousCached?.task?.platform, previousCached?.platform, previousCached?.task?.videoUrl)
        if (platform) merged.task.platform = platform
      }
      if (merged) merged.__snapshotVersion = CURRENT_TASK_CACHE_VERSION
      cachedCurrent.value = merged
      localStorage.setItem('distributionCurrentTask', JSON.stringify(merged))
      return merged
    }
    cachedCurrent.value = null
    localStorage.removeItem('distributionCurrentTask')
  } catch {}
  return value
}

function syncLegacyStore() {
  const t = task.value || {}
  if (t.tenantId || DEFAULT_TENANTS_ID) store.setTenantsId(t.tenantId || DEFAULT_TENANTS_ID)
  store.setCurrentPostId(numericPostId.value || null)
  if (initialUserName.value) store.setExternalUserName(initialUserName.value)
  if (initialUserPhone.value) store.setExternalUserPhone(initialUserPhone.value)
  if (visitorToken.value) store.setVisitorToken(visitorToken.value)
  if (commentContent.value) store.setCurSelectComment(commentContent.value)
  if (claimRecordId.value) store.setClaimedCommentId(claimRecordId.value)
}

async function loadCurrent(options: { silent?: boolean } = {}) {
  if (!options.silent || !current.value) loading.value = true
  try {
    const res: any = await getDistributionMe()
    const data = res?.data || res
    me.value = data
    loadedCurrentFromServer.value = true
    current.value = cacheCurrent(data?.currentTask || null)
    if (!current.value) return
    syncLegacyStore()
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.response?.data?.msg || e?.message || '当前任务加载失败'
    showToast(Array.isArray(msg) ? msg.join('；') : msg)
  } finally {
    loading.value = false
  }
}

function handleCompleted() {
  cacheCurrent(null)
  router.replace('/')
}

function readExternalReturnMark() {
  try {
    const value = Number(sessionStorage.getItem(EXTERNAL_RETURN_REFRESH_KEY) || localStorage.getItem(EXTERNAL_RETURN_REFRESH_KEY) || 0)
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

function clearExternalReturnMark() {
  try { sessionStorage.removeItem(EXTERNAL_RETURN_REFRESH_KEY) } catch {}
  try { localStorage.removeItem(EXTERNAL_RETURN_REFRESH_KEY) } catch {}
}

let returnRefreshing = false
async function refreshAfterExternalReturn() {
  const markedAt = readExternalReturnMark()
  if (!markedAt || Date.now() - markedAt > 5 * 60 * 1000 || returnRefreshing) return
  returnRefreshing = true
  try {
    await loadCurrent({ silent: true })
  } finally {
    clearExternalReturnMark()
    returnRefreshing = false
  }
}

function handlePageShow() {
  refreshAfterExternalReturn()
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') refreshAfterExternalReturn()
}

onMounted(() => {
  loadCurrent()
  window.addEventListener('pageshow', handlePageShow)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onBeforeUnmount(() => {
  window.removeEventListener('pageshow', handlePageShow)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<style scoped>
.current-shell {
  box-sizing: border-box;
  min-height: 100dvh;
  background: #ffffff;
  color: #0f172a;
}
.page-body {
  min-height: 100dvh;
  padding: 12px 12px calc(36px + env(safe-area-inset-bottom));
}
.current-page-body {
  display: flex;
  flex-direction: column;
}
.current-content-stack {
  display: flex;
  flex: 1;
  flex-direction: column;
}
.current-task-card {
  position: relative;
  margin: 0 10px 14px;
  border: 1px solid var(--theme-card-border, rgba(226, 232, 240, .95));
  border-radius: 22px;
  background: var(--theme-card-bg, linear-gradient(180deg, #ffffff 0%, #fafbfc 100%));
  box-shadow: 0 10px 24px rgba(16, 24, 40, 0.06);
  padding: 16px 16px 17px;
  overflow: hidden;
}
.current-task-card::before {
  content: '';
  position: absolute;
  left: 18px;
  top: 18px;
  width: 4px;
  height: 16px;
  border-radius: 999px;
  background: var(--theme-solid, #111827);
}
.current-task-card .current-task-head,
.current-task-card h1,
.current-task-card p {
  position: relative;
  z-index: 1;
}
.current-task-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.current-task-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding-left: 12px;
  color: #64748b;
  font-size: 12px;
  font-weight: 900;
}
.platform-chip {
  flex: none;
  border-radius: 999px;
  background: var(--theme-pill-bg);
  color: var(--theme-pill-text);
  padding: 4px 9px;
  box-shadow: none;
}
.task-reward {
  flex: none;
  color: #f97316;
  font-size: 16px;
  line-height: 1;
}
.current-task-card h1 {
  margin: 12px 0 6px;
  color: #0f172a;
  font-size: 18px;
  line-height: 25px;
  font-weight: 950;
}
.current-task-card p {
  margin: 0;
  color: #64748b;
  font-size: 13px;
  line-height: 20px;
}
.empty-card,
.loading-card {
  margin: 0 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 22px;
  background: var(--theme-card-bg, #fff);
  box-shadow: none;
  backdrop-filter: none;
}

.page-helper-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin: 0 10px;
  padding: 14px 15px;
  border: 1px solid #e7efea;
  border-radius: 20px;
  background: #ffffff;
  box-shadow: 0 8px 20px rgba(16, 24, 40, 0.04);
}

.helper-icon {
  flex: none;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: #ebf8f0;
  color: #07c160;
}
.page-helper-card h3 {
  margin: 1px 0 4px;
  color: #133128;
  font-size: 14px;
  line-height: 20px;
  font-weight: 900;
}
.page-helper-card p {
  margin: 0;
  color: #6d877c;
  font-size: 12px;
  line-height: 18px;
}

@media (min-width: 520px) {
  .current-shell { max-width: 430px; margin: 0 auto; }
}
</style>
