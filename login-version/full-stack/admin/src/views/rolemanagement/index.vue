<template>
  <div class="space-y-4">
    <PageToolbar title="角色管理" description="角色绑定权限后，再分配给账号">
      <el-form :model="filters" class="grid grid-cols-1 gap-4 md:grid-cols-4">
        <el-form-item label="关键词" class="!mb-0">
          <el-input v-model="filters.keyword" placeholder="角色名称 / 编码" clearable @keyup.enter="fetchList(true)" />
        </el-form-item>
        <el-form-item label="范围" class="!mb-0">
          <el-select v-model="filters.scope" placeholder="全部范围" clearable>
            <el-option v-for="item in scopeOptions" :key="item.value" :label="item.label" :value="item.value" />
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
        <el-button v-if="can('role:create')" type="primary" @click="openCreate">新增</el-button>
      </template>
    </PageToolbar>

    <CrudTablePanel title="角色列表" description="平台角色通常面向运营人员，租户角色面向租户成员">
      <el-table v-loading="loading" :data="items" row-key="id" stripe>
        <el-table-column type="index" label="#" width="60" />
        <el-table-column prop="code" label="角色编码" min-width="160" />
        <el-table-column prop="name" label="角色名称" min-width="150" />
        <el-table-column prop="scope" label="范围" width="120">
          <template #default="{ row }">{{ scopeLabel(row.scope) }}</template>
        </el-table-column>
        <el-table-column label="权限数量" width="110">
          <template #default="{ row }">{{ row.permissions?.length || 0 }}</template>
        </el-table-column>
        <el-table-column prop="description" label="说明" min-width="220" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="110">
          <template #default="{ row }">
            <DictTag :value="row.status" :options="statusOptions" />
          </template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button v-if="can('role:update')" link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="can('role:update')" link @click="toggleStatus(row)">{{ row.status === 'ENABLED' ? '禁用' : '启用' }}</el-button>
            <el-button v-if="can('role:delete')" link type="danger" @click="handleRemove(row)">删除</el-button>
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

    <RoleFormDialog
      v-model="dialogVisible"
      :mode="dialogMode"
      :initial-data="currentFormData"
      :permission-tree="permissionTree"
      :status-options="statusOptions"
      :submitting="submitting"
      @submit="handleSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as dictsApi from '@/api/modules/dicts';
import * as permissionsApi from '@/api/modules/permissions';
import * as rolesApi from '@/api/modules/roles';
import DictTag from '@/components/common/DictTag.vue';
import PageToolbar from '@/components/common/PageToolbar.vue';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import CrudTablePanel from '@/features/crud/components/CrudTablePanel.vue';
import { useRemoteTable } from '@/composables/useRemoteTable';
import { useAuthStore } from '@/stores/auth';
import { DICT_TYPES } from '@/constants/dictTypes';
import type { PermissionItem } from '@/api/modules/permissions';
import type { RoleItem } from '@/api/modules/roles';
import type { SelectOption } from '@/utils/apiData';
import { formatDateTime } from '@/utils/format';
import RoleFormDialog from './components/RoleFormDialog.vue';
import { ROLE_DEFAULT_FORM, ROLE_SCOPE_OPTIONS, ROLE_STATUS_FALLBACKS } from './constants';
import type { RoleFilters, RoleFormModel } from './types';

defineOptions({ name: 'RoleManagementView' });

const auth = useAuthStore();
function can(permission: string) {
  return auth.isPlatformAdmin || auth.user.permissions.includes(permission);
}

const scopeOptions = ROLE_SCOPE_OPTIONS;
const statusOptions = ref<SelectOption[]>(ROLE_STATUS_FALLBACKS);
const permissionTree = ref<PermissionItem[]>([]);
const dialogVisible = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const currentRecord = ref<RoleItem | null>(null);
const submitting = ref(false);

const { items, filters, pagination, loading, fetchList, resetFilters } = useRemoteTable<RoleItem, RoleFilters>(
  { keyword: '', scope: '', status: '' },
  rolesApi.listRoles,
  10
);

const currentFormData = computed<Partial<RoleFormModel> | undefined>(() => {
  if (!currentRecord.value) return undefined;
  return {
    ...ROLE_DEFAULT_FORM,
    ...currentRecord.value,
    description: currentRecord.value.description ?? '',
    remark: currentRecord.value.remark ?? '',
    permissionIds: (currentRecord.value.permissions ?? [])
      .map((item) => item.permission?.id || item.permissionId || '')
      .filter(Boolean)
  };
});

onMounted(async () => {
  await Promise.all([loadOptions(), fetchList()]);
});

async function loadOptions() {
  const [dictMap, tree] = await Promise.all([
    dictsApi.getDictOptions([DICT_TYPES.roleStatus]),
    permissionsApi.getPermissionTree()
  ]);
  statusOptions.value = dictMap[DICT_TYPES.roleStatus]?.length ? dictMap[DICT_TYPES.roleStatus] : ROLE_STATUS_FALLBACKS;
  permissionTree.value = tree;
}

function scopeLabel(value: string) {
  return scopeOptions.find((item) => item.value === value)?.label || value;
}

function openCreate() {
  dialogMode.value = 'create';
  currentRecord.value = null;
  dialogVisible.value = true;
}

function openEdit(row: RoleItem) {
  dialogMode.value = 'edit';
  currentRecord.value = row;
  dialogVisible.value = true;
}

async function handleSubmit(payload: RoleFormModel) {
  submitting.value = true;
  try {
    if (dialogMode.value === 'create') {
      await rolesApi.createRole(payload);
      ElMessage.success('角色已新增');
    } else if (currentRecord.value) {
      await rolesApi.updateRole(currentRecord.value.id, payload);
      ElMessage.success('角色已更新');
    }
    dialogVisible.value = false;
    await fetchList();
  } finally {
    submitting.value = false;
  }
}

async function toggleStatus(row: RoleItem) {
  const nextStatus = row.status === 'ENABLED' ? 'DISABLED' : 'ENABLED';
  await rolesApi.updateRoleStatus(row.id, nextStatus);
  ElMessage.success('状态已更新');
  await fetchList();
}

async function handleRemove(row: RoleItem) {
  await ElMessageBox.confirm(`确认删除角色「${row.name}」？`, '删除确认', { type: 'warning' });
  await rolesApi.removeRole(row.id);
  ElMessage.success('角色已删除');
  await fetchList();
}
</script>
