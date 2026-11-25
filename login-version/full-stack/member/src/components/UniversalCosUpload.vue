<script setup lang="ts">
import { showToast } from 'vant'
import { computed, ref } from 'vue'
import { uploadTaskAttachments } from '@/api'
import { useCosUpload } from '@/composables/useCosUpload'
import type { UploadMode, UploadedItem } from '@/types/upload'

type UploadStatus = 'uploading' | 'done' | 'failed'

interface UploadUserFile {
  url?: string
  file?: File
  name?: string
  size?: number
  status?: UploadStatus
  message?: string
  [key: string]: any
}

const props = withDefaults(defineProps<{
  mode?: UploadMode
  dir?: string
  max?: number
  maxSizeMB?: number
  ext?: string[]
  listType?: 'text' | 'picture' | 'picture-card'
  keepOriginalName?: boolean
  disabled?: boolean
  uploadStrategy?: 'cos' | 'manual' | 'task-api'
  commentId?: string | number
}>(), {
  mode: 'file',
  dir: 'files',
  max: 5,
  maxSizeMB: 20,
  listType: 'picture-card',
  keepOriginalName: true,
  disabled: false,
  uploadStrategy: 'cos',
  commentId: '',
})

const files = defineModel<UploadUserFile[]>('files', { default: [] })

const emits = defineEmits<{
  success: [payload: UploadedItem, file: UploadUserFile, fileList: UploadUserFile[]]
  successAll: [payload: UploadedItem[]]
  remove: [file: UploadUserFile, fileList: UploadUserFile[]]
}>()

const { uploadOne, validateFile, constants } = useCosUpload()

const allowedExt = computed(() => constants.normalizeModeExt(props.mode, props.ext))
const accept = computed(() => {
  if (allowedExt.value.length === 0) return ''
  return allowedExt.value.map(e => `.${e}`).join(',')
})

const uploadedItems = ref<UploadedItem[]>([])

const normalizeInput = (input: File | File[]) => {
  if (Array.isArray(input)) return input
  return [input]
}

const validateOne = (rawFile: File) => {
  const result = validateFile(rawFile, {
    mode: props.mode,
    customExt: props.ext,
    maxSizeMB: props.maxSizeMB,
  })
  if (!result.extOk) showToast(`文件类型不支持，允许：${result.allowedExt.join(' / ') || '全部'}`)
  if (!result.sizeOk) showToast(`文件大小不能超过 ${props.maxSizeMB}MB`)
  return result.ok
}

const handleBeforeRead = (input: File | File[]) => {
  const list = normalizeInput(input)
  const remain = Math.max(0, Number(props.max) - files.value.length)
  if (!remain || list.length > remain) {
    showToast(`最多上传 ${props.max} 个文件`)
    return false
  }
  return list.every(validateOne)
}

const normalizeUploadFile = (f: UploadUserFile) => {
  return {
    name: String(f?.name || f?.file?.name || ''),
    size: Number(f?.size ?? f?.file?.size ?? 0),
    url: String(f?.url || ''),
    status: f?.status,
    message: f?.message,
    file: f?.file,
  } as UploadUserFile
}

const handleDelete = (file: UploadUserFile) => {
  emits('remove', normalizeUploadFile(file), files.value.map(normalizeUploadFile))
}

const uploadOneItem = async (entry: UploadUserFile) => {
  try {
    const file = entry.file as File
    if (!file) return
    if (props.uploadStrategy === 'manual') {
      entry.status = 'done'
      entry.message = '已选择'
      entry.url = String(entry.url || (entry as any).content || '')
      return
    }
    if (props.uploadStrategy === 'task-api') {
      const commentId = String(props.commentId ?? '').trim()
      if (!commentId) {
        showToast('请先领取评论')
        entry.status = 'failed'
        entry.message = '未领取评论'
        return
      }
      entry.status = 'uploading'
      entry.message = '上传中...'
      const formData = new FormData()
      formData.append('files', file)
      formData.append('commentId', commentId)
      const resp: any = await uploadTaskAttachments(formData)
      if (resp?.code !== 0) {
        throw new Error(resp?.msg || '上传失败')
      }
      const attachment = Array.isArray(resp?.data?.attachments) ? resp.data.attachments[0] : null
      const uploadedUrl = String(attachment?.url || '').trim().replace(/^`+|`+$/g, '')
      entry.status = 'done'
      entry.message = '上传成功'
      entry.url = uploadedUrl || entry.url || ''
      return
    }
    entry.status = 'uploading'
    entry.message = '上传中...'
    const item = await uploadOne(file, {
      dir: props.dir,
      keepOriginalName: props.keepOriginalName,
    })
    uploadedItems.value.push(item)
    entry.status = 'done'
    entry.message = '上传成功'
    entry.url = item.viewUrl || entry.url || ''
    emits('success', item, normalizeUploadFile(entry), files.value.map(normalizeUploadFile))
    emits('successAll', [...uploadedItems.value])
  } catch (e: any) {
    entry.status = 'failed'
    entry.message = '上传失败'
    showToast(e?.message || '上传失败，请重试')
  }
}

const handleAfterRead = async (input: UploadUserFile | UploadUserFile[]) => {
  const list = Array.isArray(input) ? input : [input]
  for (const entry of list) {
    await uploadOneItem(entry)
  }
}
</script>

<template>
  <div class="flex flex-col gap-[10px]">
    <van-uploader
      v-model="files"
      :max-count="max"
      :accept="accept"
      :disabled="disabled"
      :before-read="handleBeforeRead"
      :after-read="handleAfterRead"
      @delete="handleDelete"
      multiple
    >
      <van-button type="primary" size="small" :disabled="disabled">
        点击上传
      </van-button>
    </van-uploader>
    <div class="text-[12px] text-[#6b7280] leading-[18px]">
      允许类型：{{ allowedExt.length ? allowedExt.join(' / ') : '全部' }}，单文件 ≤ {{ maxSizeMB }}MB，最多 {{ max }} 个
    </div>
    <div v-if="files.length" class="flex flex-col gap-[6px]">
      <div v-for="(f, idx) in files" :key="`${f.name || f.url || 'file'}_${idx}`" class="text-[12px] text-[#374151] break-all">
        {{ f.name || f.file?.name || f.url || '-' }}<span v-if="f.status">（{{ f.message || f.status }}）</span>
      </div>
    </div>
  </div>
</template>
