<template>
  <!-- 顶部信息区：强效毛玻璃，去除底部边框，完全依靠阴影和透明度分离层级 -->
  <div ref="headerRef" class="fixed top-0 left-0 w-full z-[50] bg-white/75 backdrop-blur-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border-none" style="backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);">
    <TopNav title="评论进度详情" />
    <div class="px-[20px] pb-[24px] pt-[12px]">
      <div class="mb-[20px]">
        <div class="inline-flex items-center gap-[6px] px-[8px] py-[4px] rounded-[6px] bg-black/[0.03] text-[#444] text-[12px] font-medium mb-[10px]">
          <van-icon name="video-o" size="14" />
          <span>视频内容</span>
        </div>
        <p class="text-[18px] font-bold text-[#111] leading-[26px] break-words line-clamp-3">{{ title || '-' }}</p>
      </div>

      <!-- 数据看板：纯净玻璃态，去除一切深色边框，采用白色发光内阴影和微弱的外投影，打造呼吸感 -->
      <div class="flex items-center justify-between rounded-[20px] bg-white/50 p-[16px] shadow-[inset_0_2px_4px_rgba(255,255,255,0.9),0_4px_16px_rgba(0,0,0,0.02)]">
        <div class="flex flex-col items-center flex-1">
          <div class="text-[12px] text-[#666] font-medium mb-[4px]">总评论数</div>
          <div class="text-[24px] font-din font-bold text-[#111]">{{ total }}</div>
        </div>
        <div class="w-[1px] h-[24px] bg-gradient-to-b from-transparent via-black/[0.06] to-transparent"></div>
        <div class="flex flex-col items-center flex-1">
          <div class="text-[12px] text-[#666] font-medium mb-[4px]">已领取</div>
          <div class="text-[24px] font-din font-bold text-[#10b981]">{{ received }}</div>
        </div>
        <div class="w-[1px] h-[24px] bg-gradient-to-b from-transparent via-black/[0.06] to-transparent"></div>
        <div class="flex flex-col items-center flex-1">
          <div class="text-[12px] text-[#666] font-medium mb-[4px]">完成率</div>
          <div class="text-[24px] font-din font-bold text-[#6366f1]">{{ percent }}%</div>
        </div>
      </div>
    </div>
  </div>

  <!-- 列表区 -->
  <div :style="{ paddingTop: `${headerHeight}px` }" class="pb-[30px] bg-[#f4f6f9] min-h-screen font-sans box-border relative z-[10]">
    <div class="flex-1 px-[16px] pt-[20px] flex flex-col gap-[16px]">
      <div
        v-for="(item,i) in displayItems"
        :key="i"
        class="rounded-[24px] bg-white p-[20px] shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-[#f0f0f0] transition-transform duration-300 hover:scale-[1.02]"
      >
        <div class="flex items-center justify-between mb-[12px]">
          <div class="flex items-center gap-[8px]">
            <div class="w-[32px] h-[32px] rounded-full bg-[#f4f6f9] text-[#555] flex items-center justify-center text-[14px] font-bold border border-[#e5e7eb]">{{ item.name.charAt(0).toUpperCase() }}</div>
            <div class="text-[15px] font-bold text-[#111]">{{ item.name }}</div>
          </div>
          <div class="text-[12px] text-[#888] flex items-center gap-[4px] bg-[#f8f9fa] px-[8px] py-[4px] rounded-full"><van-icon name="clock-o" /> {{ item.time }}</div>
        </div>
        <div class="px-[16px] py-[14px] rounded-[20px] rounded-tl-[6px] bg-[#f8f9fa] text-[14px] text-[#333] leading-[24px] break-words border border-[#f0f0f0]">
          {{ item.comment }}
        </div>
      </div>
      <div class="py-[20px] text-center text-[13px] text-[#10b981] flex items-center justify-center gap-[6px] font-medium">
        <div class="w-[24px] h-[24px] rounded-full bg-[#ecfdf5] flex items-center justify-center">
          <van-icon name="success" />
        </div>
        <span>已加载全部 {{ displayItems.length }} 条记录</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getPostDetail } from '@/api'
import { useCurrentPostStore } from '@/store/current'
import { resolveDefaultTenantsId } from '@/constant'

const router = useRouter()
const route = useRoute()
const store = useCurrentPostStore()
const DEFAULT_TENANTS_ID = resolveDefaultTenantsId()

const normalizeTenantsId = (value: unknown) => {
  const s = String(value ?? '').trim()
  if (!s || s === '0' || s === 'null' || s === 'undefined') return ''
  return s
}

const title = ref('')
const items = ref<{ name: string; time: string; comment: string; status: number }[]>([])
const displayItems = computed(() => items.value)
const total = computed(() => {
  const q = Number(route.query?.commentCount ?? NaN)
  return Number.isFinite(q) ? q : items.value.length
})
const received = computed(() => {
  const q = Number(route.query?.claimedCount ?? NaN)
  return Number.isFinite(q) ? q : items.value.length
})
const percent = computed(() => (total.value ? Math.round((received.value / total.value) * 100) : 0))

const pad = (n: number) => (n < 10 ? '0' + n : '' + n)
const formatDate = (input: any) => {
  if (!input) return ''
  const d = typeof input === 'string' || typeof input === 'number' ? new Date(input) : input
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return String(input)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const headerRef = ref<HTMLElement | null>(null)
const headerHeight = ref(240)
let resizeObserver: ResizeObserver | null = null

async function load() {
  const tidFromQuery = normalizeTenantsId((route.query as any)?.tenantsId)
  ;(store as any).setTenantsId(tidFromQuery || DEFAULT_TENANTS_ID)
  const id = store.currentPostId
  if (!id) return
  const res: any = await getPostDetail(id)
  const arr = Array.isArray(res?.data?.list) ? res.data.list : []
  items.value = arr.map((c: any) => ({
    name: String(c?.claimName ?? c?.externalUser ?? c?.userName ?? c?.username ?? '-'),
    time: formatDate(c?.updatedAt ?? c?.claimTime ?? c?.createdAt),
    comment: String(c?.comment?.content ?? ''),
    status: Number(c?.complete ?? (c?.claimTime ? 1 : 0)),
  }))
  title.value = String((route.query?.postTitle ?? title.value) || '')
}

onMounted(() => {
  load()
  if (headerRef.value) {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        headerHeight.value = entry.contentRect.height
      }
    })
    resizeObserver.observe(headerRef.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
})
</script>

<style scoped>
</style>
