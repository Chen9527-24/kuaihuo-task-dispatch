<template>
  <div class="space-y-4">
    <PageToolbar title="权限管理" description="仅维护三层结构：顶级目录 → 菜单 → 按钮；角色授权使用同一棵树">
      <el-form :model="filters" class="grid grid-cols-1 gap-4 md:grid-cols-4">
        <el-form-item label="关键词" class="!mb-0">
          <el-input v-model="filters.keyword" placeholder="权限名称 / 编码" clearable />
        </el-form-item>
        <el-form-item label="类型" class="!mb-0">
          <el-select v-model="filters.type" placeholder="全部类型" clearable>
            <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态" class="!mb-0">
          <el-select v-model="filters.status" placeholder="全部状态" clearable>
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作" class="!mb-0">
          <div class="flex gap-2">
            <el-button type="primary" @click="refreshTree">查询</el-button>
            <el-button @click="resetFilters">重置</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #actions>
        <el-button v-if="can('permission:create')" type="primary" @click="openCreate">新增目录/菜单/按钮</el-button>
      </template>
    </PageToolbar>

    <CrudTablePanel title="权限树" description="无分页展示。默认仅展开“运营业务”；目录和菜单可展开查看下级权限。">
      <el-tree
        :key="treeVersion"
        v-loading="loading"
        :data="filteredTree"
        node-key="id"
        :default-expanded-keys="defaultExpandedKeys"
        :expand-on-click-node="false"
        :props="{ label: 'name', children: 'children' }"
        class="permission-tree"
      >
        <template #default="{ data }">
          <div class="flex min-w-0 flex-1 items-center gap-2 py-1">
            <el-tag size="small" effect="plain" :type="typeTagType(data.type)">{{ typeLabel(data.type) }}</el-tag>
            <span class="truncate font-medium">{{ data.name }}</span>
            <span class="hidden truncate text-xs text-slate-400 md:inline">{{ data.code }}</span>
            <DictTag :value="data.status" :options="statusOptions" class="ml-1" />
            <span v-if="data.type === 'MENU' && data.routePath" class="hidden text-xs text-slate-400 xl:inline">{{ data.routePath }}</span>
            <span class="ml-auto shrink-0 whitespace-nowrap">
              <el-button v-if="can('permission:update')" link type="primary" @click.stop="openEdit(data)">编辑</el-button>
              <el-button v-if="can('permission:update')" link @click.stop="toggleStatus(data)">{{ data.status === 'ENABLED' ? '关闭' : '开启' }}</el-button>
              <el-button v-if="can('permission:delete')" link type="danger" @click.stop="handleRemove(data)">删除</el-button>
            </span>
          </div>
        </template>
      </el-tree>
      <el-empty v-if="!loading && !filteredTree.length" description="没有匹配的权限节点" :image-size="72" />
    </CrudTablePanel>

    <PermissionFormDialog
      v-model="dialogVisible"
      :mode="dialogMode"
      :initial-data="currentFormData"
      :permission-tree="permissionTree"
      :type-options="typeOptions"
      :status-options="statusOptions"
      :submitting="submitting"
      @submit="handleSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as dictsApi from '@/api/modules/dicts';
import * as permissionsApi from '@/api/modules/permissions';
import DictTag from '@/components/common/DictTag.vue';
import PageToolbar from '@/components/common/PageToolbar.vue';
import CrudTablePanel from '@/features/crud/components/CrudTablePanel.vue';
import { DICT_TYPES } from '@/constants/dictTypes';
import { useAuthStore } from '@/stores/auth';
import type { PermissionItem } from '@/api/modules/permissions';
import type { SelectOption } from '@/utils/apiData';
import { omitEmpty } from '@/utils/apiData';
import PermissionFormDialog from './components/PermissionFormDialog.vue';
import { PERMISSION_DEFAULT_FORM, PERMISSION_STATUS_FALLBACKS, PERMISSION_TYPE_FALLBACKS } from './constants';
import type { PermissionFilters, PermissionFormModel } from './types';

defineOptions({ name: 'PermissionManagementView' });

const auth = useAuthStore();
const typeOptions = ref<SelectOption[]>(PERMISSION_TYPE_FALLBACKS);
const statusOptions = ref<SelectOption[]>(PERMISSION_STATUS_FALLBACKS);
const permissionTree = ref<PermissionItem[]>([]);
const loading = ref(false);
const treeVersion = ref(0);
const filters = reactive<PermissionFilters>({ keyword: '', type: '', status: '' });
const dialogVisible = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const currentRecord = ref<PermissionItem | null>(null);
const submitting = ref(false);

const defaultExpandedKeys = computed(() => permissionTree.value.filter((item) => item.code === 'directory:operation').map((item) => item.id));
const currentFormData = computed<Partial<PermissionFormModel> | undefined>(() =>
  currentRecord.value ? {
    ...PERMISSION_DEFAULT_FORM,
    ...currentRecord.value,
    parentId: currentRecord.value.parentId ?? '',
    group: currentRecord.value.group ?? '',
    routePath: currentRecord.value.routePath ?? '',
    component: currentRecord.value.component ?? '',
    icon: currentRecord.value.icon ?? '',
    remark: currentRecord.value.remark ?? ''
  } : undefined
);
const filteredTree = computed(() => filterTree(permissionTree.value, filters));

onMounted(async () => {
  await Promise.all([loadOptions(), refreshTree()]);
});

function can(permission: string) {
  return auth.isPlatformAdmin || auth.user.permissions.includes(permission);
}

async function loadOptions() {
  const dictMap = await dictsApi.getDictOptions([DICT_TYPES.permissionType, DICT_TYPES.permissionValidationStatus]);
  typeOptions.value = dictMap[DICT_TYPES.permissionType]?.length ? dictMap[DICT_TYPES.permissionType] : PERMISSION_TYPE_FALLBACKS;
  statusOptions.value = dictMap[DICT_TYPES.permissionValidationStatus]?.length ? dictMap[DICT_TYPES.permissionValidationStatus] : PERMISSION_STATUS_FALLBACKS;
}

async function refreshTree() {
  loading.value = true;
  try {
    permissionTree.value = await permissionsApi.getPermissionTree({ includeDisabled: true });
    treeVersion.value += 1;
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  filters.keyword = '';
  filters.type = '';
  filters.status = '';
}

function openCreate() {
  dialogMode.value = 'create';
  currentRecord.value = null;
  dialogVisible.value = true;
}

function openEdit(row: PermissionItem) {
  dialogMode.value = 'edit';
  currentRecord.value = row;
  dialogVisible.value = true;
}

async function handleSubmit(payload: PermissionFormModel) {
  submitting.value = true;
  try {
    const normalized: PermissionFormModel = {
      ...payload,
      parentId: payload.type === 'DIRECTORY' ? '' : payload.parentId,
      routePath: payload.type === 'MENU' ? payload.routePath : '',
      component: payload.type === 'MENU' ? payload.component : '',
      icon: payload.type === 'MENU' || payload.type === 'DIRECTORY' ? payload.icon : ''
    };
    if (dialogMode.value === 'create') {
      const body = omitEmpty({ ...normalized, parentId: normalized.parentId || undefined });
      await permissionsApi.createPermission(body as permissionsApi.PermissionPayload);
      ElMessage.success('权限已新增');
    } else if (currentRecord.value) {
      const body: Partial<permissionsApi.PermissionPayload> = omitEmpty(normalized);
      body.parentId = normalized.parentId || null;
      delete body.code;
      await permissionsApi.updatePermission(currentRecord.value.id, body);
      ElMessage.success('权限已更新');
    }
    dialogVisible.value = false;
    await refreshTree();
  } finally {
    submitting.value = false;
  }
}

async function toggleStatus(row: PermissionItem) {
  const nextStatus = row.status === 'ENABLED' ? 'DISABLED' : 'ENABLED';
  await permissionsApi.updatePermissionStatus(row.id, nextStatus);
  ElMessage.success('状态已更新');
  await refreshTree();
}

async function handleRemove(row: PermissionItem) {
  await ElMessageBox.confirm(`确认删除权限「${row.name}」？有下级节点时不可删除。`, '删除确认', { type: 'warning' });
  await permissionsApi.removePermission(row.id);
  ElMessage.success('权限已删除');
  await refreshTree();
}

function filterTree(nodes: PermissionItem[], query: PermissionFilters): PermissionItem[] {
  const keyword = query.keyword.trim().toLowerCase();
  return nodes.flatMap((node) => {
    const children = filterTree(node.children ?? [], query);
    const selfMatch =
      (!keyword || `${node.name} ${node.code}`.toLowerCase().includes(keyword)) &&
      (!query.type || node.type === query.type) &&
      (!query.status || node.status === query.status);
    if (!selfMatch && !children.length) return [];
    return [{ ...node, children }];
  });
}

function typeLabel(type: string) {
  return typeOptions.value.find((item) => item.value === type)?.label || type;
}

function typeTagType(type: string) {
  if (type === 'DIRECTORY') return 'success';
  if (type === 'MENU') return 'primary';
  return 'info';
}
</script>

<style scoped>
.permission-tree :deep(.el-tree-node__content) {
  height: auto;
  min-height: 38px;
  padding-right: 12px;
}
</style>
