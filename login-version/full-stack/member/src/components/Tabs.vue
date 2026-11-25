<template>
  <div class="relative h-[36px] rounded-[18px] p-[5px] bg-[#f3f4f6] flex items-center select-none">
    <div class="absolute inset-[5px] rounded-[18px]" style="pointer-events:none" v-if="itemsLen <= 3">
      <div
        class="absolute left-0 top-0 h-full rounded-[18px] bg-[#fff] shadow transition-all duration-300 ease-out"
        :style="indicatorStyle"
      ></div>
    </div>
    <div class="relative z-10 w-full box-border" :class="scrollClass" ref="scrollEl">
      <div class="relative h-full flex">
        <div
          v-if="itemsLen > 3"
          class="absolute left-0 top-0 h-full rounded-[18px] bg-[#fff] shadow transition-all duration-300 ease-out"
          :style="indicatorStyle"
        ></div>
        <span
          v-for="(item,i) in items"
          :key="item.value"
          class="text-center transition-colors duration-300 flex-shrink-0 h-full"
          :class="{ 'font-bold': selectedIndex === i }"
          :style="{ width: segmentPercent + '%' }"
          @click="handleTabClick(i)"
        >
          {{ item.name }}
        </span>
      </div>
    </div>
  </div>
  </template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useClickThrottle } from '@/composables/useClickThrottle'
const props = withDefaults(defineProps<{ items: { name: string; value: string }[]; modelValue?: number }>(), { modelValue: 0 })
const emit = defineEmits<{ (e: 'update:modelValue', v: number): void; (e: 'change', item: { name: string; value: string }, index: number): void }>()
const { runThrottled } = useClickThrottle()

const items = computed(() => props.items || [])
const itemsLen = computed(() => items.value.length)
const selectedIndex = computed(() => props.modelValue)

const segmentPercent = computed(() => {
  const count = itemsLen.value || 1
  return count <= 3 ? 100 / count : 100 / 3
})

const indicatorStyle = computed(() => {
  const idx = Math.min(Math.max(props.modelValue, 0), Math.max(itemsLen.value - 1, 0))
  return { width: `${segmentPercent.value}%`, left: `${idx * segmentPercent.value}%` }
})

const scrollEl = ref<HTMLElement | null>(null)
const scrollClass = computed(() => (itemsLen.value > 3 ? 'overflow-x-auto no-scrollbar' : ''))

function onClick(i: number) {
  emit('update:modelValue', i)
  const it = items.value[i]
  if (it) emit('change', it, i)
  ensureVisible(i)
}

function handleTabClick(i: number) {
  runThrottled(`tab-${i}`, () => onClick(i), { wait: 300, blockDuringExecution: false })
}

function ensureVisible(i: number) {
  const el = scrollEl.value
  if (!el || itemsLen.value <= 3) return
  const segW = el.clientWidth / 3
  const targetLeft = i * segW
  const maxLeft = el.scrollWidth - el.clientWidth
  el.scrollTo({ left: Math.min(Math.max(targetLeft, 0), maxLeft), behavior: 'smooth' })
}

watch(() => props.modelValue, (v) => { ensureVisible(v) })

let isDown = false
let startX = 0
let scrollLeft = 0

function onMouseDown(e: MouseEvent) {
  if (itemsLen.value <= 3) return
  isDown = true
  startX = e.pageX
  scrollLeft = (scrollEl.value as any)?.scrollLeft || 0
  document.body.classList.add('tab-dragging')
}

function onMouseMove(e: MouseEvent) {
  if (!isDown || itemsLen.value <= 3) return
  const el = scrollEl.value
  if (!el) return
  const dx = startX - e.pageX
  el.scrollLeft = scrollLeft + dx
}

function onMouseUp() {
  isDown = false
  document.body.classList.remove('tab-dragging')
}

function onTouchStart(e: TouchEvent) {
  if (itemsLen.value <= 3) return
  isDown = true
  startX = e.touches[0].pageX
  scrollLeft = (scrollEl.value as any)?.scrollLeft || 0
}

function onTouchMove(e: TouchEvent) {
  if (!isDown || itemsLen.value <= 3) return
  const el = scrollEl.value
  if (!el) return
  const dx = startX - e.touches[0].pageX
  el.scrollLeft = scrollLeft + dx
}

function onTouchEnd() { isDown = false }

onMounted(() => {
  const el = scrollEl.value
  if (!el) return
  el.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  el.addEventListener('touchstart', onTouchStart, { passive: true })
  el.addEventListener('touchmove', onTouchMove, { passive: true })
  el.addEventListener('touchend', onTouchEnd)
  ensureVisible(props.modelValue)
})

onBeforeUnmount(() => {
  const el = scrollEl.value
  if (el) {
    el.removeEventListener('mousedown', onMouseDown)
    el.removeEventListener('touchstart', onTouchStart)
    el.removeEventListener('touchmove', onTouchMove)
    el.removeEventListener('touchend', onTouchEnd)
  }
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
})
</script>

<style scoped>
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
.tab-dragging { cursor: grabbing; }
</style>
