<template>
  <div class="space-y-4">
    <PageToolbar title="租户管理" description="维护租户基础资料、产品介绍、核心卖点和有效期">
      <el-form :model="filters" class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <el-form-item label="关键词" class="!mb-0">
          <el-input v-model="filters.keyword" placeholder="租户名称 / 行业" clearable @keyup.enter="fetchList(true)" />
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

    <CrudTablePanel title="租户列表" description="租户是账号、多媒体账号和每日任务的数据归属">
      <el-table v-loading="loading" :data="items" row-key="id" stripe>
        <el-table-column type="index" label="#" width="60" />
        <el-table-column prop="name" label="租户名称" min-width="180" />
        <el-table-column prop="industry" label="行业" min-width="140" />
        <el-table-column prop="productIntro" label="产品介绍" min-width="260" show-overflow-tooltip />
        <el-table-column prop="coreSellingPoint" label="核心卖点" min-width="260" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="110">
          <template #default="{ row }">
            <DictTag :value="row.status" :options="statusOptions" />
          </template>
        </el-table-column>
        <el-table-column label="有效期" min-width="220">
          <template #default="{ row }">{{ formatDate(row.startedAt) || '--' }} 至 {{ formatDate(row.expiredAt) || '--' }}</template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link @click="toggleStatus(row)">{{ row.status === 'ACTIVE' ? '禁用' : '激活' }}</el-button>
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

    <TenantFormDialog
      v-model="dialogVisible"
      :mode="dialogMode"
      :initial-data="currentRecord ? { ...currentRecord, remark: currentRecord.remark ?? '' } : undefined"
      :status-options="statusOptions"
      :submitting="submitting"
      @submit="handleSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as tenantsApi from '@/api/modules/tenants';
import * as dictsApi from '@/api/modules/dicts';
import DictTag from '@/components/common/DictTag.vue';
import PageToolbar from '@/components/common/PageToolbar.vue';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import CrudTablePanel from '@/features/crud/components/CrudTablePanel.vue';
import { useRemoteTable } from '@/composables/useRemoteTable';
import { DICT_TYPES } from '@/constants/dictTypes';
import type { TenantItem } from '@/api/modules/tenants';
import type { SelectOption } from '@/utils/apiData';
import { toIsoDateTime } from '@/utils/format';
import { formatDate, formatDateTime } from '@/utils/format';
import TenantFormDialog from './components/TenantFormDialog.vue';
import { TENANT_STATUS_FALLBACKS } from './constants';
import type { TenantFormModel, TenantFilters } from './types';

defineOptions({ name: 'TenantManagementView' });

const statusOptions = ref<SelectOption[]>(TENANT_STATUS_FALLBACKS);
const dialogVisible = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const currentRecord = ref<TenantItem | null>(null);
const submitting = ref(false);

const { items, filters, pagination, loading, fetchList, resetFilters } = useRemoteTable<TenantItem, TenantFilters>(
  { keyword: '', status: '' },
  tenantsApi.listTenants,
  10
);

onMounted(async () => {
  await Promise.all([loadOptions(), fetchList()]);
});

async function loadOptions() {
  const map = await dictsApi.getDictOptions([DICT_TYPES.tenantStatus]);
  statusOptions.value = map[DICT_TYPES.tenantStatus]?.length ? map[DICT_TYPES.tenantStatus] : TENANT_STATUS_FALLBACKS;
}

function openCreate() {
  dialogMode.value = 'create';
  currentRecord.value = null;
  dialogVisible.value = true;
}

function openEdit(row: TenantItem) {
  dialogMode.value = 'edit';
  currentRecord.value = row;
  dialogVisible.value = true;
}

async function handleSubmit(payload: TenantFormModel) {
  submitting.value = true;
  try {
    const data = {
      ...payload,
      startedAt: toIsoDateTime(payload.startedAt),
      expiredAt: toIsoDateTime(payload.expiredAt)
    };
    if (dialogMode.value === 'create') {
      await tenantsApi.createTenant(data as tenantsApi.TenantPayload);
      ElMessage.success('租户已新增');
    } else if (currentRecord.value) {
      await tenantsApi.updateTenant(currentRecord.value.id, data);
      ElMessage.success('租户已更新');
    }
    dialogVisible.value = false;
    await fetchList();
  } finally {
    submitting.value = false;
  }
}

async function toggleStatus(row: TenantItem) {
  const nextStatus = row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
  await tenantsApi.updateTenantStatus(row.id, nextStatus);
  ElMessage.success('状态已更新');
  await fetchList();
}

async function handleRemove(row: TenantItem) {
  await ElMessageBox.confirm(`确认删除租户「${row.name}」？`, '删除确认', { type: 'warning' });
  await tenantsApi.removeTenant(row.id);
  ElMessage.success('租户已删除');
  await fetchList();
}
</script>
