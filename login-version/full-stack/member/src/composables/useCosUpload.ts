// src/composables/useCosUpload.ts
import apiCommon from '@/api/modules/common'
import type { UploadedItem } from '@/types/upload'

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg']
const VIDEO_EXT = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'm4v']
const FILE_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'zip', 'rar', '7z']

function getExt(name: string) {
  return (name.split('.').pop() || '').toLowerCase()
}

function normalizeModeExt(mode: string, customExt?: string[]) {
  if (customExt?.length) return customExt.map(v => v.toLowerCase())
  if (mode === 'image') return IMAGE_EXT
  if (mode === 'video') return VIDEO_EXT
  if (mode === 'file') return FILE_EXT
  if (mode === 'image|video') return [...IMAGE_EXT, ...VIDEO_EXT]
  if (mode === 'image|video|file' || mode === 'all') return []
  return FILE_EXT
}

function buildObjectName(file: File, dir: string, keepOriginalName: boolean) {
  const ext = getExt(file.name)
  if (keepOriginalName) return `${dir}/${file.name}`
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  return ext ? `${dir}/${stamp}.${ext}` : `${dir}/${stamp}`
}

export function useCosUpload() {
  async function uploadOne(file: File, options?: {
    dir?: string
    keepOriginalName?: boolean
  }): Promise<UploadedItem> {
    const dir = options?.dir || 'files'
    const keepOriginalName = options?.keepOriginalName ?? true
    const name = buildObjectName(file, dir, keepOriginalName)
    const signed = await apiCommon.getUploadUrl(name)
    if (!signed?.url) throw new Error('签名地址不存在')
    const put = await fetch(signed.url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    })
    if (!put.ok) throw new Error(`上传失败: ${put.status}`)
    const filepath = signed.filepath || name
    const viewUrl = signed.viewUrl || ''
    return {
      name: file.name,
      size: file.size,
      type: file.type || '',
      ext: getExt(file.name),
      filepath,
      viewUrl,
      raw: signed,
    }
  }

  function validateFile(file: File, options: {
    mode?: string
    customExt?: string[]
    maxSizeMB?: number
  }) {
    const mode = options.mode || 'file'
    const allowedExt = normalizeModeExt(mode, options.customExt)
    const ext = getExt(file.name)
    const maxSizeMB = options.maxSizeMB ?? 20
    const sizeOk = file.size / 1024 / 1024 <= maxSizeMB
    const extOk = allowedExt.length === 0 ? true : allowedExt.includes(ext)
    return {
      ok: sizeOk && extOk,
      sizeOk,
      extOk,
      ext,
      allowedExt,
    }
  }

  return {
    uploadOne,
    validateFile,
    constants: {
      IMAGE_EXT,
      VIDEO_EXT,
      FILE_EXT,
      normalizeModeExt,
    },
  }
}