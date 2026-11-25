<template>
  <main class="follow-required">
    <section class="follow-card">
      <div class="follow-icon">
        <van-icon name="wechat" size="38" color="#07c160" />
      </div>
      <h1>请先关注服务号</h1>
      <p>关注后才能继续访问任务、团队、收益和提现页面。</p>
      <van-button class="follow-btn" type="primary" color="#07c160" :loading="checking" @click="checkAgain">我已关注，重新检测</van-button>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { getDistributionMe } from '@/api'
import { normalizeRedirectPath } from '@/services/wechatAuth'

const route = useRoute()
const router = useRouter()
const checking = ref(false)

function unwrap(resp: any) {
  return resp?.data ?? resp
}

function readRedirect() {
  const value = Array.isArray(route.query.redirect) ? route.query.redirect[0] : route.query.redirect
  return normalizeRedirectPath(String(value || '/'))
}

async function checkAgain() {
  checking.value = true
  try {
    const me = unwrap(await getDistributionMe({ refreshSubscribe: 1 }))
    if (me?.wechatOfficialAccount?.subscribed === false) {
      showToast('还未检测到关注，请先关注服务号')
      return
    }
    showToast('已通过关注检测')
    router.replace(readRedirect())
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.response?.data?.msg || e?.message || '检测失败，请稍后重试'
    showToast(Array.isArray(msg) ? msg.join('，') : msg)
  } finally {
    checking.value = false
  }
}
</script>

<style scoped>
.follow-required {
  min-height: 100vh;
  min-height: calc(var(--vh, 1vh) * 100);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: #f7f8fa;
}

.follow-card {
  width: 100%;
  max-width: 360px;
  padding: 28px 24px;
  border-radius: 24px;
  background: #fff;
  text-align: center;
  box-shadow: 0 12px 36px rgba(15, 23, 42, 0.08);
}

.follow-icon {
  width: 68px;
  height: 68px;
  margin: 0 auto 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #ecfdf5;
}

.follow-card h1 {
  margin: 0;
  color: #111827;
  font-size: 20px;
  font-weight: 800;
}

.follow-card p {
  margin: 10px 0 22px;
  color: #6b7280;
  font-size: 14px;
  line-height: 24px;
}

.follow-btn {
  width: 100%;
  border-radius: 999px;
}
</style>
