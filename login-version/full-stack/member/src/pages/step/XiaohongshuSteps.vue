<template>
  <template v-if="props.taskStage === 'step1'">
    <div class="step-one flex flex-col gap-[14px] p-[18px] rounded-[22px] shadow-[0_14px_32px_rgba(15,23,42,0.06)] bg-white/95 backdrop-blur-xl transition-all duration-500" :style="stepCardBgStyle">
      <div class="flex items-center gap-[8px] mb-[4px]">
        <div class="w-[4px] h-[16px] rounded-full" :style="{ backgroundColor: props.platformThemeColor }"></div>
        <span class="text-[16px] font-bold text-[#111]">第一步：开始助推</span>
      </div>
      <div class="flex flex-col gap-[12px]">
        <div class="flex items-start gap-[8px]">
          <van-icon name="info-o" class="mt-[2px]" :color="props.platformThemeColor" size="16" />
          <span class="text-[14px] text-[#444] leading-relaxed flex-1">请在 4/5G 网络环境下进行助推任务</span>
        </div>
        <div class="p-[12px] bg-white/60 rounded-[12px] mt-[4px]" :style="{ border: `1px solid ${props.platformThemeColor}30` }">
          <span class="text-[14px] font-bold text-[#111] leading-[22px] block">进入小红书后，长按内容点击”觉得好“。进行点赞、收藏并完整播放视频</span>
        </div>
      </div>
      <van-button class="w-full !rounded-full !h-[40px] !font-bold !text-[15px] shadow-[0_8px_22px_rgba(15,23,42,0.12)] mt-[8px] transition-transform active:scale-95" type="primary" :color="props.platformThemeColor" :disabled="props.startTaskDisabled" @click="emit('start-task-flow')">开始助推任务</van-button>
    </div>
  </template>
  <template v-else-if="props.taskStage === 'step2'">
    <div class="step-two flex flex-col gap-[14px] p-[18px] rounded-[22px] shadow-[0_14px_32px_rgba(15,23,42,0.06)] bg-white/95 backdrop-blur-xl transition-all duration-500" :style="stepCardBgStyle">
      <!-- Header -->
      <div class="flex items-center gap-[8px]">
        <div class="w-[4px] h-[16px] rounded-full" :style="{ backgroundColor: props.platformThemeColor }"></div>
        <span class="text-[17px] font-bold text-[#111] tracking-wide">第二步：领取评论</span>
      </div>
      <div class="flex items-start gap-[8px] bg-black/5 p-[12px] rounded-[12px]">
        <van-icon name="info-o" class="mt-[2px] text-[#666]" size="15" />
        <span class="text-[13px] text-[#555] leading-relaxed flex-1">{{ props.distributionMode ? '完成互动后，系统将使用登录账号资料领取评论。领取后请前往作品进行评论。' : '完成视频收藏-点赞-分享-完播后，请填写姓名和手机号领取评论。领取后请前往视频作品进行评论。' }}</span>
      </div>

      <!-- Account Area -->
      <div v-if="props.distributionMode" class="rounded-[14px] bg-white/70 px-[14px] py-[12px] border border-black/5">
        <div class="flex items-center gap-[8px] text-[13px] text-[#555] leading-relaxed">
          <van-icon name="passed" :color="props.platformThemeColor" size="16" />
          <span class="flex-1">将使用当前登录资料：{{ props.userName || '未填写姓名' }} / {{ props.userPhone || '未绑定手机号' }}</span>
        </div>
      </div>
      <div v-else class="flex flex-col gap-[16px]" :style="{'--theme-color': props.platformThemeColor}">
        <div class="flex flex-col gap-[12px]">
          <div class="flex items-center bg-[#f8f9fa] rounded-[14px] px-[14px] h-[46px] border border-transparent focus-within:bg-white focus-within:border-[var(--theme-color)] focus-within:ring-4 focus-within:ring-[var(--theme-color)]/10 transition-all shadow-inner shadow-black/[0.02]">
            <van-icon name="user-o" class="text-[#888] mr-[10px]" size="18" />
            <input class="flex-1 bg-transparent border-none outline-none text-[15px] text-[#111] placeholder-[#aaa] font-medium" type="text" placeholder="请输入您的真实姓名" :value="props.userName" @input="onInput" />
          </div>
          <div class="flex items-center bg-[#f8f9fa] rounded-[14px] px-[14px] h-[46px] border border-transparent focus-within:bg-white focus-within:border-[var(--theme-color)] focus-within:ring-4 focus-within:ring-[var(--theme-color)]/10 transition-all shadow-inner shadow-black/[0.02]">
            <van-icon name="phone-o" class="text-[#888] mr-[10px]" size="18" />
            <input class="flex-1 bg-transparent border-none outline-none text-[15px] text-[#111] placeholder-[#aaa] font-medium" type="tel" inputmode="numeric" placeholder="请输入常用手机号" :value="props.userPhone" @input="onPhoneInput" />
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div v-if="!props.showStep2RetryActions" class="flex gap-[12px] mt-[8px]">
        <van-button class="flex-1 !rounded-full !h-[40px] !font-bold !text-[15px] shadow-[0_8px_22px_rgba(15,23,42,0.12)] transition-transform active:scale-95" type="primary" :color="props.platformThemeColor" :loading="props.claimLoading" :disabled="props.claimLoading" loading-text="领取中..." @click="emit('claim-comment')">立即领取</van-button>
        <van-button class="!w-[96px] !rounded-full !h-[36px] !font-bold !text-[13px]" plain type="primary" :color="props.platformThemeColor" @click="emit('reset-step')">重新操作</van-button>
      </div>
      <template v-else>
        <div class="flex flex-col gap-[12px] mt-[8px]">
          <van-button class="w-full !rounded-full !h-[40px] !font-bold !text-[15px] shadow-[0_8px_22px_rgba(15,23,42,0.12)]" type="primary" :color="props.platformThemeColor" :loading="props.claimLoading" :disabled="props.claimLoading" loading-text="领取中..." @click="emit('retry-claim-comment')">没领取到，重新领取</van-button>
          <van-button class="w-full !rounded-full !h-[38px] !font-bold !text-[14px]" plain type="primary" :color="props.platformThemeColor" @click="emit('retry-open-post-link')">没打开笔记？重新打开</van-button>
        </div>
      </template>
    </div>
  </template>
  <template v-else>
    <div class="step-three flex flex-col gap-[14px] p-[18px] rounded-[22px] shadow-[0_14px_32px_rgba(15,23,42,0.06)] bg-white/95 backdrop-blur-xl transition-all duration-500" :style="stepCardBgStyle">
      <div class="flex items-center justify-between gap-[10px] mb-[4px]">
        <div class="flex items-center gap-[8px] min-w-0">
          <div class="w-[4px] h-[16px] rounded-full flex-shrink-0" :style="{ backgroundColor: props.platformThemeColor }"></div>
          <span class="text-[16px] font-bold text-[#111]">第三步：确认完成</span>
        </div>
        <button
          v-if="props.claimedComment"
          type="button"
          class="inline-flex flex-shrink-0 items-center gap-[6px] rounded-full border px-[11px] py-[6px] text-[12px] font-semibold shadow-[0_6px_16px_rgba(15,23,42,0.06)] transition-all duration-300 active:scale-95"
          :style="copyCommentButtonStyle"
          @click="emit('copy-comment')"
        >
          <van-icon name="description-o" size="14" />
          <span>复制评论</span>
        </button>
      </div>
      <p class="text-[14px] text-[#444] leading-relaxed">请上传任务完成截图，提交后由运营审核结算</p>
      <TaskProofUploadGroups
        :homepage-proof-images="props.homepageProofImages"
        :homepage-proof-file-ids="props.homepageProofFileIds"
        :homepage-recognition="props.homepageRecognition"
        :proof-images="props.proofImages"
        :proof-file-ids="props.proofFileIds"
        :platform-theme-color="props.platformThemeColor"
        @update:homepage-proof-images="emit('update:homepageProofImages', $event)"
        @update:homepage-proof-file-ids="emit('update:homepageProofFileIds', $event)"
        @update:proof-images="emit('update:proofImages', $event)"
        @update:proof-file-ids="emit('update:proofFileIds', $event)"
        @homepage-proof-image-error="emit('homepage-proof-image-error')"
      />
      <div class="flex gap-[10px] mt-[8px]">
        <van-button class="flex-1 !rounded-full !h-[40px] !font-bold !text-[15px] shadow-[0_8px_22px_rgba(15,23,42,0.12)] transition-transform active:scale-95" type="primary" :color="props.platformThemeColor" @click="handleComplete">确认完成</van-button>
        <van-button class="flex-1 !rounded-full !h-[38px] !font-bold !text-[14px]" plain type="primary" :color="props.platformThemeColor" @click="emit('reset-step')">重新操作</van-button>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { showToast } from 'vant'
import { publicUploadFile } from '@/api'
import TaskProofUploadGroups from '@/components/TaskProofUploadGroups.vue'

const props = defineProps<{
  taskStage: 'step1' | 'step2' | 'step3'
  claimLoading: boolean
  claimedComment: string
  userName: string
  userPhone: string
  proofImages: string[]
  proofFileIds: string[]
  homepageProofImages: string[]
  homepageProofFileIds: string[]
  homepageRecognition?: any
  platformThemeColor: string
  showStep2RetryActions: boolean
  claimRecordId: string
  startTaskDisabled?: boolean
  distributionMode?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:userName', value: string): void
  (e: 'update:userPhone', value: string): void
  (e: 'update:proofImages', value: string[]): void
  (e: 'update:proofFileIds', value: string[]): void
  (e: 'update:homepageProofImages', value: string[]): void
  (e: 'update:homepageProofFileIds', value: string[]): void
  (e: 'homepage-proof-image-error'): void
  (e: 'start-task-flow'): void
  (e: 'claim-comment'): void
  (e: 'retry-claim-comment'): void
  (e: 'retry-open-post-link'): void
  (e: 'complete', files: any[]): void
  (e: 'copy-comment'): void
}>()

const maxProofFiles = 6

const onInput = (event: Event) => {
  const target = event.target as HTMLInputElement | null
  emit('update:userName', String(target?.value || ''))
}
const onPhoneInput = (event: Event) => {
  const target = event.target as HTMLInputElement | null
  const phone = String(target?.value || '').replace(/[^\d]/g, '').slice(0, 11)
  emit('update:userPhone', phone)
}
const onPaymentCodeUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement | null
  const selectedFiles = Array.from(target?.files || [])
  if (!selectedFiles.length) return
  const remain = Math.max(0, maxProofFiles - props.proofImages.length)
  const uploadFiles = selectedFiles.slice(0, remain)
  if (!uploadFiles.length) {
    showToast(`最多上传 ${maxProofFiles} 张`)
    if (target) target.value = ''
    return
  }
  const toast = showToast({ type: 'loading', message: '上传中...', forbidClick: true, duration: 0 })
  try {
    const nextImages = [...props.proofImages]
    const nextFileIds = [...props.proofFileIds]
    for (const file of uploadFiles) {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('scene', 'TASK_CLAIM_PROOF')
      const resp: any = await publicUploadFile(formData)
      if (!(resp?.code === 0 || resp?.success)) {
        throw new Error(resp?.message || '上传失败')
      }
      const data = resp.data || resp
      const url = String(data?.url || data?.viewUrl || data?.filepath || data || '')
      const fileId = String(data?.id || data?.fileId || '')
      if (!url || !fileId) {
        throw new Error('上传结果缺少文件信息')
      }
      nextImages.push(url)
      nextFileIds.push(fileId)
    }
    emit('update:proofImages', nextImages)
    emit('update:proofFileIds', nextFileIds)
    showToast(`上传成功，已添加 ${uploadFiles.length} 张`)
  } catch (e: any) {
    showToast(e?.message || '上传失败，请重试')
  } finally {
    toast.close()
    if (target) target.value = ''
  }
}
const onRemoveProof = (index: number) => {
  const nextImages = props.proofImages.filter((_, i) => i !== index)
  const nextFileIds = props.proofFileIds.filter((_, i) => i !== index)
  emit('update:proofImages', nextImages)
  emit('update:proofFileIds', nextFileIds)
}

const stepCardBgStyle = computed(() => ({
  background: `linear-gradient(180deg, rgba(255,255,255,0.98) 0%, ${props.platformThemeColor}10 100%)`,
  border: `1px solid ${props.platformThemeColor}24`,
  boxShadow: `0 14px 28px ${props.platformThemeColor}14`,
}))
const copyCommentButtonStyle = computed(() => ({
  color: '#ffffff',
  backgroundColor: props.platformThemeColor,
  borderColor: props.platformThemeColor,
  boxShadow: `0 10px 24px ${props.platformThemeColor}1f`,
}))

const handleComplete = () => {
  if (props.homepageProofFileIds.length < 1) {
    showToast('请先上传用户主页截图')
    return
  }
  if (props.proofFileIds.length < 1) {
    showToast('请先上传评论/点赞截图')
    return
  }
  emit('complete', [])
}
</script>
