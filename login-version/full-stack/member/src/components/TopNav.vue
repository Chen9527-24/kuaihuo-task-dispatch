<template>
  <div class="flex items-center h-[44px] px-[12px] bg-transparent">
    <van-icon v-if="showBack" name="arrow-left"  @click="handleGoBackClick"/>
    <div class="flex-1 text-center">
      <span class="text-[16px]">{{ title }}</span>
    </div>
    <!-- <div class="w-[28px]"></div> -->
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useClickThrottle } from '@/composables/useClickThrottle'
const props = withDefaults(defineProps<{ title?: string, showBack?: boolean }>(), { title: '返回', showBack: true })
const router = useRouter()
const { runThrottled } = useClickThrottle()
const goBack = () => {
  if (window.history.length > 1) router.back()
  else router.push('/')
}
const handleGoBackClick = () => runThrottled('top-nav-back', () => goBack(), { wait: 600, blockDuringExecution: false })
</script>

<style scoped>
</style>
