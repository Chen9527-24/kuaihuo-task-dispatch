<template>
  <div class="flex flex-col gap-[12px]" :style="{ '--theme-color': props.platformThemeColor }">
    <section class="box-border w-full rounded-[18px] bg-white/60 p-[14px]" :style="{ border: `1px solid ${props.platformThemeColor}24` }">
      <div class="mb-[10px] flex items-center justify-between gap-[8px] px-[2px]">
        <div class="min-w-0">
          <div class="flex items-center gap-[6px] text-[14px] font-bold text-[#1f2937]">
            <van-icon name="user-o" size="16" :color="props.platformThemeColor" />
            <span>用户主页截图</span>
          </div>
          <p class="m-0 mt-[4px] text-[12px] leading-[18px] text-[#64748b]">同平台上传过后会自动展示，无需重复上传。</p>
        </div>
        <span v-if="hasHomepageProof" class="rounded-full bg-emerald-50 px-[8px] py-[2px] text-[12px] font-bold text-emerald-600">已保存</span>
        <span v-else class="rounded-full bg-red-50 px-[8px] py-[2px] text-[12px] font-bold text-red-500">必传</span>
      </div>
      <div v-if="hasHomepageProof && recognitionHint" class="mb-[10px] flex items-center gap-[6px] rounded-[10px] bg-slate-50 px-[9px] py-[7px] text-[12px] leading-[18px] text-slate-500">
        <van-loading v-if="recognitionLoading" size="14px" :color="props.platformThemeColor" />
        <van-icon v-else name="info-o" size="14" :color="props.platformThemeColor" />
        <span>{{ recognitionHint }}</span>
      </div>
      <div class="grid grid-cols-2 gap-[12px]">
        <div
          v-for="(image, index) in props.homepageProofImages"
          :key="`homepage_${image}_${index}`"
          class="min-w-0 rounded-[16px] border border-[#e5e7eb] bg-white p-[8px] shadow-[0_2px_8px_rgba(15,23,42,0.04)]"
        >
          <div class="aspect-square w-full overflow-hidden rounded-[12px] bg-[#f8f9fa]">
            <img class="h-full w-full object-cover" :src="image" alt="用户主页截图" @error="emit('homepage-proof-image-error')" />
          </div>
          <button type="button" class="mt-[8px] h-[30px] w-full rounded-[10px] border border-[#e5e7eb] bg-[#f9fafb] text-[12px] font-medium text-[#4b5563] active:scale-[0.98]" @click.stop="removeHomepageProof(index)">删除这张</button>
        </div>
        <label v-if="!hasHomepageProof" class="block min-w-0 cursor-pointer overflow-hidden rounded-[16px] bg-white">
          <input class="hidden" type="file" accept="image/*" @change="onHomepageUpload" />
          <div class="aspect-square flex flex-col items-center justify-center gap-[10px] rounded-[16px] border border-dashed border-[#d1d5db] bg-[#f8f9fa] transition-colors hover:bg-[#f0f2f5] hover:border-[var(--theme-color)]">
            <div class="flex h-[40px] w-[40px] items-center justify-center rounded-full bg-white text-[#888] shadow-sm">
              <van-icon name="photograph" size="20" />
            </div>
            <span class="text-[12px] font-medium text-[#666]">上传主页截图</span>
          </div>
        </label>
      </div>
    </section>

    <section class="box-border w-full rounded-[18px] bg-white/60 p-[14px]" :style="{ border: `1px solid ${props.platformThemeColor}24` }">
      <div class="mb-[10px] flex items-center justify-between gap-[8px] flex-wrap px-[2px]">
        <div>
          <div class="flex items-center gap-[6px] text-[14px] font-bold text-[#1f2937]">
            <van-icon name="photo-o" size="16" :color="props.platformThemeColor" />
            <span>评论截图 / 点赞截图</span>
          </div>
          <p class="m-0 mt-[4px] text-[12px] leading-[18px] text-[#64748b]">每个任务都需要重新上传本次操作截图。</p>
        </div>
        <span class="rounded-full bg-red-50 px-[8px] py-[2px] text-[12px] font-bold text-red-500">至少 1 张，可传 {{ maxProofFiles }} 张</span>
      </div>
      <div class="grid grid-cols-2 gap-[12px]">
        <div
          v-for="(image, index) in props.proofImages"
          :key="`proof_${image}_${index}`"
          class="min-w-0 rounded-[16px] border border-[#e5e7eb] bg-white p-[8px] shadow-[0_2px_8px_rgba(15,23,42,0.04)]"
        >
          <div class="aspect-square w-full overflow-hidden rounded-[12px] bg-[#f8f9fa]">
            <img class="h-full w-full object-cover" :src="image" alt="评论或点赞截图" />
          </div>
          <button type="button" class="mt-[8px] h-[30px] w-full rounded-[10px] border border-[#e5e7eb] bg-[#f9fafb] text-[12px] font-medium text-[#4b5563] active:scale-[0.98]" @click.stop="removeProof(index)">删除这张</button>
        </div>
        <label v-if="props.proofImages.length < maxProofFiles" class="block min-w-0 cursor-pointer overflow-hidden rounded-[16px] bg-white">
          <input class="hidden" type="file" accept="image/*" multiple @change="onTaskProofUpload" />
          <div class="aspect-square flex flex-col items-center justify-center gap-[10px] rounded-[16px] border border-dashed border-[#d1d5db] bg-[#f8f9fa] transition-colors hover:bg-[#f0f2f5] hover:border-[var(--theme-color)]">
            <div class="flex h-[40px] w-[40px] items-center justify-center rounded-full bg-white text-[#888] shadow-sm">
              <van-icon name="photograph" size="20" />
            </div>
            <span class="text-[12px] font-medium text-[#666]">继续上传</span>
          </div>
        </label>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { showToast } from 'vant'
import { publicUploadFile } from '@/api'
import { prepareTaskProofImage } from '@/utils/prepareTaskProofImage'

const props = defineProps<{
  homepageProofImages: string[]
  homepageProofFileIds: string[]
  proofImages: string[]
  proofFileIds: string[]
  platformThemeColor: string
  homepageRecognition?: any
}>()

const emit = defineEmits<{
  (e: 'update:homepageProofImages', value: string[]): void
  (e: 'update:homepageProofFileIds', value: string[]): void
  (e: 'update:proofImages', value: string[]): void
  (e: 'update:proofFileIds', value: string[]): void
  (e: 'homepage-proof-image-error'): void
}>()

const maxProofFiles = 6
const hasHomepageProof = computed(() => props.homepageProofImages.length > 0 && props.homepageProofFileIds.length > 0)

const recognitionStatus = computed(() => String(props.homepageRecognition?.status || '').toUpperCase())
const recognitionLoading = computed(() => ['PENDING', 'PROCESSING', 'NOT_REQUESTED'].includes(recognitionStatus.value))
const recognitionHint = computed(() => {
  const status = recognitionStatus.value
  if (recognitionLoading.value) return '正在识别主页信息，不影响继续完成任务'
  const error = String(props.homepageRecognition?.error || '').trim()
  if (status === 'SUCCEEDED') return '主页信息已识别，可在任务账号的识别信息中查看'
  if (status === 'REVIEW_REQUIRED') return error || '识别结果待核验，可在任务账号的识别信息中查看'
  if (status === 'FAILED') return error || '主页信息暂未识别成功，不影响继续完成任务'
  return ''
})

async function uploadOneFile(file: File, scene = 'TASK_CLAIM_PROOF') {
  const preparedFile = await prepareTaskProofImage(file)
  const formData = new FormData()
  formData.append('file', preparedFile)
  formData.append('scene', scene)
  const resp: any = await publicUploadFile(formData)
  if (!(resp?.code === 0 || resp?.success)) throw new Error(resp?.message || resp?.msg || '上传失败')
  const data = resp.data || resp
  const url = String(data?.url || data?.viewUrl || data?.filepath || data || '')
  const fileId = String(data?.id || data?.fileId || '')
  if (!url || !fileId) throw new Error('上传结果缺少文件信息')
  return { url, fileId }
}

async function onHomepageUpload(event: Event) {
  const target = event.target as HTMLInputElement | null
  const file = Array.from(target?.files || [])[0]
  if (!file) return
  const toast = showToast({ type: 'loading', message: '上传中...', forbidClick: true, duration: 0 })
  try {
    const uploaded = await uploadOneFile(file)
    emit('update:homepageProofImages', [uploaded.url])
    emit('update:homepageProofFileIds', [uploaded.fileId])
    showToast('主页截图已保存')
  } catch (e: any) {
    showToast(e?.message || '上传失败，请重试')
  } finally {
    toast.close()
    if (target) target.value = ''
  }
}

async function onTaskProofUpload(event: Event) {
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
      const uploaded = await uploadOneFile(file)
      nextImages.push(uploaded.url)
      nextFileIds.push(uploaded.fileId)
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

function removeHomepageProof(index: number) {
  emit('update:homepageProofImages', props.homepageProofImages.filter((_, i) => i !== index))
  emit('update:homepageProofFileIds', props.homepageProofFileIds.filter((_, i) => i !== index))
}

function removeProof(index: number) {
  emit('update:proofImages', props.proofImages.filter((_, i) => i !== index))
  emit('update:proofFileIds', props.proofFileIds.filter((_, i) => i !== index))
}
</script>
