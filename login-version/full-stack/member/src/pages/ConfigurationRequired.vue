<template>
  <main class="configuration-page">
    <h1>站点尚未配置完成</h1>
    <p>暂未设置任务所属租户，请联系站点管理员完成配置。</p>
    <p>管理员可按项目配置说明设置自己的租户，再重新启动或构建。此站点不附带可直接使用的业务账号。</p>
    <button type="button" @click="retry">重新检查</button>
  </main>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
function retry() { void router.replace('/') }
</script>

<style scoped>
.configuration-page { max-width: 520px; margin: 12vh auto; padding: 28px; line-height: 1.8; color: #1e293b; }
h1 { font-size: 24px; }
p { color: #64748b; }
button { border: 0; border-radius: 10px; padding: 12px 20px; background: #0f172a; color: white; cursor: pointer; }
</style>
