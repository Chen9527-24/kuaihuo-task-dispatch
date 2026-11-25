<template>
  <div class="space-y-4">
    <PageToolbar title="多媒体账号" description="维护租户在抖音、视频号、小红书等平台的账号资料">
      <el-form :model="filters" class="grid grid-cols-1 gap-4 md:grid-cols-5">
        <el-form-item label="关键词" class="!mb-0">
          <el-input v-model="filters.keyword" placeholder="账号名称 / 账号ID" clearable @keyup.enter="fetchList(true)" />
        </el-form-item>
        <el-form-item label="租户" class="!mb-0">
          <el-select
            v-model="filters.tenantId"
            :placeholder="canSelectTenant ? '请选择租户' : '当前租户'"
            filterable
            :clearable="false"
            :disabled="!canSelectTenant"
          >
            <el-option v-for="item in visibleTenantOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="平台" class="!mb-0">
          <el-select v-model="filters.platform" placeholder="全部平台" clearable>
            <el-option v-for="item in platformOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态" class="!mb-0">
          <el-select v-model="filters.status" placeholder="全部状态" clearable>
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作" class="!mb-0">
          <div class="flex gap-2">
            <el-button type="primary" @click="fetchList(true)">查询</el-button>
            <el-button @click="resetFilters">重置</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #actions>
        <el-button type="primary" @click="openCreate">新增</el-button>
      </template>
    </PageToolbar>

    <CrudTablePanel title="账号列表" description="多媒体账号会被每日任务选择并绑定">
      <el-table v-loading="loading" :data="items" row-key="id" stripe>
        <el-table-column type="index" label="#" width="60" />
        <el-table-column prop="platform" label="视频类型" width="130">
          <template #default="{ row }">
            <DictTag :value="row.platform" :options="platformOptions" />
          </template>
        </el-table-column>
        <el-table-column prop="accountId" label="账号ID" min-width="170" />
        <el-table-column prop="accountName" label="账号名称" min-width="180" />
        <el-table-column label="所属租户" min-width="160">
          <template #default="{ row }">{{ row.tenant?.name || tenantName(row.tenantId) }}</template>
        </el-table-column>
        <el-table-column prop="positioning" label="账号定位" min-width="260" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="110">
          <template #default="{ row }">
            <DictTag :value="row.status" :options="statusOptions" />
          </template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link @click="toggleStatus(row)">{{ row.status === 'ENABLED' ? '禁用' : '启用' }}</el-button>
            <el-button link type="danger" @click="handleRemove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <CrudPaginationBar
          :current-page="pagination.page"
          :page-size="pagination.pageSize"
          :total="pagination.total"
          @update:current-page="pagination.page = $event; fetchList()"
          @update:page-size="pagination.pageSize = $event; fetchList(true)"
        />
      </template>
    </CrudTablePanel>

    <MediaAccountFormDialog
      v-model="dialogVisible"
      :mode="dialogMode"
      :initial-data="formInitialData"
      :tenant-options="visibleTenantOptions"
      :platform-options="platformOptions"
      :status-options="statusOptions"
      :can-select-tenant="canSelectTenant"
      :submitting="submitting"
      @submit="handleSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as dictsApi from '@/api/modules/dicts';
import * as mediaAccountsApi from '@/api/modules/mediaAccounts';
import * as tenantsApi from '@/api/modules/tenants';
import DictTag from '@/components/common/DictTag.vue';
import PageToolbar from '@/components/common/PageToolbar.vue';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import CrudTablePanel from '@/features/crud/components/CrudTablePanel.vue';
import { useRemoteTable } from '@/composables/useRemoteTable';
import { DICT_TYPES } from '@/constants/dictTypes';
import { useAuthStore } from '@/stores/auth';
import type { MediaAccountItem } from '@/api/modules/mediaAccounts';
import type { SelectOption } from '@/utils/apiData';
import { formatDateTime } from '@/utils/format';
import MediaAccountFormDialog from './components/MediaAccountFormDialog.vue';
import { ENABLED_STATUS_FALLBACKS, MEDIA_PLATFORM_FALLBACKS } from './constants';
import type { MediaAccountFilters, MediaAccountFormModel } from './types';

defineOptions({ name: 'MediaAccountManagementView' });

const authStore = useAuthStore();
const tenantOptions = ref<SelectOption[]>([]);
const platformOptions = ref<SelectOption[]>(MEDIA_PLATFORM_FALLBACKS);
const statusOptions = ref<SelectOption[]>(ENABLED_STATUS_FALLBACKS);
const dialogVisible = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const currentRecord = ref<MediaAccountItem | null>(null);
const submitting = ref(false);

const { items, filters, pagination, loading, fetchList } = useRemoteTable<MediaAccountItem, MediaAccountFilters>(
  { keyword: '', tenantId: '', platform: '', status: '' },
  mediaAccountsApi.listMediaAccounts,
  10
);

const canSelectTenant = computed(() => authStore.isPlatformAdmin);
const currentTenantOption = computed<SelectOption | null>(() => {
  if (!authStore.tenantId) return null;
  return (
    tenantOptions.value.find((item) => item.value === authStore.tenantId) ?? {
      label: authStore.tenantName || '当前租户',
      value: authStore.tenantId
    }
  );
});
const visibleTenantOptions = computed(() => {
  if (canSelectTenant.value) return tenantOptions.value;
  return currentTenantOption.value ? [currentTenantOption.value] : tenantOptions.value;
});
const formInitialData = computed<Partial<MediaAccountFormModel>>(() =>
  currentRecord.value
    ? { ...currentRecord.value, positioning: currentRecord.value.positioning ?? '', remark: currentRecord.value.remark ?? '' }
    : {
        tenantId: authStore.tenantId
      }
);

onMounted(async () => {
  await loadOptions();
  applyDefaultTenantScope();
  await fetchList();
});

async function loadOptions() {
  const [dictMap, tenants] = await Promise.all([
    dictsApi.getDictOptions([DICT_TYPES.mediaPlatform, DICT_TYPES.enabledStatus]),
    tenantsApi.getTenantOptions()
  ]);
  platformOptions.value = dictMap[DICT_TYPES.mediaPlatform]?.length ? dictMap[DICT_TYPES.mediaPlatform] : MEDIA_PLATFORM_FALLBACKS;
  statusOptions.value = dictMap[DICT_TYPES.enabledStatus]?.length ? dictMap[DICT_TYPES.enabledStatus] : ENABLED_STATUS_FALLBACKS;
  tenantOptions.value = tenants;
}

function tenantName(id?: string) {
  return tenantOptions.value.find((item) => item.value === id)?.label || '--';
}

function applyDefaultTenantScope() {
  if (!filters.tenantId && authStore.tenantId) {
    filters.tenantId = authStore.tenantId;
  }
}

async function resetFilters() {
  filters.keyword = '';
  filters.tenantId = authStore.tenantId || '';
  filters.platform = '';
  filters.status = '';
  await fetchList(true);
}

function openCreate() {
  dialogMode.value = 'create';
  currentRecord.value = null;
  dialogVisible.value = true;
}

function openEdit(row: MediaAccountItem) {
  dialogMode.value = 'edit';
  currentRecord.value = row;
  dialogVisible.value = true;
}

async function handleSubmit(payload: MediaAccountFormModel) {
  submitting.value = true;
  try {
    const requestPayload: MediaAccountFormModel = {
      ...payload,
      tenantId: canSelectTenant.value ? payload.tenantId || authStore.tenantId : authStore.tenantId
    };
    if (dialogMode.value === 'create') {
      await mediaAccountsApi.createMediaAccount(requestPayload);
      ElMessage.success('多媒体账号已新增');
    } else if (currentRecord.value) {
      await mediaAccountsApi.updateMediaAccount(currentRecord.value.id, requestPayload);
      ElMessage.success('多媒体账号已更新');
    }
    dialogVisible.value = false;
    await fetchList();
  } finally {
    submitting.value = false;
  }
}

async function toggleStatus(row: MediaAccountItem) {
  const nextStatus = row.status === 'ENABLED' ? 'DISABLED' : 'ENABLED';
  await mediaAccountsApi.updateMediaAccountStatus(row.id, nextStatus);
  ElMessage.success('状态已更新');
  await fetchList();
}

async function handleRemove(row: MediaAccountItem) {
  await ElMessageBox.confirm(`确认删除账号「${row.accountName}」？`, '删除确认', { type: 'warning' });
  await mediaAccountsApi.removeMediaAccount(row.id);
  ElMessage.success('账号已删除');
  await fetchList();
}
</script>
