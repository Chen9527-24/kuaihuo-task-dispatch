export type LegacyPlatform = 'douyin' | 'weixin' | 'xiaohongshu' | 'unknown'
export type ThemeKey = 'general' | 'quick' | 'douyin' | 'weixin' | 'xiaohongshu'

const DOUYIN_VALUES = new Set(['DOUYIN', 'TIKTOK_CN', 'TIKTOK', 'DOU_YIN', '抖音'])
const WEIXIN_VALUES = new Set(['WECHAT_VIDEO', 'WECHATVIDEO', 'VIDEO_CHANNEL', 'WEIXIN', 'WECHAT', 'WECHAT_CHANNEL', '微信视频号', '视频号'])
const XIAOHONGSHU_VALUES = new Set(['XIAOHONGSHU', 'RED_BOOK', 'REDBOOK', 'XHS', '小红书'])

const THEME_MAP: Record<ThemeKey, Record<string, string>> = {
  general: {
    '--theme-solid': '#111827',
    '--theme-solid-end': '#1f2937',
    '--theme-card-bg': 'linear-gradient(180deg, #ffffff 0%, #f9fbfc 100%)',
    '--theme-card-border': '#e5e7eb',
    '--theme-soft': '#f7f8fa',
    '--theme-soft-end': '#ffffff',
    '--theme-soft-border': '#e5e7eb',
    '--theme-pill-bg': '#eef0f3',
    '--theme-pill-text': '#374151',
    '--theme-shadow': 'rgba(17,24,39,.10)',
    '--theme-shadow-strong': 'rgba(17,24,39,.04)',
  },
  quick: {
    '--theme-solid': '#0f766e',
    '--theme-solid-end': '#0f766e',
    '--theme-card-bg': 'linear-gradient(180deg, #ffffff 0%, #f9fbfc 100%)',
    '--theme-card-border': '#d8ebe7',
    '--theme-soft': '#f7fbfa',
    '--theme-soft-end': '#ffffff',
    '--theme-soft-border': '#d8ebe7',
    '--theme-pill-bg': '#e8f5f2',
    '--theme-pill-text': '#0f766e',
    '--theme-shadow': 'rgba(15,118,110,.10)',
    '--theme-shadow-strong': 'rgba(15,118,110,.04)',
  },
  douyin: {
    '--theme-solid': '#151827',
    '--theme-solid-end': '#151827',
    '--theme-card-bg': 'linear-gradient(180deg, #ffffff 0%, #f9fbfc 100%)',
    '--theme-card-border': '#e2e5ee',
    '--theme-soft': '#f7f8fb',
    '--theme-soft-end': '#ffffff',
    '--theme-soft-border': '#e2e5ee',
    '--theme-pill-bg': '#151827',
    '--theme-pill-text': '#ffffff',
    '--theme-shadow': 'rgba(21,24,39,.10)',
    '--theme-shadow-strong': 'rgba(21,24,39,.04)',
  },
  weixin: {
    '--theme-solid': '#16a35b',
    '--theme-solid-end': '#16a35b',
    '--theme-card-bg': 'linear-gradient(180deg, #ffffff 0%, #f9fbfc 100%)',
    '--theme-card-border': '#dcefe4',
    '--theme-soft': '#f7fcf9',
    '--theme-soft-end': '#ffffff',
    '--theme-soft-border': '#dcefe4',
    '--theme-pill-bg': '#16a35b',
    '--theme-pill-text': '#ffffff',
    '--theme-shadow': 'rgba(22,163,91,.10)',
    '--theme-shadow-strong': 'rgba(22,163,91,.04)',
  },
  xiaohongshu: {
    '--theme-solid': '#ef5f7e',
    '--theme-solid-end': '#ef5f7e',
    '--theme-card-bg': 'linear-gradient(180deg, #ffffff 0%, #f9fbfc 100%)',
    '--theme-card-border': '#f0dfe4',
    '--theme-soft': '#fff8fa',
    '--theme-soft-end': '#ffffff',
    '--theme-soft-border': '#f0dfe4',
    '--theme-pill-bg': '#ef5f7e',
    '--theme-pill-text': '#ffffff',
    '--theme-shadow': 'rgba(239,95,126,.10)',
    '--theme-shadow-strong': 'rgba(239,95,126,.04)',
  },
}

export function normalizePlatformCode(value: unknown) {
  return String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_')
}

export function normalizeLegacyPlatform(value: unknown): LegacyPlatform {
  const code = normalizePlatformCode(value)
  if (XIAOHONGSHU_VALUES.has(code)) return 'xiaohongshu'
  if (WEIXIN_VALUES.has(code)) return 'weixin'
  if (DOUYIN_VALUES.has(code)) return 'douyin'
  return 'unknown'
}

function stringifyPlatformSignal(value: unknown, depth = 0): string {
  if (value == null || depth > 2) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(item => stringifyPlatformSignal(item, depth + 1)).filter(Boolean).join(' ')
  if (typeof value === 'object') {
    const source = value as any
    const list = [
      source.platform,
      source.platformCode,
      source.sourcePlatform,
      source.videoUrl,
      source.workUrl,
      source.shareUrl,
      source.sourceUrl,
      source.url,
      source.link,
      source.title,
      source.authorName,
      source.task,
    ]
    return list.map(item => stringifyPlatformSignal(item, depth + 1)).filter(Boolean).join(' ')
  }
  return ''
}

export function inferLegacyPlatformFromSignal(value: unknown): LegacyPlatform {
  const text = stringifyPlatformSignal(value).trim()
  if (!text) return 'unknown'
  const upper = text.toUpperCase()
  if (/WEIXIN\.QQ\.COM\/SPH\//i.test(text) || /CHANNELS\.WEIXIN\.QQ\.COM/i.test(text) || /视频号/.test(text) || upper.includes('WECHAT_VIDEO')) return 'weixin'
  if (/V\.DOUYIN\.COM|DOUYIN\.COM|抖音|DOU音/i.test(text) || upper.includes('DOUYIN')) return 'douyin'
  if (/XIAOHONGSHU\.COM|小红书|XHS/i.test(text) || upper.includes('XIAOHONGSHU')) return 'xiaohongshu'
  return 'unknown'
}

export function platformLabel(value: unknown, fallback = '任务') {
  const direct = normalizeLegacyPlatform(value)
  const inferred = direct === 'unknown' ? inferLegacyPlatformFromSignal(value) : direct
  if (inferred === 'weixin') return '视频号'
  if (inferred === 'xiaohongshu') return '小红书'
  if (inferred === 'douyin') return '抖音'
  return fallback
}

export function toDistributionPlatformParam(value: unknown) {
  const direct = normalizeLegacyPlatform(value)
  const legacy = direct === 'unknown' ? inferLegacyPlatformFromSignal(value) : direct
  if (legacy === 'weixin') return 'WECHAT_VIDEO'
  if (legacy === 'xiaohongshu') return 'XIAOHONGSHU'
  if (legacy === 'douyin') return 'DOUYIN'
  return ''
}

export function resolveDistributionPlatformParam(...values: unknown[]) {
  for (const item of values) {
    const direct = normalizeLegacyPlatform(item)
    const code = direct === 'unknown' ? '' : toDistributionPlatformParam(direct)
    if (code) return code
  }
  for (const item of values) {
    const inferred = inferLegacyPlatformFromSignal(item)
    const code = inferred === 'unknown' ? '' : toDistributionPlatformParam(inferred)
    if (code) return code
  }
  return ''
}

export function resolveThemeKey(value: unknown, fallback: ThemeKey = 'general'): ThemeKey {
  if (value === 'general' || value === 'quick') return value
  const direct = normalizeLegacyPlatform(value)
  const inferred = direct === 'unknown' ? inferLegacyPlatformFromSignal(value) : direct
  if (inferred === 'weixin') return 'weixin'
  if (inferred === 'xiaohongshu') return 'xiaohongshu'
  if (inferred === 'douyin') return 'douyin'
  return fallback
}

export function getThemeStyleVars(value: unknown, fallback: ThemeKey = 'general') {
  return { ...THEME_MAP[resolveThemeKey(value, fallback)] }
}
