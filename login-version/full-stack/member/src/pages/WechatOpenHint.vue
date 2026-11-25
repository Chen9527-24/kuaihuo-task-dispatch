<template>
  <div class="min-h-screen bg-[#f7f8fa] flex items-center justify-center px-[24px]">
    <div class="w-full max-w-[360px] rounded-[24px] bg-white p-[26px] text-center shadow-[0_12px_36px_rgba(15,23,42,0.08)]">
      <div class="mx-auto flex h-[64px] w-[64px] items-center justify-center rounded-full bg-[#ecfdf5]">
        <van-icon name="wechat" size="34" color="#07c160" />
      </div>
      <div class="mt-[18px] text-[18px] font-bold text-[#111827]">请在微信内打开本页面</div>
      <div class="mt-[10px] text-[14px] leading-[24px] text-[#6b7280]">当前任务系统需要通过服务号网页授权识别成员身份。请复制链接后发送到微信，再从微信内打开。</div>
      <van-button class="mt-[22px] w-full !rounded-full" type="primary" color="#07c160" @click="copyLink">复制当前链接</van-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { showToast } from 'vant'
import { useRoute } from 'vue-router'
import { normalizeRedirectPath } from '@/services/wechatAuth'

const route = useRoute()

async function copyLink() {
  const redirect = normalizeRedirectPath(Array.isArray(route.query.redirect) ? route.query.redirect[0] : route.query.redirect)
  const url = new URL(redirect, window.location.origin).toString()
  try {
    await navigator.clipboard.writeText(url)
    showToast('已复制链接')
  } catch {
    showToast('复制失败，请手动复制地址栏链接')
  }
}
</script>
