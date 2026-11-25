<template>
  <el-dialog
    v-model="visible"
    :title="mandatory ? '选择租户' : '切换租户'"
    width="560px"
    :show-close="!mandatory"
    :close-on-click-modal="!mandatory"
    :close-on-press-escape="!mandatory"
    :before-close="handleBeforeClose"
    align-center
    destroy-on-close
  >
    <div class="space-y-4">
      <div class="text-sm text-slate-500 dark:text-slate-400">
        {{ mandatory ? '当前账号绑定了多个租户，请先选择本次登录的租户后再继续。' : '切换后会重新加载当前租户的权限、菜单和页面数据。' }}
      </div>

      <div class="space-y-3">
        <button
          v-for="tenant in tenants"
          :key="tenant.tenantId"
          type="button"
          class="w-full rounded-2xl border px-4 py-4 text-left transition"
          :class="
            selectedTenantId === tenant.tenantId
              ? 'border-[var(--el-color-primary)] bg-[color-mix(in_srgb,var(--el-color-primary)_8%,white)]'
              : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-500'
          "
          @click="selectedTenantId = tenant.tenantId"
        >
          <div class="flex items-center justify-between gap-4">
            <div>
              <div class="text-base font-semibold text-slate-900 dark:text-slate-100">{{ tenant.tenantName }}</div>
              <div v-if="tenant.tenantCode" class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ tenant.tenantCode }}</div>
            </div>
            <el-tag v-if="tenant.isDefault" type="success" effect="plain">默认租户</el-tag>
          </div>
        </button>
      </div>
    </div>

    <template #footer>
      <el-button v-if="!mandatory" @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" :disabled="!selectedTenantId" @click="handleConfirm">确认</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { AuthTenant } from '@/types/auth';

const props = withDefaults(defineProps<{
  modelValue: boolean;
  tenants: AuthTenant[];
  selectedTenantId?: string;
  submitting?: boolean;
  mandatory?: boolean;
}>(), {
  selectedTenantId: '',
  submitting: false,
  mandatory: true
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  confirm: [tenantId: string];
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => {
    if (value || !props.mandatory) emit('update:modelValue', value);
  }
});

const selectedTenantId = ref('');

watch(
  () => [props.modelValue, props.selectedTenantId, props.tenants] as const,
  () => {
    selectedTenantId.value = props.selectedTenantId || props.tenants.find((item) => item.isDefault)?.tenantId || props.tenants[0]?.tenantId || '';
  },
  { immediate: true, deep: true }
);

function handleBeforeClose(done: () => void) {
  if (props.mandatory) return;
  emit('update:modelValue', false);
  done();
}

function handleConfirm() {
  if (!selectedTenantId.value) return;
  emit('confirm', selectedTenantId.value);
}
</script>
