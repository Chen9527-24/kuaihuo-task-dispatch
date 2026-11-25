<template>
  <RouterView />
  <TenantSelectDialog
    v-model="tenantDialogVisible"
    :tenants="authStore.tenants"
    :selected-tenant-id="authStore.pendingTenantId"
    :submitting="submitting"
    :mandatory="authStore.requiresTenantSelection"
    @confirm="handleTenantConfirm"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useRouter } from 'vue-router';
import TenantSelectDialog from '@/components/TenantSelectDialog.vue';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';

const router = useRouter();
const authStore = useAuthStore();
const settingsStore = useSettingsStore();
const submitting = ref(false);

const tenantDialogVisible = computed({
  get: () => authStore.isTenantDialogVisible,
  set: (value: boolean) => {
    if (!value) authStore.closeTenantSwitcher();
  }
});

let mediaQuery: MediaQueryList | null = null;
let listener: (() => void) | null = null;

onMounted(() => {
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  listener = () => {
    if (settingsStore.themeMode === 'system') {
      settingsStore.applySettings();
    }
  };
  mediaQuery.addEventListener('change', listener);
});

onBeforeUnmount(() => {
  if (mediaQuery && listener) {
    mediaQuery.removeEventListener('change', listener);
  }
});

async function handleTenantConfirm(tenantId: string) {
  const wasManualSwitch = authStore.manualTenantSelectionOpen;
  submitting.value = true;
  try {
    authStore.setPendingTenant(tenantId);
    await authStore.selectTenant(tenantId);
    ElMessage.success(wasManualSwitch ? '租户已切换' : '租户已确认');
    await router.replace(wasManualSwitch ? '/task-management' : authStore.consumePostLoginRedirect());
  } catch (error) {
    const message = error instanceof Error ? error.message : '租户选择失败，请稍后重试';
    ElMessage.error(message);
  } finally {
    submitting.value = false;
  }
}
</script>
