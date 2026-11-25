<template>
  <div class="space-y-4">
    <PageToolbar title="账号管理" description="维护平台账号、租户账号、角色关系和账号状态">
      <el-form :model="filters" class="grid grid-cols-1 gap-4 md:grid-cols-5">
        <el-form-item label="关键词" class="!mb-0">
          <el-input v-model="filters.keyword" placeholder="账号 / 姓名" clearable @keyup.enter="fetchList(true)" />
        </el-form-item>
        <el-form-item label="手机号" class="!mb-0">
          <el-input v-model="filters.phone" placeholder="手机号" clearable @keyup.enter="fetchList(true)" />
        </el-form-item>
        <el-form-item label="租户" class="!mb-0">
          <el-select v-model="filters.tenantId" placeholder="全部租户" filterable clearable>
            <el-option v-for="item in tenantOptions" :key="item.value" :label="item.label" :value="item.value" />
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
        <el-button v-if="can('user:create')" type="primary" @click="openCreate">新增</el-button>
      </template>
    </PageToolbar>

    <CrudTablePanel title="账号列表" description="账号与租户、角色直接关联，删除为软删除">
      <el-table v-loading="loading" :data="items" row-key="id" stripe>
        <el-table-column type="index" label="#" width="60" />
        <el-table-column prop="displayName" label="账号信息" min-width="220">
          <template #default="{ row }">
            <div class="flex items-center gap-3">
              <el-avatar :src="resolveAssetUrl(row.avatarUrl)" :size="38">{{ row.displayName?.slice(0, 1) || row.username?.slice(0, 1) }}</el-avatar>
              <div>
                <div class="font-medium">{{ row.displayName }}</div>
                <div class="text-xs text-slate-500">{{ row.username }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" min-width="140" />
        <el-table-column label="租户" min-width="220">
          <template #default="{ row }">
            <div class="flex flex-wrap gap-1">
              <el-tag v-for="tenant in tenantLabels(row)" :key="tenant" effect="plain">{{ tenant }}</el-tag>
              <span v-if="!tenantLabels(row).length" class="text-slate-400">--</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="角色" min-width="240">
          <template #default="{ row }">
            <div class="flex flex-wrap gap-1">
              <el-tag v-for="role in roleLabels(row)" :key="role" effect="plain">{{ role }}</el-tag>
              <span v-if="!roleLabels(row).length" class="text-slate-400">--</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="110">
          <template #default="{ row }">
            <DictTag :value="row.status" :options="statusOptions" />
          </template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button v-if="can('user:update')" link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="can('user:update')" link @click="openResetPassword(row)">重置密码</el-button>
            <el-button v-if="can('user:update')" link @click="toggleStatus(row)">{{ row.status === 'ENABLED' ? '禁用' : '启用' }}</el-button>
            <el-button v-if="can('user:delete')" link type="danger" @click="handleRemove(row)">删除</el-button>
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

    <AccountFormDialog
      v-model="dialogVisible"
      :mode="dialogMode"
      :initial-data="currentFormData"
      :tenant-options="tenantOptions"
      :role-options="roleOptions"
      :status-options="statusOptions"
      :submitting="submitting"
      @submit="handleSubmit"
    />

    <ResetPasswordDialog v-model="resetDialogVisible" :submitting="submitting" @submit="handleResetPassword" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as dictsApi from '@/api/modules/dicts';
import * as rolesApi from '@/api/modules/roles';
import * as tenantsApi from '@/api/modules/tenants';
import * as usersApi from '@/api/modules/users';
import DictTag from '@/components/common/DictTag.vue';
import PageToolbar from '@/components/common/PageToolbar.vue';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import CrudTablePanel from '@/features/crud/components/CrudTablePanel.vue';
import { useRemoteTable } from '@/composables/useRemoteTable';
import { DICT_TYPES } from '@/constants/dictTypes';
import type { UserItem } from '@/api/modules/users';
import type { SelectOption } from '@/utils/apiData';
import { omitEmpty, isRecord, unwrapData } from '@/utils/apiData';
import { formatDateTime, resolveAssetUrl } from '@/utils/format';
import AccountFormDialog from './components/AccountFormDialog.vue';
import ResetPasswordDialog from './components/ResetPasswordDialog.vue';
import { ACCOUNT_DEFAULT_FORM, USER_STATUS_FALLBACKS } from './constants';
import type { AccountFilters, AccountFormModel } from './types';

defineOptions({ name: 'AccountManagementView' });

const auth = useAuthStore();
function can(permission: string) {
  return auth.isPlatformAdmin || auth.user.permissions.includes(permission);
}
const canManageAccounts = computed(() => can('user:create') || can('user:update'));

const tenantOptions = ref<SelectOption[]>([]);
const roleOptions = ref<SelectOption[]>([]);
const statusOptions = ref<SelectOption[]>(USER_STATUS_FALLBACKS);
const dialogVisible = ref(false);
const resetDialogVisible = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const currentRecord = ref<UserItem | null>(null);
const submitting = ref(false);

const { items, filters, pagination, loading, fetchList, resetFilters } = useRemoteTable<UserItem, AccountFilters>(
  { keyword: '', phone: '', tenantId: '', status: '' },
  usersApi.listUsers,
  10
);

const currentFormData = computed<Partial<AccountFormModel> | undefined>(() => {
  if (!currentRecord.value) return undefined;
  return {
    ...ACCOUNT_DEFAULT_FORM,
    ...currentRecord.value,
    tenantIds: extractTenantIds(currentRecord.value),
    roleIds: extractRoleIds(currentRecord.value),
    password: '',
    avatarUrl: currentRecord.value.avatarUrl ?? '',
    phone: currentRecord.value.phone ?? '',
    remark: currentRecord.value.remark ?? '',
    avatarFileId: currentRecord.value.avatarFileId ?? ''
  };
});

onMounted(async () => {
  await Promise.all([loadOptions(), fetchList()]);
});

async function loadOptions() {
  const [dictMap, tenants, roles] = await Promise.all([
    dictsApi.getDictOptions([DICT_TYPES.userStatus]),
    tenantsApi.getTenantOptions(),
    canManageAccounts.value ? rolesApi.getRoleOptions() : Promise.resolve([] as SelectOption[])
  ]);
  statusOptions.value = dictMap[DICT_TYPES.userStatus]?.length ? dictMap[DICT_TYPES.userStatus] : USER_STATUS_FALLBACKS;
  tenantOptions.value = tenants;
  roleOptions.value = roles;
}

function tenantName(id?: string | null) {
  return tenantOptions.value.find((item) => item.value === id)?.label || '--';
}

function tenantLabels(row: UserItem) {
  const labels = [
    ...(row.tenants ?? []).map((item) => item.name || item.tenantName || tenantName(item.id || item.tenantId)),
    ...extractTenantIds(row).map((id) => tenantName(id))
  ].filter(Boolean);

  return [...new Set(labels)];
}

function roleLabels(row: UserItem) {
  return (row.roles ?? [])
    .map((item) => {
      if (typeof item === 'string') return roleOptions.value.find((role) => role.value === item || role.code === item)?.label || item;
      if (isRecord(item.role)) return String(item.role.name ?? item.role.code ?? '');
      return '';
    })
    .filter(Boolean);
}

function extractRoleIds(row: UserItem) {
  return (row.roles ?? [])
    .map((item) => {
      if (typeof item === 'string') return roleOptions.value.find((role) => role.code === item || role.label === item)?.value || item;
      if (item.role?.id) return item.role.id;
      return item.roleId ?? '';
    })
    .filter(Boolean);
}

function extractTenantIds(row: Partial<UserItem>) {
  const ids = [
    ...(Array.isArray(row.tenantIds) ? row.tenantIds : []),
    ...((row.tenants ?? [])
      .map((item) => item.id || item.tenantId || '')
      .filter(Boolean) as string[]),
    row.tenantId ?? ''
  ].filter(Boolean);

  return [...new Set(ids)];
}

function openCreate() {
  dialogMode.value = 'create';
  currentRecord.value = null;
  dialogVisible.value = true;
}

async function openEdit(row: UserItem) {
  dialogMode.value = 'edit';
  const detailPayload = await usersApi.getUserDetail(row.id).catch(() => null);
  const detail = isRecord(unwrapData(detailPayload)) ? (unwrapData(detailPayload) as Partial<UserItem>) : null;
  currentRecord.value = {
    ...row,
    ...(detail ?? {}),
    tenantIds: detail ? extractTenantIds(detail) : extractTenantIds(row)
  };
  dialogVisible.value = true;
}

function openResetPassword(row: UserItem) {
  currentRecord.value = row;
  resetDialogVisible.value = true;
}

async function handleSubmit(payload: AccountFormModel) {
  submitting.value = true;
  try {
    const body = omitEmpty({
      tenantId: payload.tenantIds[0],
      tenantIds: payload.tenantIds,
      username: payload.username,
      displayName: payload.displayName,
      phone: payload.phone,
      password: payload.password,
      roleIds: payload.roleIds,
      status: payload.status,
      avatarFileId: payload.avatarFileId,
      remark: payload.remark
    });

    if (dialogMode.value === 'create') {
      await usersApi.createUser(body as usersApi.UserPayload);
      ElMessage.success('账号已新增');
    } else if (currentRecord.value) {
      delete body.username;
      delete body.password;
      await usersApi.updateUser(currentRecord.value.id, body);
      ElMessage.success('账号已更新');
    }
    dialogVisible.value = false;
    await fetchList();
  } finally {
    submitting.value = false;
  }
}

async function handleResetPassword(password: string) {
  if (!currentRecord.value) return;
  submitting.value = true;
  try {
    await usersApi.resetUserPassword(currentRecord.value.id, password);
    resetDialogVisible.value = false;
    ElMessage.success('密码已重置');
  } finally {
    submitting.value = false;
  }
}

async function toggleStatus(row: UserItem) {
  const nextStatus = row.status === 'ENABLED' ? 'DISABLED' : 'ENABLED';
  await usersApi.updateUserStatus(row.id, nextStatus);
  ElMessage.success('状态已更新');
  await fetchList();
}

async function handleRemove(row: UserItem) {
  await ElMessageBox.confirm(`确认删除账号「${row.displayName}」？`, '删除确认', { type: 'warning' });
  await usersApi.removeUser(row.id);
  ElMessage.success('账号已删除');
  await fetchList();
}
</script>
