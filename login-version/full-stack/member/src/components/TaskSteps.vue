<template>
  <section class="mt-[10px] px-[10px] pb-[30px] flex flex-col gap-[14px]">
    <DouyinSteps
      v-if="normalizedPlatform === 'douyin'"
      :task-stage="taskStage"
      :claim-loading="claimLoading"
      :claimed-comment="currentClaimedComment"
      :user-name="userName"
      :user-phone="userPhone"
      :proof-images="proofImages"
      :proof-file-ids="proofFileIds"
      :homepage-proof-images="homepageProofImages"
      :homepage-proof-file-ids="homepageProofFileIds"
      :homepage-recognition="homepageRecognition"
      :platform-theme-color="platformThemeColor"
      :show-step2-retry-actions="showStep2RetryActions"
      :claim-record-id="claimRecordId"
      :start-task-disabled="props.startTaskDisabled"
      :distribution-mode="props.distributionMode"
      @update:user-name="userName = $event"
      @update:user-phone="userPhone = $event"
      @update:proof-images="proofImages = $event"
      @update:proof-file-ids="proofFileIds = $event"
      @update:homepage-proof-images="homepageProofImages = $event"
      @update:homepage-proof-file-ids="homepageProofFileIds = $event"
      @homepage-proof-image-error="handleHomepageProofImageError"
      @start-task-flow="handleStartTaskFlowClick"
      @claim-comment="handleClaimCommentClick"
      @retry-claim-comment="handleRetryClaimCommentClick"
      @retry-open-post-link="handleRetryOpenPostLinkClick"
      @reset-step="handleResetStepClick"
      @complete="handleCompleteClick"
      @copy-comment="handleCopyCenterClick"
      @open-video="handleOpenWeixinVideoClick"
    />
    <XiaohongshuSteps
      v-else-if="normalizedPlatform === 'xiaohongshu'"
      :task-stage="taskStage"
      :claim-loading="claimLoading"
      :claimed-comment="currentClaimedComment"
      :user-name="userName"
      :user-phone="userPhone"
      :proof-images="proofImages"
      :proof-file-ids="proofFileIds"
      :homepage-proof-images="homepageProofImages"
      :homepage-proof-file-ids="homepageProofFileIds"
      :homepage-recognition="homepageRecognition"
      :platform-theme-color="platformThemeColor"
      :show-step2-retry-actions="showStep2RetryActions"
      :claim-record-id="claimRecordId"
      :start-task-disabled="props.startTaskDisabled"
      :distribution-mode="props.distributionMode"
      @update:user-name="userName = $event"
      @update:user-phone="userPhone = $event"
      @update:proof-images="proofImages = $event"
      @update:proof-file-ids="proofFileIds = $event"
      @update:homepage-proof-images="homepageProofImages = $event"
      @update:homepage-proof-file-ids="homepageProofFileIds = $event"
      @homepage-proof-image-error="handleHomepageProofImageError"
      @start-task-flow="handleStartTaskFlowClick"
      @claim-comment="handleClaimCommentClick"
      @retry-claim-comment="handleRetryClaimCommentClick"
      @retry-open-post-link="handleRetryOpenPostLinkClick"
      @reset-step="handleResetStepClick"
      @complete="handleCompleteClick"
      @copy-comment="handleCopyCenterClick"
    />
    <WeixinSteps
      v-else-if="normalizedPlatform === 'weixin'"
      :task-stage="taskStage"
      :claim-loading="claimLoading"
      :claimed-comment="currentClaimedComment"
      :user-name="userName"
      :user-phone="userPhone"
      :proof-images="proofImages"
      :proof-file-ids="proofFileIds"
      :homepage-proof-images="homepageProofImages"
      :homepage-proof-file-ids="homepageProofFileIds"
      :homepage-recognition="homepageRecognition"
      :platform-theme-color="platformThemeColor"
      :show-step2-retry-actions="showStep2RetryActions"
      :claim-record-id="claimRecordId"
      :start-task-disabled="props.startTaskDisabled"
      :distribution-mode="props.distributionMode"
      @update:user-name="userName = $event"
      @update:user-phone="userPhone = $event"
      @update:proof-images="proofImages = $event"
      @update:proof-file-ids="proofFileIds = $event"
      @update:homepage-proof-images="homepageProofImages = $event"
      @update:homepage-proof-file-ids="homepageProofFileIds = $event"
      @homepage-proof-image-error="handleHomepageProofImageError"
      @start-task-flow="handleStartTaskFlowClick"
      @claim-comment="handleClaimCommentClick"
      @retry-claim-comment="handleRetryClaimCommentClick"
      @retry-open-post-link="handleRetryOpenPostLinkClick"
      @reset-step="handleResetStepClick"
      @complete="handleCompleteClick"
      @copy-comment="handleCopyCenterClick"
      @open-video="handleOpenWeixinVideoClick"
    />
    <section v-else class="rounded-[20px] bg-white p-[18px] text-[14px] text-[#64748b] shadow-[0_8px_24px_rgba(15,23,42,0.06)]">当前任务平台暂不支持，请联系管理员检查任务平台配置。</section>
    <van-popup class="!rounded-[24px]" v-model:show="copyCenterVisible" :style="{ padding: '24px', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(12px)', width: '85%', maxWidth: '420px', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }">
      <div class="flex flex-col gap-[16px]">
        <div class="text-[16px] font-bold text-center text-[#111]">评论内容</div>
        <div class="p-[16px] rounded-[16px] bg-[#f8f9fa] text-[14px] text-[#333] leading-relaxed border border-[#e5e7eb] shadow-inner" style="word-break: break-all;">{{ currentClaimedComment }}</div>
        <div class="mt-[8px] text-center w-full">
          <van-button class="w-full !rounded-full !h-[42px] !font-medium shadow-[0_4px_12px_rgba(0,0,0,0.1)]" type="primary" :color="platformThemeColor" @click="handleCopyCenterClick">一键复制评论</van-button>
        </div>
      </div>
    </van-popup>
    <van-popup
      class="!rounded-[24px]"
      v-model:show="weixinClaimCommentVisible"
      :close-on-click-overlay="false"
      :style="{ padding: '24px', backgroundColor: 'rgba(255, 255, 255, 0.98)', backdropFilter: 'blur(12px)', width: '88%', maxWidth: '420px', boxShadow: '0 20px 40px rgba(0,0,0,0.12)' }"
    >
      <div class="flex flex-col gap-[16px]">
        <div class="text-[17px] font-bold text-center text-[#111]">评论领取成功</div>
        <div class="text-[14px] text-[#4b5563] leading-relaxed rounded-[16px] bg-[#f8fafc] border border-[#e5e7eb] p-[14px]">
          请先确认评论已复制，然后点击下方按钮打开微信视频号作品并发布评论。苹果设备如未自动复制，请务必手动点击“一键复制评论”。
        </div>
        <div class="p-[16px] rounded-[16px] bg-[#f8f9fa] text-[15px] text-[#222] leading-relaxed border border-[#e5e7eb] shadow-inner max-h-[160px] overflow-y-auto" style="word-break: break-all; white-space: pre-wrap;">{{ currentClaimedComment }}</div>
        <div class="flex flex-col gap-[12px] mt-[4px]">
          <van-button class="w-full !rounded-full !h-[42px] !font-medium shadow-[0_4px_12px_rgba(0,0,0,0.1)]" type="primary" :color="platformThemeColor" @click="handleCopyCenterClick">一键复制评论</van-button>
          <van-button class="w-full !rounded-full !h-[42px] !font-medium" plain type="primary" :color="platformThemeColor" @click="handleWeixinClaimPopupConfirmClick">我已复制，打开视频号</van-button>
        </div>
      </div>
    </van-popup>
    <FlowGuidePopup v-model:show="flowGuideVisible" :image-url="startFlowGuideImageUrl" :close-on-click-overlay="false">
      <template #content>
        <div class="max-h-[75vh] overflow-y-auto pr-[4px] flex flex-col gap-[20px] custom-scrollbar">
          <template v-if="isDouyin">
            <div class="rounded-[20px] bg-white border border-[#f0f0f0] shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-[16px] flex flex-col gap-[12px]">
              <div class="text-[15px] font-bold text-[#111] border-b border-[#f5f5f5] pb-[10px]">请断开 wifi 连接，并打开抖音 app，完成以下操作</div>
              <div class="flex flex-col gap-[8px] mt-[4px]">
                <div class="flex items-start gap-[8px]"><span class="w-[18px] h-[18px] rounded-full bg-[#f4f6f9] text-[#555] flex items-center justify-center text-[12px] font-bold mt-[2px]">1</span><span class="text-[14px] text-[#4b5563] leading-relaxed flex-1">复制抖音链接</span></div>
                <div class="flex items-start gap-[8px]"><span class="w-[18px] h-[18px] rounded-full bg-[#f4f6f9] text-[#555] flex items-center justify-center text-[12px] font-bold mt-[2px]">2</span><span class="text-[14px] text-[#4b5563] leading-relaxed flex-1">回到抖音 app ，自动等待识别弹出帖子弹窗</span></div>
                <div class="flex items-start gap-[8px]"><span class="w-[18px] h-[18px] rounded-full bg-[#f4f6f9] text-[#555] flex items-center justify-center text-[12px] font-bold mt-[2px]">3</span><span class="text-[14px] text-[#4b5563] leading-relaxed flex-1">点击打开看看</span></div>
              </div>
              <div class="mt-[8px] overflow-hidden rounded-[12px] border border-[#f0f0f0] shadow-sm">
                <img class="w-full cursor-zoom-in hover:scale-105 transition-transform duration-300" :src="startFlowGuideImageUrl" @error="handleGuideImageError" :alt="flowGuideImageAltText" @click="openGuidePreview(0, 'start')" />
              </div>
            </div>
          </template>
          <template v-else-if="isXiaohongshu">
            <div class="rounded-[20px] bg-white border border-[#f0f0f0] shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-[16px] flex flex-col gap-[12px]">
              <div class="text-[15px] font-bold text-[#111] border-b border-[#f5f5f5] pb-[10px]">{{ flowGuideTitleText }}</div>
              <div v-if="detectMobileOS() === 'android'" class="flex flex-col gap-[8px] mt-[4px]">
                <div class="flex items-start gap-[8px]"><span class="w-[18px] h-[18px] rounded-full bg-[#f4f6f9] text-[#555] flex items-center justify-center text-[12px] font-bold mt-[2px]">1</span><span class="text-[14px] text-[#4b5563] leading-relaxed flex-1">点击左上角点点按钮</span></div>
                <div class="flex items-start gap-[8px]"><span class="w-[18px] h-[18px] rounded-full bg-[#f4f6f9] text-[#555] flex items-center justify-center text-[12px] font-bold mt-[2px]">2</span><span class="text-[14px] text-[#4b5563] leading-relaxed flex-1">对话框中点击发送按钮</span></div>
                <div class="flex items-start gap-[8px]"><span class="w-[18px] h-[18px] rounded-full bg-[#f4f6f9] text-[#555] flex items-center justify-center text-[12px] font-bold mt-[2px]">3</span><span class="text-[14px] text-[#4b5563] leading-relaxed flex-1">点击对话框中的笔记</span></div>
                <div class="flex items-start gap-[8px]"><span class="w-[18px] h-[18px] rounded-full bg-[#f4f6f9] text-[#555] flex items-center justify-center text-[12px] font-bold mt-[2px]">4</span><span class="text-[14px] text-[#4b5563] leading-relaxed flex-1">打开微信</span></div>
              </div>
              <div v-else class="flex flex-col gap-[8px] mt-[4px]">
                <div class="flex items-start gap-[8px]"><span class="w-[18px] h-[18px] rounded-full bg-[#f4f6f9] text-[#555] flex items-center justify-center text-[12px] font-bold mt-[2px]">1</span><span class="text-[14px] text-[#4b5563] leading-relaxed flex-1">{{ flowGuideFirstStepText }}</span></div>
                <div class="flex items-start gap-[8px]"><span class="w-[18px] h-[18px] rounded-full bg-[#f4f6f9] text-[#555] flex items-center justify-center text-[12px] font-bold mt-[2px]">2</span><span class="text-[14px] text-[#4b5563] leading-relaxed flex-1">点击查看笔记</span></div>
                <div class="flex items-start gap-[8px]"><span class="w-[18px] h-[18px] rounded-full bg-[#f4f6f9] text-[#555] flex items-center justify-center text-[12px] font-bold mt-[2px]">3</span><span class="text-[14px] text-[#4b5563] leading-relaxed flex-1">打开微信</span></div>
              </div>
              <div class="mt-[8px] overflow-hidden rounded-[12px] border border-[#f0f0f0] shadow-sm">
                <img class="w-full cursor-zoom-in hover:scale-105 transition-transform duration-300" :src="startFlowGuideImageUrl" @error="handleGuideImageError" :alt="flowGuideImageAltText" @click="openGuidePreview(0, 'start')" />
              </div>
            </div>
          </template>
          <template v-else>
            <div class="rounded-[20px] bg-white border border-[#f0f0f0] shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-[16px] flex flex-col gap-[12px]">
              <div class="text-[15px] font-bold text-[#111] flex items-center gap-[8px]"><span class="w-[24px] h-[24px] rounded-full bg-[#f4f6f9] text-[#333] flex items-center justify-center text-[13px] font-bold">1</span> 点击助推按钮查看完整流程</div>
              <div class="overflow-hidden rounded-[12px] border border-[#f0f0f0] shadow-sm">
                <img class="w-full cursor-zoom-in hover:scale-105 transition-transform duration-300" :src="startFlowGuideImageUrl" @error="handleGuideImageError" alt="微信第一步流程示意图" @click="openGuidePreview(0, 'start')" />
              </div>
            </div>
            <div class="rounded-[20px] bg-white border border-[#f0f0f0] shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-[16px] flex flex-col gap-[12px]">
              <div class="text-[15px] font-bold text-[#111] flex items-center gap-[8px]"><span class="w-[24px] h-[24px] rounded-full bg-[#f4f6f9] text-[#333] flex items-center justify-center text-[13px] font-bold">2</span> 完成互动后返回页面领取评论</div>
              <div class="overflow-hidden rounded-[12px] border border-[#f0f0f0] shadow-sm">
                <img class="w-full cursor-zoom-in hover:scale-105 transition-transform duration-300" :src="startFlowGuideImageUrl" @error="handleGuideImageError" alt="微信第二步流程示意图" @click="openGuidePreview(1, 'start')" />
              </div>
            </div>
            <div class="rounded-[20px] bg-white border border-[#f0f0f0] shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-[16px] flex flex-col gap-[12px]">
              <div class="text-[15px] font-bold text-[#111] flex items-center gap-[8px]"><span class="w-[24px] h-[24px] rounded-full bg-[#f4f6f9] text-[#333] flex items-center justify-center text-[13px] font-bold">3</span> 复制评论并确认完成任务</div>
              <div class="overflow-hidden rounded-[12px] border border-[#f0f0f0] shadow-sm">
                <img class="w-full cursor-zoom-in hover:scale-105 transition-transform duration-300" :src="startFlowGuideImageUrl" @error="handleGuideImageError" alt="微信第三步流程示意图" @click="openGuidePreview(2, 'start')" />
              </div>
            </div>
          </template>
        </div>
      </template>
      <template #footer="{ close }">
        <div class="flex flex-col gap-[12px] pt-[10px]">
          <van-button class="w-full !rounded-full !h-[44px] !font-medium" plain size="normal" type="primary" :color="platformThemeColor" @click="handleCopyPostUrlClick">重新复制视频链接</van-button>
          <van-button class="w-full !rounded-full !h-[42px] !font-medium shadow-[0_4px_12px_rgba(0,0,0,0.1)]" size="normal" type="primary" :color="platformThemeColor" @click="close">{{ flowGuideConfirmText }}</van-button>
        </div>
      </template>
    </FlowGuidePopup>
    <FlowGuidePopup v-model:show="claimFlowGuideVisible" :image-url="claimFlowGuideImageUrl" :close-on-click-overlay="false">
      <template #content>
        <div class="rounded-[20px] bg-white border border-[#f0f0f0] shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-[16px] flex flex-col gap-[12px]">
          <div class="text-[15px] font-bold text-[#111] border-b border-[#f5f5f5] pb-[10px]">{{ claimGuideTitleText }}</div>
          <div class="flex flex-col gap-[8px] mt-[4px]">
            <div class="flex items-start gap-[8px]"><span class="w-[18px] h-[18px] rounded-full bg-[#f4f6f9] text-[#555] flex items-center justify-center text-[12px] font-bold mt-[2px]">1</span><span class="text-[14px] text-[#4b5563] leading-relaxed flex-1">发送评论</span></div>
            <div class="flex items-start gap-[8px]"><span class="w-[18px] h-[18px] rounded-full bg-[#f4f6f9] text-[#555] flex items-center justify-center text-[12px] font-bold mt-[2px]">2</span><span class="text-[14px] text-[#4b5563] leading-relaxed flex-1">完整看完视频</span></div>
            <div class="flex items-start gap-[8px]"><span class="w-[18px] h-[18px] rounded-full bg-[#f4f6f9] text-[#555] flex items-center justify-center text-[12px] font-bold mt-[2px]">3</span><span class="text-[14px] text-[#4b5563] leading-relaxed flex-1">点击点赞、收藏，并进行分享（分享可发到微信）</span></div>
          </div>
          <div class="mt-[8px] overflow-hidden rounded-[12px] border border-[#f0f0f0] shadow-sm">
            <img class="w-full cursor-zoom-in hover:scale-105 transition-transform duration-300" :src="claimFlowGuideImageUrl" @error="handleGuideImageError" :alt="claimGuideImageAltText" @click="openGuidePreview(0, 'claim')" />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex flex-col gap-[12px] pt-[10px]">
          <van-button class="w-full !rounded-full !h-[42px] !font-medium shadow-[0_4px_12px_rgba(0,0,0,0.1)]" size="normal" type="primary" :color="platformThemeColor" @click="handleCopyCenterClick">一键复制评论</van-button>
          <van-button class="w-full !rounded-full !h-[44px] !font-medium" plain size="normal" type="primary" :color="platformThemeColor" @click="handleClaimFlowNotCompletedClick">没完成，需要重新操作</van-button>
          <van-button class="w-full !rounded-full !h-[44px] !font-medium" plain size="normal" type="primary" :color="platformThemeColor" @click="handleClaimFlowCompletedClick">我全都完成了</van-button>
        </div>
      </template>
    </FlowGuidePopup>
    <van-image-preview
      v-model:show="guidePreviewVisible"
      :images="guidePreviewImages"
      :start-position="guidePreviewStart"
      closeable
    />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, onBeforeMount, onMounted, onBeforeUnmount } from 'vue'
import { showToast } from 'vant'
import { claimDistributionCurrentComment, completeDistributionCurrentTask, getDistributionHomepageProofAccess, getDistributionHomepageProofRecognition, publicClaimComment, publicConfirmComplete, requestDistributionHomepageProofRecognition, retainDistributionHomepageProof } from '@/api'
import { useCurrentPostStore } from '@/store/current'
import FlowGuidePopup from '@/components/FlowGuidePopup.vue'
import DouyinSteps from '@/pages/step/DouyinSteps.vue'
import XiaohongshuSteps from '@/pages/step/XiaohongshuSteps.vue'
import WeixinSteps from '@/pages/step/WeixinSteps.vue'
import { detectMobileOS } from '@/services/device'
import operationGuide from '@/assets/operation-guide.svg'
import { useClickThrottle } from '@/composables/useClickThrottle'
import { DEFAULT_PLATFORM_THEME_COLOR, PLATFORM_THEME_COLOR_MAP } from '@/constant'
import { normalizeLegacyPlatform, toDistributionPlatformParam } from '@/utils/platform'

const props = defineProps<{
  platform: string
  postId: number
  tenantsId: string | number
  postUrl: string
  postUrls?: string[]
  startTaskDisabled?: boolean
  distributionMode?: boolean
  initialClaimedComment?: string
  initialVisitorToken?: string
  initialClaimRecordId?: string
  initialUserName?: string
  initialUserPhone?: string
  homepageProofCacheUserId?: string
  homepageProofCacheTaskAccountId?: string
  homepageProofCacheTaskAccountCount?: number
}>()

const normalizedPlatform = computed(() => normalizeLegacyPlatform(props.platform))

const emit = defineEmits<{
  (e: 'refresh-detail'): void
  (e: 'distribution-completed'): void
}>()

const store = useCurrentPostStore()
const { runThrottled } = useClickThrottle()
const EXTERNAL_RETURN_REFRESH_KEY = 'distributionExternalReturnRefreshAt'
const taskStage = ref<'step1' | 'step2' | 'step3'>('step1')
const step2RetryMode = ref(false)
const claimLoading = ref(false)
const userName = ref(String(props.initialUserName || (store as any).externalUserName || ''))
watch(userName, (v) => { store.setExternalUserName(String(v || '')) })
const userPhone = ref(String(props.initialUserPhone || (store as any).externalUserPhone || ''))
watch(userPhone, (v) => { store.setExternalUserPhone(String(v || '').replace(/[^\d]/g, '').slice(0, 11)) })
const proofImages = ref<string[]>(Array.isArray((store as any).proofImages) ? (store as any).proofImages : [])
watch(proofImages, (v) => {
  const next = Array.isArray(v) ? v : []
  store.setProofImages(next)
  store.setPaymentCodeImage(String(next[0] || ''))
}, { deep: true })
const proofFileIds = ref<string[]>(Array.isArray((store as any).proofFileIds) ? (store as any).proofFileIds : [])
watch(proofFileIds, (v) => {
  const next = Array.isArray(v) ? v : []
  store.setProofFileIds(next)
  store.setPaymentCodeFileId(String(next[0] || ''))
}, { deep: true })
const homepageProofImages = ref<string[]>([])
const homepageProofFileIds = ref<string[]>([])
const LEGACY_PLATFORM_HOME_PROOF_CACHE_KEY = 'distributionPlatformHomeProofCache'
const PLATFORM_HOME_PROOF_CACHE_PREFIX = 'distributionPlatformHomeProofCache:'

type PlatformHomeProofEntry = { image?: string; fileId: string; updatedAt: number }
type PlatformHomeProofCache = Record<string, PlatformHomeProofEntry>

const homepageProofCacheUserId = computed(() => String(props.homepageProofCacheUserId || '').trim())
const homepageProofCacheTaskAccountId = computed(() => String(props.homepageProofCacheTaskAccountId || '').trim())
const homepageProofCacheTaskAccountCount = computed(() => Math.max(0, Number(props.homepageProofCacheTaskAccountCount || 0)))
const homepageProofPlatformCode = () => toDistributionPlatformParam(normalizedPlatform.value)

const readHomeProofCache = (key: string): PlatformHomeProofCache => {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const writeHomeProofCache = (key: string, cache: PlatformHomeProofCache) => {
  try {
    localStorage.setItem(key, JSON.stringify(cache))
  } catch {}
}

const scopedHomepageProofCacheKey = () => {
  const userId = homepageProofCacheUserId.value
  const taskAccountId = homepageProofCacheTaskAccountId.value
  return userId && taskAccountId ? `${PLATFORM_HOME_PROOF_CACHE_PREFIX}${userId}:${taskAccountId}` : ''
}

const previousUserScopedHomepageProofCacheKey = () => {
  const userId = homepageProofCacheUserId.value
  return userId ? `${PLATFORM_HOME_PROOF_CACHE_PREFIX}${userId}` : ''
}

const canSafelyMigrateLegacyHomepageProof = () => homepageProofCacheTaskAccountCount.value <= 1

let pendingLegacyHomepageProof: { platform: string; fileId: string; source: 'unscoped' | 'userScoped' } | null = null

const removeLegacyHomepageProof = (platform: string, fileId?: string) => {
  const legacy = readHomeProofCache(LEGACY_PLATFORM_HOME_PROOF_CACHE_KEY)
  const current = legacy[platform]
  if (!current || (fileId && String(current.fileId || '').trim() !== fileId)) return
  delete legacy[platform]
  writeHomeProofCache(LEGACY_PLATFORM_HOME_PROOF_CACHE_KEY, legacy)
}

const removePreviousUserScopedHomepageProof = (platform: string, fileId?: string) => {
  const key = previousUserScopedHomepageProofCacheKey()
  if (!key) return
  const cache = readHomeProofCache(key)
  const current = cache[platform]
  if (!current || (fileId && String(current.fileId || '').trim() !== fileId)) return
  delete cache[platform]
  writeHomeProofCache(key, cache)
}

const hydrateHomepageProofFromCache = () => {
  const platform = String(normalizedPlatform.value || '').trim()
  if (!platform) return

  if (props.distributionMode && !homepageProofCacheUserId.value) {
    // 当前登录用户尚未确认时，不读取旧的浏览器缓存，避免同一设备切换账号时短暂展示他人的截图。
    pendingLegacyHomepageProof = null
    homepageProofImages.value = []
    homepageProofFileIds.value = []
    return
  }

  const scopedKey = scopedHomepageProofCacheKey()
  const scoped = scopedKey ? readHomeProofCache(scopedKey)[platform] : undefined
  const previousUserScoped = !scoped && props.distributionMode && canSafelyMigrateLegacyHomepageProof()
    ? readHomeProofCache(previousUserScopedHomepageProofCacheKey())[platform]
    : undefined
  const legacy = !scoped && !previousUserScoped && props.distributionMode && canSafelyMigrateLegacyHomepageProof()
    ? readHomeProofCache(LEGACY_PLATFORM_HOME_PROOF_CACHE_KEY)[platform]
    : undefined
  const cached = scoped || previousUserScoped || legacy
  const fileId = String(cached?.fileId || '').trim()
  if (!fileId) {
    // 没有稳定 fileId 的旧链接无法经后端校验，也不能安全续签；直接移除该无效缓存。
    if (scoped && scopedKey) {
      const cache = readHomeProofCache(scopedKey)
      delete cache[platform]
      writeHomeProofCache(scopedKey, cache)
    }
    if (previousUserScoped) removePreviousUserScopedHomepageProof(platform)
    if (legacy) removeLegacyHomepageProof(platform)
    pendingLegacyHomepageProof = null
    homepageProofImages.value = []
    homepageProofFileIds.value = []
    return
  }

  pendingLegacyHomepageProof = !scoped && previousUserScoped
    ? { platform, fileId, source: 'userScoped' }
    : !scoped && legacy
      ? { platform, fileId, source: 'unscoped' }
      : null
  // 旧版本缓存没有用户维度，不能继续直接展示旧 URL；仅安全复用 fileId，并通过后端重新校验、签发。
  const image = scoped ? String(scoped.image || '').trim() : ''
  homepageProofImages.value = image ? [image] : []
  homepageProofFileIds.value = [fileId]
}

const persistHomepageProofForPlatform = () => {
  const platform = String(normalizedPlatform.value || '').trim()
  const scopedKey = scopedHomepageProofCacheKey()
  if (!platform || (props.distributionMode && (!scopedKey || !homepageProofCacheTaskAccountId.value))) return

  const image = String(homepageProofImages.value[0] || '').trim()
  const fileId = String(homepageProofFileIds.value[0] || '').trim()
  const pendingLegacy = pendingLegacyHomepageProof
  if (pendingLegacy && pendingLegacy.platform === platform) {
    if (fileId === pendingLegacy.fileId) {
      // 尚未完成后端归属校验的旧缓存只留在内存，不能写入当前账号的新缓存。
      return
    }
    if (pendingLegacy.source === 'userScoped') removePreviousUserScopedHomepageProof(platform, pendingLegacy.fileId)
    else removeLegacyHomepageProof(platform, pendingLegacy.fileId)
    pendingLegacyHomepageProof = null
  }

  const key = scopedKey || LEGACY_PLATFORM_HOME_PROOF_CACHE_KEY
  const cache = readHomeProofCache(key)
  if (fileId) {
    cache[platform] = { image, fileId, updatedAt: Date.now() }
  } else {
    delete cache[platform]
  }
  writeHomeProofCache(key, cache)
}

const applyHomepageProofAccess = (fileId: string, url: string) => {
  const currentFileId = String(homepageProofFileIds.value[0] || '').trim()
  if (!fileId || !url || currentFileId !== fileId) return false
  homepageProofImages.value = [url]
  return true
}

const getHttpStatus = (error: any) => {
  const status = Number(error?.response?.status || 0)
  return Number.isFinite(status) && status > 0 ? status : 0
}

const shouldClearHomepageProofCache = (error: any) => {
  const status = getHttpStatus(error)
  // 404：数据库记录或实际存储对象已不存在；403：当前账号已无权继续使用该缓存。
  // 网络、超时、5xx、登录失效都不能清缓存，避免误删用户仍可用的主页截图。
  return status === 403 || status === 404 || status === 410
}

const clearHomepageProofForCurrentPlatform = (fileId: string) => {
  const platform = String(normalizedPlatform.value || '').trim()
  const currentFileId = String(homepageProofFileIds.value[0] || '').trim()
  if (!platform || !fileId || (currentFileId && currentFileId !== fileId)) return false

  const scopedKey = scopedHomepageProofCacheKey()
  if (scopedKey) {
    const cache = readHomeProofCache(scopedKey)
    if (String(cache[platform]?.fileId || '').trim() === fileId) {
      delete cache[platform]
      writeHomeProofCache(scopedKey, cache)
    }
  }

  if (pendingLegacyHomepageProof?.platform === platform && pendingLegacyHomepageProof.fileId === fileId) {
    if (pendingLegacyHomepageProof.source === 'userScoped') removePreviousUserScopedHomepageProof(platform, fileId)
    else removeLegacyHomepageProof(platform, fileId)
    pendingLegacyHomepageProof = null
  }

  homepageProofImages.value = []
  homepageProofFileIds.value = []
  retainedHomepageProofKey = ''
  failedHomepageProofUrl = ''
  homepageProofRefreshAttemptedFileId = ''
  return true
}

const handleHomepageProofAccessFailure = (error: any, fileId: string) => {
  if (!shouldClearHomepageProofCache(error)) return false
  if (!clearHomepageProofForCurrentPlatform(fileId)) return false

  const status = getHttpStatus(error)
  showToast(status === 403 ? '用户主页截图已无权访问，请重新上传' : '用户主页截图已失效，请重新上传')
  return true
}

let retainedHomepageProofKey = ''
let retainingHomepageProof = false
let refreshingHomepageProof = false
let failedHomepageProofUrl = ''
let homepageProofRefreshAttemptedFileId = ''
let observedHomepageProofIdentity = ''
const homepageRecognition = ref<any>(null)
let homepageRecognitionTimer: ReturnType<typeof setTimeout> | null = null
let requestedHomepageRecognitionIdentity = ''

const recognitionTerminalStatuses = new Set(['SUCCEEDED', 'REVIEW_REQUIRED', 'FAILED', 'NOT_ENABLED'])
const clearHomepageRecognitionTimer = () => {
  if (homepageRecognitionTimer) clearTimeout(homepageRecognitionTimer)
  homepageRecognitionTimer = null
}

const getHomepageProofResponseData = (response: any) => response?.data ?? response ?? {}

const retainHomepageProofForCurrentUser = async () => {
  const fileId = String(homepageProofFileIds.value[0] || '').trim()
  const platform = homepageProofPlatformCode()
  if (!props.distributionMode || !homepageProofCacheUserId.value || !homepageProofCacheTaskAccountId.value || !fileId || !platform) return false
  const key = `${homepageProofCacheUserId.value}:${homepageProofCacheTaskAccountId.value}:${platform}:${fileId}`
  if (retainingHomepageProof || retainedHomepageProofKey === key) return false
  retainingHomepageProof = true
  try {
    const data: any = getHomepageProofResponseData(await retainDistributionHomepageProof({ fileId, platform, taskAccountId: homepageProofCacheTaskAccountId.value }))
    const url = String(data?.url || data?.fullUrl || '').trim()
    if (!url) throw new Error('主页截图访问地址获取失败')
    if (pendingLegacyHomepageProof?.platform === String(normalizedPlatform.value || '').trim() && pendingLegacyHomepageProof.fileId === fileId) {
      if (pendingLegacyHomepageProof.source === 'userScoped') removePreviousUserScopedHomepageProof(pendingLegacyHomepageProof.platform, fileId)
      else removeLegacyHomepageProof(pendingLegacyHomepageProof.platform, fileId)
      pendingLegacyHomepageProof = null
    }
    retainedHomepageProofKey = key
    failedHomepageProofUrl = ''
    applyHomepageProofAccess(fileId, url)
    void requestHomepageRecognition(fileId, platform)
    return true
  } catch (error: any) {
    handleHomepageProofAccessFailure(error, fileId)
    return false
  } finally {
    retainingHomepageProof = false
  }
}

const refreshHomepageProofAccess = async () => {
  const fileId = String(homepageProofFileIds.value[0] || '').trim()
  const platform = homepageProofPlatformCode()
  if (!props.distributionMode || !homepageProofCacheUserId.value || !homepageProofCacheTaskAccountId.value || !fileId || !platform || refreshingHomepageProof) return false
  refreshingHomepageProof = true
  try {
    const data: any = getHomepageProofResponseData(await getDistributionHomepageProofAccess(fileId, platform, homepageProofCacheTaskAccountId.value))
    const url = String(data?.url || data?.fullUrl || '').trim()
    if (!url) throw new Error('主页截图访问地址获取失败')
    failedHomepageProofUrl = ''
    applyHomepageProofAccess(fileId, url)
    return true
  } catch (error: any) {
    handleHomepageProofAccessFailure(error, fileId)
    return false
  } finally {
    refreshingHomepageProof = false
  }
}

const updateHomepageRecognition = (value: any) => {
  homepageRecognition.value = value || null
  const status = String(value?.status || '').toUpperCase()
  clearHomepageRecognitionTimer()
  if (status && !recognitionTerminalStatuses.has(status)) {
    homepageRecognitionTimer = setTimeout(() => {
      void refreshHomepageRecognition()
    }, 2500)
  }
}

const recognitionRequestParams = (platform: string) => ({
  platform,
  taskAccountId: homepageProofCacheTaskAccountId.value,
})

const requestHomepageRecognition = async (fileId: string, platform: string) => {
  if (!props.distributionMode || !fileId || !platform || !homepageProofCacheTaskAccountId.value) return
  const identity = `${homepageProofCacheUserId.value}:${homepageProofCacheTaskAccountId.value}:${platform}:${fileId}`
  if (requestedHomepageRecognitionIdentity === identity && homepageRecognition.value) return
  requestedHomepageRecognitionIdentity = identity
  try {
    const response: any = await requestDistributionHomepageProofRecognition(fileId, recognitionRequestParams(platform))
    updateHomepageRecognition(getHomepageProofResponseData(response))
  } catch {
    // 识别异常不影响上传、缓存和任务完成；下次进入页面可重新查询状态。
  }
}

const refreshHomepageRecognition = async () => {
  const fileId = String(homepageProofFileIds.value[0] || '').trim()
  const platform = homepageProofPlatformCode()
  if (!props.distributionMode || !fileId || !platform || !homepageProofCacheTaskAccountId.value) return
  try {
    const response: any = await getDistributionHomepageProofRecognition(fileId, {
      platform,
      taskAccountId: homepageProofCacheTaskAccountId.value,
    })
    updateHomepageRecognition(getHomepageProofResponseData(response))
  } catch {
    // 可能是网络/登录状态问题，不清理有效主页截图缓存。
  }
}

const handleHomepageProofImageError = async () => {
  const brokenUrl = String(homepageProofImages.value[0] || '').trim()
  const fileId = String(homepageProofFileIds.value[0] || '').trim()
  if (!brokenUrl || !fileId || brokenUrl === failedHomepageProofUrl) return

  if (homepageProofRefreshAttemptedFileId === fileId) {
    failedHomepageProofUrl = brokenUrl
    showToast('用户主页截图暂时无法加载，请检查网络后重试')
    return
  }

  homepageProofRefreshAttemptedFileId = fileId
  const refreshed = await refreshHomepageProofAccess()
  const currentFileId = String(homepageProofFileIds.value[0] || '').trim()
  // 刷新接口确认对象已不存在时，handleHomepageProofAccessFailure 已清除缓存并给出提示。
  if (!refreshed && currentFileId === fileId) {
    failedHomepageProofUrl = brokenUrl
    showToast('用户主页截图暂时无法加载，请检查网络后重试')
  }
}

watch([normalizedPlatform, homepageProofCacheUserId, homepageProofCacheTaskAccountId, homepageProofCacheTaskAccountCount, () => props.distributionMode], () => {
  clearHomepageRecognitionTimer()
  homepageRecognition.value = null
  requestedHomepageRecognitionIdentity = ''
  hydrateHomepageProofFromCache()
}, { immediate: true })
watch([homepageProofImages, homepageProofFileIds], () => persistHomepageProofForPlatform(), { deep: true })
watch([homepageProofFileIds, normalizedPlatform, homepageProofCacheUserId, homepageProofCacheTaskAccountId, () => props.distributionMode], () => {
  const identity = `${String(normalizedPlatform.value || '').trim()}:${String(homepageProofFileIds.value[0] || '').trim()}`
  if (identity !== observedHomepageProofIdentity) {
    observedHomepageProofIdentity = identity
    failedHomepageProofUrl = ''
    homepageProofRefreshAttemptedFileId = ''
  }
  void retainHomepageProofForCurrentUser()
  void refreshHomepageRecognition()
}, { deep: true })
onBeforeUnmount(() => clearHomepageRecognitionTimer())
const visitorToken = ref(String(props.initialVisitorToken || (store as any).visitorToken || ''))
watch(visitorToken, (v) => { store.setVisitorToken(String(v || '')) })
const STAGE_CACHE_KEY = 'taskStageCache'
const readStageCache = () => {
  try {
    const raw = localStorage.getItem(STAGE_CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}
const buildStageCacheKey = () => {
  if (props.distributionMode) return `distribution:${String(props.tenantsId)}:${String(props.postId)}`
  return `${String(props.tenantsId)}:${normalizedPlatform.value}:${String(props.postId)}`
}
const writeStageCache = (stage: 'step1' | 'step2' | 'step3', retry: boolean) => {
  if (props.distributionMode) return
  const key = buildStageCacheKey()
  if (!key) return
  const cache = readStageCache()
  ;(cache as any)[key] = { stage, retry: !!retry }
  try {
    localStorage.setItem(STAGE_CACHE_KEY, JSON.stringify(cache))
  } catch {}
}
const hydrateStageFromCache = () => {
  if (props.distributionMode) {
    const hasClaimedComment = Boolean(String(props.initialClaimRecordId || props.initialClaimedComment || '').trim())
    taskStage.value = hasClaimedComment ? 'step3' : 'step1'
    step2RetryMode.value = false
    return
  }
  const key = buildStageCacheKey()
  const cache = readStageCache()
  const saved = (cache as any)[key] || {}
  const savedStage = String(saved?.stage || '').trim()
  taskStage.value = (savedStage === 'step1' || savedStage === 'step2' || savedStage === 'step3') ? (savedStage as any) : 'step1'
  step2RetryMode.value = !!saved?.retry
}
onBeforeMount(() => {
  hydrateStageFromCache()
})
onMounted(() => {
  preloadGuideImages()
  syncDistributionSeed()
})
watch(() => [props.tenantsId, props.platform, props.postId], () => {
  hydrateStageFromCache()
  if (!props.distributionMode) {
    store.setClaimedCommentId('')
    store.setCurSelectComment('')
  }
  preloadGuideImages()
})
watch([taskStage, step2RetryMode], ([stage, retry]) => {
  writeStageCache(stage as any, !!retry)
})

const copyCenterVisible = ref(false)
const weixinClaimCommentVisible = ref(false)
const copyCenterText = ref('')
const flowGuideVisible = ref(false)
const claimFlowGuideVisible = ref(false)
const COMMENT_CACHE_KEY = 'claimedCommentContentCache'
const guidePreviewSource = ref<'start' | 'claim'>('start')
const failedGuideImageUrls = ref(new Set<string>())

function resolveGuideImage(stage: 'start' | 'claim') {
  const platform = normalizedPlatform.value
  if (platform === 'unknown') return operationGuide
  const guides = window.__TASK_CONFIG__?.guideImages?.[platform]
  const selection = guides?.[stage] ?? (platform !== 'douyin' ? guides?.start : undefined)
  const device = detectMobileOS() === 'ios' ? 'ios' : 'android'
  const value = typeof selection === 'string' ? selection : selection?.[device]
  if (typeof value !== 'string' || !value.trim()) return operationGuide

  // Allow a path on this site or an explicit HTTPS image supplied by its operator.
  const source = value.trim()
  try {
    const url = new URL(source, window.location.origin)
    const localPath = source.startsWith('/') && !source.startsWith('//') && url.origin === window.location.origin
    const secureUrl = source.toLowerCase().startsWith('https://') && url.protocol === 'https:'
    if ((localPath || secureUrl) && !url.username && !url.password && !failedGuideImageUrls.value.has(url.href)) {
      return url.href
    }
  } catch {
    // An invalid setting uses the included guide.
  }
  return operationGuide
}

function handleGuideImageError(event: Event) {
  const url = (event.currentTarget as HTMLImageElement).getAttribute('src')
  if (url && url !== operationGuide) failedGuideImageUrls.value.add(url)
}
const startFlowGuideImageUrl = computed(() => resolveGuideImage('start'))
const claimFlowGuideImageUrl = computed(() => resolveGuideImage('claim'))
const preloadImage = (url: string) => {
  const s = String(url || '').trim()
  if (!s) return
  const img = new Image()
  img.addEventListener('error', handleGuideImageError)
  img.src = s
}
const preloadGuideImages = () => {
  const urls = [startFlowGuideImageUrl.value, claimFlowGuideImageUrl.value]
  const uniq = Array.from(new Set(urls.filter(Boolean)))
  for (const u of uniq) preloadImage(u)
}
const platformThemeColor = computed(() => {
  return PLATFORM_THEME_COLOR_MAP[normalizedPlatform.value as keyof typeof PLATFORM_THEME_COLOR_MAP] || DEFAULT_PLATFORM_THEME_COLOR
})
const guidePreviewVisible = ref(false)
const guidePreviewStart = ref(0)
const guidePreviewImages = computed(() => {
  if (guidePreviewSource.value === 'claim') return [claimFlowGuideImageUrl.value]
  if (normalizedPlatform.value === 'xiaohongshu' || normalizedPlatform.value === 'douyin') return [startFlowGuideImageUrl.value]
  return [startFlowGuideImageUrl.value, startFlowGuideImageUrl.value, startFlowGuideImageUrl.value]
})
const claimRecordId = computed(() => String(props.initialClaimRecordId || (store as any).claimedCommentId || '').trim())
const currentClaimedComment = computed(() => String(copyCenterText.value || props.initialClaimedComment || (store as any).curSelectComment || ''))
const showStep2RetryActions = computed(() => step2RetryMode.value)

const syncDistributionSeed = () => {
  if (!props.distributionMode) return
  const nextName = String(props.initialUserName || '').trim()
  const nextPhone = String(props.initialUserPhone || '').replace(/[^\d]/g, '').slice(0, 11)
  const nextToken = String(props.initialVisitorToken || '').trim()
  const nextComment = String(props.initialClaimedComment || '').trim()
  const nextClaimId = String(props.initialClaimRecordId || '').trim()
  if (nextName && !String(userName.value || '').trim()) userName.value = nextName
  if (nextPhone && !String(userPhone.value || '').trim()) userPhone.value = nextPhone
  if (nextToken) visitorToken.value = nextToken
  if (nextComment) {
    copyCenterText.value = nextComment
    store.setCurSelectComment(nextComment)
  }
  if (nextClaimId) store.setClaimedCommentId(nextClaimId)
}

watch(
  () => [props.distributionMode, props.initialUserName, props.initialUserPhone, props.initialVisitorToken, props.initialClaimedComment, props.initialClaimRecordId],
  () => syncDistributionSeed(),
  { immediate: true },
)

const isDouyin = computed(() => normalizedPlatform.value === 'douyin')
const isXiaohongshu = computed(() => normalizedPlatform.value === 'xiaohongshu')
const isWeixin = computed(() => normalizedPlatform.value === 'weixin')
const flowGuideTitleText = computed(() => {
  return '阅读任务说明，并在相应平台完成操作'
})
const flowGuideFirstStepText = computed(() => {
  return isDouyin.value ? '打开抖音 app' : '打开小红书 app'
})
const flowGuideImageAltText = computed(() => {
  return '任务操作通用示意，非平台截图'
})
const flowGuideConfirmText = computed(() => {
  return isDouyin.value ? '已打开抖音作品，进行下一步' : '已打开小红书笔记，进行下一步'
})
const claimGuideTitleText = computed(() => {
  return props.distributionMode ? '使用账号资料领取评论' : '填写姓名和手机号后领取评论'
})
const claimGuideImageAltText = computed(() => {
  return '任务操作通用示意，非平台截图'
})
const delay = (ms: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, ms)
})

const getCopyDelayMs = () => {
  const os = detectMobileOS()
  const ua = navigator.userAgent || ''
  const inWeChat = /MicroMessenger/i.test(ua)
  if (os === 'ios') {
    return inWeChat ? 800 : 300
  }
  return 100
}
const isIosDevice = () => detectMobileOS() === 'ios'
const shouldManualCopyAfterAsync = () => isIosDevice()
const readCommentCache = () => {
  try {
    const raw = localStorage.getItem(COMMENT_CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const buildCommentCacheKey = (name: string) => {
  const cleanName = String(name || '').trim()
  if (props.distributionMode) return `distribution:${String(props.tenantsId)}:${String(props.postId)}:${cleanName}`
  return `${String(props.tenantsId)}:${normalizedPlatform.value}:${String(props.postId)}:${cleanName}`
}

const saveCommentCache = (name: string, content: string) => {
  const cleanContent = String(content || '').trim()
  const cleanName = String(name || '').trim()
  if (!cleanName || !cleanContent) return
  const key = buildCommentCacheKey(cleanName)
  if (!key) return
  const cache = readCommentCache()
  cache[key] = cleanContent
  try {
    localStorage.setItem(COMMENT_CACHE_KEY, JSON.stringify(cache))
  } catch {}
}

const getCommentCache = (name: string) => {
  const cleanName = String(name || '').trim()
  if (!cleanName) return ''
  const key = buildCommentCacheKey(cleanName)
  const cache = readCommentCache()
  return String(cache[key] || '').trim()
}

const pickCommentContent = (source: any) => {
  const list = [
    source?.comment?.content,
    source?.data?.comment?.content,
    source?.content,
    source?.commentContent,
  ]
  for (const item of list) {
    const s = String(item || '').trim()
    if (s) return s
  }
  return ''
}

const isAlreadyClaimedMessage = (message: any) => {
  const msg = String(message || '').trim()
  if (!msg) return false
  return /已经领取过|重复领取|不能重复领取/.test(msg)
}

const isAlreadyClaimedResponse = (payload: any, status?: any) => {
  const code = Number(payload?.code)
  const httpStatus = Number(status)
  if (code === 409 || httpStatus === 409) return true
  return isAlreadyClaimedMessage(payload?.msg || payload?.message)
}

const copyTextByExecCommand = (text: string) => {
  const s = String(text || '').trim()
  if (!s) return false
  const selection = window.getSelection?.()
  const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  const scrollX = window.scrollX
  const scrollY = window.scrollY
  const ta = document.createElement('textarea')
  ta.value = s
  ta.setAttribute('readonly', '')
  ta.setAttribute('aria-hidden', 'true')
  ta.style.position = 'fixed'
  ta.style.left = '12px'
  ta.style.top = '12px'
  ta.style.width = '1px'
  ta.style.height = '1px'
  ta.style.opacity = '0.01'
  ta.style.fontSize = '16px'
  ta.style.border = '0'
  ta.style.padding = '0'
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  ta.setSelectionRange(0, s.length)
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {}
  document.body.removeChild(ta)
  if (previousRange && selection) {
    selection.removeAllRanges()
    selection.addRange(previousRange)
  }
  window.scrollTo(scrollX, scrollY)
  return ok
}

const copyText = async (text: string) => {
  const s = String(text || '').trim()
  if (!s) return false
  if (isIosDevice() && copyTextByExecCommand(s)) return true
  if ((navigator as any)?.clipboard?.writeText) {
    try {
      await (navigator as any).clipboard.writeText(s)
      return true
    } catch {}
  }
  const execOk = copyTextByExecCommand(s)
  if (execOk) return true
  return false
}

const getRandomPostUrl = () => {
  const list = Array.isArray(props.postUrls)
    ? props.postUrls.map(item => String(item || '').trim()).filter(Boolean)
    : []
  if (list.length > 0) {
    const index = Math.floor(Math.random() * list.length)
    return list[index]
  }
  return String(props.postUrl || '').trim()
}

const copyClaimedComment = async (showManualOnFail = false, successMessage = '已复制评论') => {
  const ok = await copyText(currentClaimedComment.value)
  if (ok) {
    showToast(successMessage)
  } else {
    if (showManualOnFail) {
      copyCenterVisible.value = true
      showToast('领取评论成功，请点击复制评论')
    } else {
      showToast('复制失败，请手动复制')
    }
  }
  return ok
}

const openClaimFlowPopupAfterReady = async (commentContent: string, notFoundMessage: string, successMessage = '领取评论成功，已复制评论') => {
  const content = String(commentContent || '').trim()
  if (!content) {
    claimFlowGuideVisible.value = false
    showToast(notFoundMessage)
    return false
  }
  copyCenterText.value = content
  store.setCurSelectComment(content)
  copyCenterVisible.value = false
  step2RetryMode.value = false
  taskStage.value = 'step2'
  claimFlowGuideVisible.value = true
  hideClaimLoading()
  if (shouldManualCopyAfterAsync()) {
    showToast('领取评论成功，请点击一键复制评论')
    return true
  }
  await nextTick()
  await delay(getCopyDelayMs())
  await copyClaimedComment(true, successMessage)
  return true
}

const tryCopyClaimedCommentForWeixinPopup = async (successMessage = '已复制评论') => {
  const ok = await copyText(currentClaimedComment.value)
  showToast(ok ? successMessage : '领取评论成功，请点击一键复制评论')
  return ok
}

const openWeixinClaimCommentPopupAfterReady = async (commentContent: string, notFoundMessage: string, successMessage = '领取评论成功，已复制评论') => {
  const content = String(commentContent || '').trim()
  if (!content) {
    weixinClaimCommentVisible.value = false
    showToast(notFoundMessage)
    return false
  }
  copyCenterText.value = content
  store.setCurSelectComment(content)
  copyCenterVisible.value = false
  claimFlowGuideVisible.value = false
  step2RetryMode.value = false
  taskStage.value = 'step2'
  weixinClaimCommentVisible.value = true
  hideClaimLoading()
  if (shouldManualCopyAfterAsync()) {
    showToast('领取评论成功，请点击一键复制评论')
    return true
  }
  await nextTick()
  await delay(getCopyDelayMs())
  await tryCopyClaimedCommentForWeixinPopup(successMessage)
  return true
}

const copyPostUrl = async () => {
  const ok = await copyText(getRandomPostUrl())
  if (ok) showToast('已复制链接')
  else showToast('无法复制，请手动复制')
}

const doCopyCenter = async () => {
  const ok = await copyText(currentClaimedComment.value)
  if (ok) {
    showToast('已复制评论')
    copyCenterVisible.value = false
  } else {
    showToast('复制失败，请重试')
  }
}

const startTaskFlow = async () => {
  if (props.startTaskDisabled) {
    showToast('评论已领取完，无法开始助推任务')
    return
  }
  step2RetryMode.value = false
  taskStage.value = 'step2'
  const shouldShowFlowGuide = normalizedPlatform.value === 'xiaohongshu' || normalizedPlatform.value === 'douyin'
  flowGuideVisible.value = shouldShowFlowGuide
  if (shouldShowFlowGuide) {
    await copyPostUrl()
  }
}

const openGuidePreview = (index: number, source: 'start' | 'claim' = 'start') => {
  guidePreviewSource.value = source
  guidePreviewStart.value = index
  guidePreviewVisible.value = true
}

const handleClaimFlowNotCompleted = () => {
  hideClaimLoading()
  claimFlowGuideVisible.value = false
  step2RetryMode.value = true
  taskStage.value = 'step2'
}

const handleClaimFlowCompleted = () => {
  hideClaimLoading()
  claimFlowGuideVisible.value = false
  step2RetryMode.value = false
  taskStage.value = 'step3'
}

const handleWeixinClaimPopupConfirm = async () => {
  weixinClaimCommentVisible.value = false
  step2RetryMode.value = false
  taskStage.value = 'step3'
  await openWeixinVideo()
}

const retryClaimComment = async () => {
  await claimCommentAction()
}

const retryOpenPostLink = async () => {
  step2RetryMode.value = false
  if (normalizedPlatform.value === 'weixin') {
    taskStage.value = 'step3'
    await openWeixinVideo()
  } else {
    taskStage.value = 'step1'
    flowGuideVisible.value = true
    await copyPostUrl()
  }
}

const handleStartTaskFlowClick = () => runThrottled('start-task-flow', () => startTaskFlow(), { wait: 1000 })
const handleClaimCommentClick = () => runThrottled('claim-comment', () => claimCommentAction(), { wait: 1200 })
const handleRetryClaimCommentClick = () => runThrottled('retry-claim-comment', () => retryClaimComment(), { wait: 1200 })
const handleRetryOpenPostLinkClick = () => runThrottled('retry-open-post-link', () => retryOpenPostLink(), { wait: 1000 })
const handleResetStepClick = () => runThrottled('reset-step', () => resetStepToStart(), { wait: 500, blockDuringExecution: false })
const handleCompleteClick = () => runThrottled('complete', () => completeAction(), { wait: 1500 })
const handleCopyCenterClick = () => runThrottled('copy-center', () => doCopyCenter(), { wait: 600 })
const handleCopyPostUrlClick = () => runThrottled('copy-post-url', () => copyPostUrl(), { wait: 600 })
const handleClaimFlowNotCompletedClick = () => runThrottled('claim-flow-reset', () => handleClaimFlowNotCompleted(), { wait: 500, blockDuringExecution: false })
const handleClaimFlowCompletedClick = () => runThrottled('claim-flow-complete', () => handleClaimFlowCompleted(), { wait: 500, blockDuringExecution: false })
const handleWeixinClaimPopupConfirmClick = () => runThrottled('weixin-claim-popup-confirm', () => handleWeixinClaimPopupConfirm(), { wait: 1000 })
const handleOpenWeixinVideoClick = () => runThrottled('open-weixin-video', () => openWeixinVideo(), { wait: 1000 })

let claimLoadingToast: any = null
const showClaimLoading = () => {
  claimLoading.value = true
  claimLoadingToast?.close?.()
  claimLoadingToast = showToast({
    type: 'loading',
    message: '正在领取评论，请稍候...',
    forbidClick: true,
    duration: 0,
  })
}
const hideClaimLoading = () => {
  claimLoading.value = false
  claimLoadingToast?.close?.()
  claimLoadingToast = null
}

const resetStepToStart = () => {
  step2RetryMode.value = false
  taskStage.value = 'step1'
  flowGuideVisible.value = false
  claimFlowGuideVisible.value = false
  weixinClaimCommentVisible.value = false
  copyCenterVisible.value = false
}
const getClaimRecordId = (data: any) => {
  return String(data?.id ?? data?.commentId ?? '').trim()
}

const claimCommentAction = async () => {
  const name = String(userName.value || '').trim()
  if (!name) {
    showToast('请先输入姓名')
    return
  }
  const phone = String(userPhone.value || '').replace(/[^\d]/g, '').slice(0, 11)
  userPhone.value = phone
  if (!/^1\d{10}$/.test(phone)) {
    showToast('请先输入正确的手机号')
    return
  }
  const handleAlreadyClaimed = async (sourceData: any, fallbackMsg: string) => {
    const claimedId = getClaimRecordId(sourceData) || claimRecordId.value
    if (claimedId) store.setClaimedCommentId(claimedId)
    const token = String(sourceData?.visitorToken || visitorToken.value || '').trim()
    if (token) visitorToken.value = token
    const contentFromResponse = pickCommentContent(sourceData)
    if (contentFromResponse) {
      saveCommentCache(name, contentFromResponse)
      store.setCurSelectComment(contentFromResponse)
    }
    const storeContent = String((store as any).curSelectComment || '').trim()
    const cachedContent = contentFromResponse || getCommentCache(name) || storeContent
    copyCenterText.value = cachedContent
    if (cachedContent) store.setCurSelectComment(cachedContent)
    step2RetryMode.value = false
    taskStage.value = isWeixin.value ? 'step2' : 'step3'
    if (cachedContent) {
      if (isWeixin.value) {
        weixinClaimCommentVisible.value = true
        hideClaimLoading()
        if (shouldManualCopyAfterAsync()) {
          showToast('已恢复评论，请点击一键复制评论')
          return true
        }
        await nextTick()
        await delay(getCopyDelayMs())
        await tryCopyClaimedCommentForWeixinPopup('已恢复评论并复制')
      } else {
        if (shouldManualCopyAfterAsync()) {
          copyCenterVisible.value = true
          hideClaimLoading()
          showToast('已恢复评论，请点击一键复制评论')
          emit('refresh-detail')
          return true
        }
        await nextTick()
        await delay(getCopyDelayMs())
        await copyClaimedComment(true, '已恢复评论并复制')
        hideClaimLoading()
      }
    } else {
      hideClaimLoading()
      showToast({
        message: '当前姓名或手机号已领取过本帖评论，已恢复之前的任务记录',
        duration: 1500,
      })
    }
    if (!isWeixin.value) emit('refresh-detail')
    return true
  }
  const payload: any = {
    visitorName: name,
    phone: phone,
    sourcePlatform: 'H5'
  }
  if (props.distributionMode) {
    await claimDistributionCurrentCommentAction(name)
    return
  }
  if (String(visitorToken.value || '').trim()) payload.visitorToken = String(visitorToken.value || '').trim()
  showClaimLoading()
  try {
    const res: any = await publicClaimComment(String(props.postId), payload)
    if (res.code === 0) {
      const claimedId = getClaimRecordId(res?.data)
      if (claimedId) store.setClaimedCommentId(claimedId)
      const token = String(res?.data?.visitorToken || '').trim()
      if (token) visitorToken.value = token
      const content = pickCommentContent(res?.data) || pickCommentContent(res)
      if (content) saveCommentCache(name, content)
      if (normalizedPlatform.value === 'xiaohongshu' || normalizedPlatform.value === 'douyin') {
        const opened = await openClaimFlowPopupAfterReady(String(content || ''), '领取成功，但未获取到评论内容，请重新领取')
        if (!opened) return
      } else if (isWeixin.value) {
        const opened = await openWeixinClaimCommentPopupAfterReady(String(content || ''), '领取成功，但未获取到评论内容，请重新领取')
        if (!opened) return
      } else {
        copyCenterText.value = String(content || '')
        store.setCurSelectComment(String(content || ''))
        taskStage.value = 'step3'
        hideClaimLoading()
        if (shouldManualCopyAfterAsync()) {
          copyCenterVisible.value = true
          showToast('领取评论成功，请点击一键复制评论')
          return
        }
        await nextTick()
        await delay(getCopyDelayMs())
        await copyClaimedComment(true, '领取评论成功，已复制评论')
      }
      if (!isWeixin.value) emit('refresh-detail')
    } else if (isAlreadyClaimedResponse(res)) {
      const handled = await handleAlreadyClaimed(res?.data, '评论已领取，但未找到评论内容，请重新领取')
      if (handled) return
    } else {
      showToast(res?.msg || '领取失败，请稍后再试')
    }
  } catch (error: any) {
    const errData = error?.response?.data || {}
    const errMsg = errData?.msg || '领取失败，请稍后再试'
    if (isAlreadyClaimedResponse(errData, error?.response?.status)) {
      const handled = await handleAlreadyClaimed(errData?.data, '评论已领取，但未找到评论内容，请重新领取')
      if (handled) return
    }
    showToast(errMsg)
  } finally {
    hideClaimLoading()
  }
}

const claimDistributionCurrentCommentAction = async (name: string) => {
  showClaimLoading()
  try {
    const res: any = await claimDistributionCurrentComment()
    const data = res?.data ?? res
    const token = String(data?.visitorToken || data?.currentTask?.visitorToken || visitorToken.value || '').trim()
    if (token) visitorToken.value = token
    const claimedId = getClaimRecordId(data)
    if (claimedId) store.setClaimedCommentId(claimedId)
    const content = pickCommentContent(data) || pickCommentContent(data?.currentTask) || String(data?.commentContent || '').trim()
    if (content) {
      saveCommentCache(name, content)
      store.setCurSelectComment(content)
    }
    if (normalizedPlatform.value === 'xiaohongshu' || normalizedPlatform.value === 'douyin') {
      const opened = await openClaimFlowPopupAfterReady(content, '领取成功，但未获取到评论内容，请返回刷新后重试')
      if (!opened) return
    } else if (isWeixin.value) {
      const opened = await openWeixinClaimCommentPopupAfterReady(content, '领取成功，但未获取到评论内容，请返回刷新后重试')
      if (!opened) return
    } else {
      copyCenterText.value = content
      store.setCurSelectComment(content)
      taskStage.value = 'step3'
      hideClaimLoading()
      if (shouldManualCopyAfterAsync()) {
        copyCenterVisible.value = true
        showToast('领取评论成功，请点击一键复制评论')
        return
      }
      await nextTick()
      await delay(getCopyDelayMs())
      await copyClaimedComment(true, '领取评论成功，已复制评论')
    }
    if (!isWeixin.value) emit('refresh-detail')
  } catch (error: any) {
    const errData = error?.response?.data || {}
    const rawMsg = errData?.msg ?? errData?.message ?? error?.message
    const errMsg = Array.isArray(rawMsg) ? rawMsg.join('；') : String(rawMsg || '').trim()
    hideClaimLoading()
    showToast(errMsg || '领取评论失败，请稍后再试')
  }
}

const completeAction = async () => {
  const name = String(userName.value || '').trim()
  if (!name) {
    showToast('请先输入姓名')
    return
  }
  const phone = String(userPhone.value || '').replace(/[^\d]/g, '').slice(0, 11)
  userPhone.value = phone
  if (!/^1\d{10}$/.test(phone)) {
    showToast('请先输入正确的手机号')
    return
  }
  const normalizedHomepageProofFileIds = homepageProofFileIds.value.map(item => String(item || '').trim()).filter(Boolean)
  const normalizedProofFileIds = proofFileIds.value.map(item => String(item || '').trim()).filter(Boolean)
  if (normalizedHomepageProofFileIds.length < 1) {
    showToast('请先上传用户主页截图')
    return
  }
  if (normalizedProofFileIds.length < 1) {
    showToast('请先上传评论/点赞截图')
    return
  }
  const token = String(visitorToken.value || '').trim()
  if (!token && !props.distributionMode) {
    taskStage.value = 'step1'
    step2RetryMode.value = false
    showToast('任务状态已更新，请重新进入流程后再试')
    return
  }
  const payload: any = {
    proofFileIds: Array.from(new Set([...normalizedHomepageProofFileIds, ...normalizedProofFileIds])),
  }
  if (token) payload.visitorToken = token
  try {
    const res: any = props.distributionMode
      ? await completeDistributionCurrentTask(payload)
      : await publicConfirmComplete(String(props.postId), payload)
    if (res?.code !== undefined && res?.code !== 0) {
      showToast(res?.message || '确认失败，请稍后再试')
      return
    }
    taskStage.value = 'step1'
    step2RetryMode.value = false
    proofImages.value = []
    proofFileIds.value = []
    showToast('流程已完成，感谢您的支持与付出')
    emit('refresh-detail')
    if (props.distributionMode) emit('distribution-completed')
  } catch (error: any) {
    const errData = error?.response?.data || {}
    const rawMsg = errData?.msg ?? errData?.message ?? error?.message
    const errMsg = Array.isArray(rawMsg) ? rawMsg.join('；') : String(rawMsg || '').trim()
    showToast(errMsg || '网络错误')
  }
}

const normalizePostOpenUrl = (value: string) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const matched = raw.match(/(?:https?|weixin):\/\/[^\s`'"<>，。；、]+/i)
  return String((matched && matched[0]) || raw).trim()
}

const markExternalReturnRefresh = () => {
  const now = String(Date.now())
  try { sessionStorage.setItem(EXTERNAL_RETURN_REFRESH_KEY, now) } catch {}
  try { localStorage.setItem(EXTERNAL_RETURN_REFRESH_KEY, now) } catch {}
}

const openWeixinVideo = async () => {
  const url = normalizePostOpenUrl(getRandomPostUrl())
  if (!url) {
    showToast('当前任务缺少作品链接，请联系管理员')
    return
  }

  const ua = navigator.userAgent || ''
  const inWeChat = /MicroMessenger/i.test(ua)
  if (!inWeChat) {
    const copied = await copyText(url)
    showToast(copied ? '请在微信内打开任务，作品链接已复制' : '请在微信内打开任务')
    return
  }

  try {
    markExternalReturnRefresh()
    window.location.href = url
    window.setTimeout(async () => {
      if (document.visibilityState === 'visible') {
        await copyText(url)
        showToast('如未自动打开，请复制链接手动打开')
      }
    }, 1200)
  } catch {
    await copyText(url)
    showToast('打开失败，作品链接已复制，请手动打开')
  }
}
</script>
