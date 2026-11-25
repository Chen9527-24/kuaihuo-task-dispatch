// src/types/upload.ts
export type UploadMode = 'file' | 'image' | 'video' | 'all' | 'image|video' | 'image|video|file'

export interface UploadedItem {
  name: string
  size: number
  type: string
  ext: string
  filepath: string
  viewUrl: string
  raw: any
}

export interface UploadResult {
  items: UploadedItem[]
}