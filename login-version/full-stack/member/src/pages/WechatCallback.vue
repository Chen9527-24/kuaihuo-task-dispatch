<template>
  <div class="min-h-screen bg-[#f7f8fa] flex items-center justify-center px-[24px]">
    <div class="w-full max-w-[360px] rounded-[24px] bg-white p-[24px] text-center shadow-[0_12px_36px_rgba(15,23,42,0.08)]">
      <van-loading v-if="!errorMessage" size="28" vertical>正在登录，请稍候...</van-loading>
      <template v-else>
        <van-icon name="warning-o" size="40" color="#f59e0b" />
        <div class="mt-[12px] text-[17px] font-semibold text-[#111827]">微信授权失败</div>
        <div class="mt-[8px] text-[14px] leading-[22px] text-[#6b7280]">{{ errorMessage }}</div>
        <van-button class="mt-[18px] w-full !rounded-full" type="primary" @click="retry">重新进入</van-button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { normalizeRedirectPath, saveAppToken, clearWechatOAuthRedirecting } from '@/services/wechatAuth'
import { recordH5Debug } from '@/services/debug'

const route = useRoute()
const router = useRouter()
const errorMessage = ref('')

const readQueryString = (value: unknown) => {
  if (Array.isArray(value)) return String(value[0] || '').trim()
  return String(value || '').trim()
}

onMounted(() => {
  clearWechatOAuthRedirecting()
  const error = readQueryString(route.query.error)
  const message = readQueryString(route.query.message)
  const token = readQueryString(route.query.token || route.query.appToken)
  const redirect = normalizeRedirectPath(readQueryString(route.query.redirect) || '/')
  recordH5Debug('auth:callback-enter', { hasError: Boolean(error), message, tokenExists: Boolean(token), redirect, queryKeys: Object.keys(route.query || {}) })

  if (error || !token) {
    errorMessage.value = message || '未获取到登录凭证，请重新从微信内打开页面。'
    recordH5Debug('auth:callback-error', { error, message: errorMessage.value }, 'error')
    return
  }

  saveAppToken(token)
  showToast('登录成功')
  recordH5Debug('auth:callback-success', { redirect })
  router.replace(redirect)
})

function retry() {
  router.replace('/')
}
</script>
