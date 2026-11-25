/// <reference types="vite/client" />

type TaskGuideImage = string | { ios?: string; android?: string }
type TaskGuidePlatform = { start?: TaskGuideImage; claim?: TaskGuideImage }

interface Window {
  __TASK_CONFIG__?: {
    tenantId?: string
    wechatOAuth?: boolean
    guideImages?: Partial<Record<'douyin' | 'xiaohongshu' | 'weixin', TaskGuidePlatform>>
  }
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, any>
  export default component
}
