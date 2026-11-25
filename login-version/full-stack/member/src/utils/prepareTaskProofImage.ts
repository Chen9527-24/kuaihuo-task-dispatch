const COMPRESS_THRESHOLD_BYTES = 2 * 1024 * 1024
const TARGET_MAX_BYTES = 2 * 1024 * 1024
const MAX_LONG_EDGE = 1920
const OUTPUT_QUALITIES = [0.86, 0.78, 0.72]

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

type LoadedImage = {
  source: CanvasImageSource
  width: number
  height: number
  dispose: () => void
}

/**
 * 任务凭证上传前的图片预处理。
 *
 * - 仅允许后端已支持的 JPEG / PNG / WebP，避免前端允许而后端拒绝；
 * - 小于等于 2MB 的图片完全不处理，保持原文件、原文件名和原 MIME；
 * - 大于 2MB 时才尝试压缩，最长边限制为 1920px；
 * - 任何浏览器解码或压缩异常都会回退原文件，不阻断原有上传流程。
 */
export async function prepareTaskProofImage(file: File): Promise<File> {
  assertSupportedTaskProofImage(file)

  if (file.size <= COMPRESS_THRESHOLD_BYTES) {
    return file
  }

  if (!canUseCanvas()) {
    return file
  }

  let loadedImage: LoadedImage | null = null
  try {
    loadedImage = await loadImage(file)
    const { width, height } = resolveTargetSize(loadedImage.width, loadedImage.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) {
      return file
    }

    context.drawImage(loadedImage.source, 0, 0, width, height)

    let bestBlob: Blob | null = null
    for (const quality of OUTPUT_QUALITIES) {
      const blob = await canvasToBlob(canvas, 'image/webp', quality)
      if (!blob || !SUPPORTED_IMAGE_MIME_TYPES.has(blob.type)) {
        continue
      }

      if (!bestBlob || blob.size < bestBlob.size) {
        bestBlob = blob
      }

      if (blob.size <= TARGET_MAX_BYTES) {
        break
      }
    }

    // 压缩结果没有变小则继续上传原图，避免无意义的转码与画质损失。
    if (!bestBlob || bestBlob.size >= file.size) {
      return file
    }

    return new File([bestBlob], buildCompressedFileName(file.name, bestBlob.type), {
      type: bestBlob.type,
      lastModified: file.lastModified,
    })
  } catch {
    // 浏览器对部分照片格式（例如 HEIC）可能无法解码，保留原文件交由既有后端校验处理。
    return file
  } finally {
    loadedImage?.dispose()
  }
}

export function assertSupportedTaskProofImage(file: File) {
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(file.type)) {
    throw new Error('仅支持 JPG、PNG、WebP 格式图片')
  }
}

function canUseCanvas() {
  return typeof document !== 'undefined' && typeof URL !== 'undefined'
}

async function loadImage(file: File): Promise<LoadedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      // `from-image` 会让支持该能力的浏览器按 EXIF 方向解码，canvas 转码后方向仍正确。
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        dispose: () => bitmap.close(),
      }
    } catch {
      // 继续使用 Image 回退，兼容不支持 createImageBitmap 的移动浏览器。
    }
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('图片读取失败'))
      element.src = objectUrl
    })

    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error('图片尺寸无效')
    }

    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      dispose: () => URL.revokeObjectURL(objectUrl),
    }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

function resolveTargetSize(sourceWidth: number, sourceHeight: number) {
  const longestEdge = Math.max(sourceWidth, sourceHeight)
  if (!longestEdge || longestEdge <= MAX_LONG_EDGE) {
    return { width: sourceWidth, height: sourceHeight }
  }

  const scale = MAX_LONG_EDGE / longestEdge
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality)
  })
}

function buildCompressedFileName(originalName: string, mimeType: string) {
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/jpeg' ? 'jpg' : 'webp'
  const baseName = originalName.replace(/\.[^/.]+$/, '') || 'task-proof'
  return `${baseName}-compressed.${extension}`
}
