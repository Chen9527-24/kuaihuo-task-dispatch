<template>
  <van-popup
    v-model:show="modelShow"
    position="center"
    :overlay="true"
    :close-on-click-overlay="closeOnClickOverlay"
    :overlay-style="{ background: 'rgba(0, 0, 0, 0.5)' }"
    :style="{ width: '88%', maxWidth: '420px', borderRadius: '12px', padding: '12px', overflow: 'hidden' }"
  >
    <div class="flex flex-col gap-[12px]">
      <div class="max-h-[80vh] overflow-y-auto pr-[2px]">
        <slot name="content">
        </slot>
      </div>
      <div class="shrink-0">
        <slot name="footer" :close="closePopup"></slot>
      </div>
    </div>
  </van-popup>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  show: boolean
  imageUrl: string
  closeOnClickOverlay?: boolean
}>(), {
  closeOnClickOverlay: true
})

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
}>()

const modelShow = computed({
  get: () => props.show,
  set: (value: boolean) => emit('update:show', value)
})
const closeOnClickOverlay = computed(() => props.closeOnClickOverlay)
const closePopup = () => {
  modelShow.value = false
}
</script>
