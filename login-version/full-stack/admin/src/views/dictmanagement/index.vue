<template>
  <div class="space-y-4">
    <PageToolbar title="数据字典" description="维护平台、状态、来源、类型等下拉项，业务表只保存 value">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="字典类型" name="types" />
        <el-tab-pane label="字典项" name="items" />
      </el-tabs>

      <template v-if="activeTab === 'types'">
        <el-form :model="typeFilters" class="grid grid-cols-1 gap-4 md:grid-cols-4">
          <el-form-item label="关键词" class="!mb-0">
            <el-input v-model="typeFilters.keyword" placeholder="编码 / 名称" clearable @keyup.enter="fetchTypes(true)" />
          </el-form-item>
          <el-form-item label="状态" class="!mb-0">
            <el-select v-model="typeFilters.status" clearable placeholder="全部状态">
              <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="操作" class="!mb-0">
            <div class="flex gap-2">
              <el-button type="primary" @click="fetchTypes(true)">查询</el-button>
              <el-button @click="resetTypeFilters">重置</el-button>
            </div>
          </el-form-item>
        </el-form>
      </template>

      <template v-else>
        <el-form :model="itemFilters" class="grid grid-cols-1 gap-4 md:grid-cols-5">
          <el-form-item label="类型" class="!mb-0">
            <el-select v-model="itemFilters.typeCode" filterable clearable placeholder="全部类型">
              <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="关键词" class="!mb-0">
            <el-input v-model="itemFilters.keyword" placeholder="文本 / 值" clearable @keyup.enter="fetchItems(true)" />
          </el-form-item>
          <el-form-item label="状态" class="!mb-0">
            <el-select v-model="itemFilters.status" clearable placeholder="全部状态">
              <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="操作" class="!mb-0">
            <div class="flex gap-2">
              <el-button type="primary" @click="fetchItems(true)">查询</el-button>
              <el-button @click="resetItemFilters">重置</el-button>
            </div>
          </el-form-item>
        </el-form>
      </template>

      <template #actions>
        <el-button v-if="activeTab === 'types'" type="primary" @click="openTypeCreate">新增类型</el-button>
        <el-button v-else type="primary" @click="openItemCreate">新增字典项</el-button>
      </template>
    </PageToolbar>

    <CrudTablePanel v-if="activeTab === 'types'" title="字典类型列表">
      <el-table v-loading="typeLoading" :data="typeItems" row-key="id" stripe>
        <el-table-column prop="code" label="类型编码" min-width="190" />
        <el-table-column prop="name" label="类型名称" min-width="160" />
        <el-table-column prop="status" label="状态" width="110">
          <template #default="{ row }"><DictTag :value="row.status" :options="statusOptions" /></template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="240" show-overflow-tooltip />
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openTypeEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="removeType(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <CrudPaginationBar
          :current-page="typePagination.page"
          :page-size="typePagination.pageSize"
          :total="typePagination.total"
          @update:current-page="typePagination.page = $event; fetchTypes()"
          @update:page-size="typePagination.pageSize = $event; fetchTypes(true)"
        />
      </template>
    </CrudTablePanel>

    <CrudTablePanel v-else title="字典项列表">
      <el-table v-loading="itemLoading" :data="itemItems" row-key="id" stripe>
        <el-table-column prop="typeCode" label="类型编码" min-width="170" />
        <el-table-column prop="label" label="显示文本" min-width="150" />
        <el-table-column prop="value" label="选项值" min-width="150" />
        <el-table-column prop="color" label="颜色" width="110">
          <template #default="{ row }"><DictTag :value="row.color || '未配置'" :options="[{ label: row.color || '未配置', value: row.color || '未配置', color: row.color }]" /></template>
        </el-table-column>
        <el-table-column prop="sort" label="排序" width="90" />
        <el-table-column prop="status" label="状态" width="110">
          <template #default="{ row }"><DictTag :value="row.status" :options="statusOptions" /></template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="220" show-overflow-tooltip />
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openItemEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="removeItem(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <CrudPaginationBar
          :current-page="itemPagination.page"
          :page-size="itemPagination.pageSize"
          :total="itemPagination.total"
          @update:current-page="itemPagination.page = $event; fetchItems()"
          @update:page-size="itemPagination.pageSize = $event; fetchItems(true)"
        />
      </template>
    </CrudTablePanel>

    <DictTypeDialog
      v-model="typeDialogVisible"
      :mode="typeDialogMode"
      :initial-data="currentType ? { ...currentType, remark: currentType.remark ?? '' } : undefined"
      :status-options="statusOptions"
      :submitting="submitting"
      @submit="submitType"
    />

    <DictItemDialog
      v-model="itemDialogVisible"
      :mode="itemDialogMode"
      :initial-data="currentItem ? { ...currentItem, color: currentItem.color ?? '', remark: currentItem.remark ?? '' } : undefined"
      :type-options="typeOptions"
      :status-options="statusOptions"
      :submitting="submitting"
      @submit="submitItem"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as dictsApi from '@/api/modules/dicts';
import DictTag from '@/components/common/DictTag.vue';
import PageToolbar from '@/components/common/PageToolbar.vue';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import CrudTablePanel from '@/features/crud/components/CrudTablePanel.vue';
import { useRemoteTable } from '@/composables/useRemoteTable';
import { DICT_TYPES } from '@/constants/dictTypes';
import type { DictItem, DictTypeItem } from '@/api/modules/dicts';
import type { SelectOption } from '@/utils/apiData';
import { omitEmpty } from '@/utils/apiData';
import DictItemDialog from './components/DictItemDialog.vue';
import DictTypeDialog from './components/DictTypeDialog.vue';
import { DICT_ITEM_DEFAULT_FORM, DICT_TYPE_DEFAULT_FORM, ENABLED_STATUS_FALLBACKS } from './constants';
import type { DictItemFilters, DictItemFormModel, DictTypeFilters, DictTypeFormModel } from './types';

defineOptions({ name: 'DictManagementView' });

const activeTab = ref<'types' | 'items'>('types');
const statusOptions = ref<SelectOption[]>(ENABLED_STATUS_FALLBACKS);
const typeDialogVisible = ref(false);
const itemDialogVisible = ref(false);
const typeDialogMode = ref<'create' | 'edit'>('create');
const itemDialogMode = ref<'create' | 'edit'>('create');
const currentType = ref<DictTypeItem | null>(null);
const currentItem = ref<DictItem | null>(null);
const submitting = ref(false);

const {
  items: typeItems,
  filters: typeFilters,
  pagination: typePagination,
  loading: typeLoading,
  fetchList: fetchTypes,
  resetFilters: resetTypeFilters
} = useRemoteTable<DictTypeItem, DictTypeFilters>({ keyword: '', status: '' }, dictsApi.listDictTypes, 10);

const {
  items: itemItems,
  filters: itemFilters,
  pagination: itemPagination,
  loading: itemLoading,
  fetchList: fetchItems,
  resetFilters: resetItemFilters
} = useRemoteTable<DictItem, DictItemFilters>({ typeCode: '', keyword: '', status: '' }, dictsApi.listDictItems, 10);

const typeOptions = computed<SelectOption[]>(() =>
  typeItems.value.map((item) => ({ label: `${item.name}（${item.code}）`, value: item.code }))
);

watch(activeTab, (tab) => {
  if (tab === 'items') fetchItems(true);
});

onMounted(async () => {
  await Promise.all([loadOptions(), fetchTypes()]);
});

async function loadOptions() {
  const map = await dictsApi.getDictOptions([DICT_TYPES.enabledStatus]);
  statusOptions.value = map[DICT_TYPES.enabledStatus]?.length ? map[DICT_TYPES.enabledStatus] : ENABLED_STATUS_FALLBACKS;
}

function openTypeCreate() {
  typeDialogMode.value = 'create';
  currentType.value = { ...DICT_TYPE_DEFAULT_FORM } as DictTypeItem;
  typeDialogVisible.value = true;
}

function openTypeEdit(row: DictTypeItem) {
  typeDialogMode.value = 'edit';
  currentType.value = row;
  typeDialogVisible.value = true;
}

function openItemCreate() {
  itemDialogMode.value = 'create';
  currentItem.value = { ...DICT_ITEM_DEFAULT_FORM, typeCode: itemFilters.typeCode } as DictItem;
  itemDialogVisible.value = true;
}

function openItemEdit(row: DictItem) {
  itemDialogMode.value = 'edit';
  currentItem.value = row;
  itemDialogVisible.value = true;
}

async function submitType(payload: DictTypeFormModel) {
  submitting.value = true;
  try {
    if (typeDialogMode.value === 'create') {
      await dictsApi.createDictType(payload);
      ElMessage.success('字典类型已新增');
    } else if (currentType.value) {
      const body = omitEmpty({ name: payload.name, status: payload.status, remark: payload.remark });
      await dictsApi.updateDictType(currentType.value.id, body);
      ElMessage.success('字典类型已更新');
    }
    typeDialogVisible.value = false;
    await fetchTypes();
  } finally {
    submitting.value = false;
  }
}

async function submitItem(payload: DictItemFormModel) {
  submitting.value = true;
  try {
    const body = omitEmpty(payload);
    if (itemDialogMode.value === 'create') {
      await dictsApi.createDictItem(body);
      ElMessage.success('字典项已新增');
    } else if (currentItem.value) {
      delete body.typeCode;
      await dictsApi.updateDictItem(currentItem.value.id, body);
      ElMessage.success('字典项已更新');
    }
    itemDialogVisible.value = false;
    await fetchItems();
  } finally {
    submitting.value = false;
  }
}

async function removeType(row: DictTypeItem) {
  await ElMessageBox.confirm(`确认删除字典类型「${row.name}」？`, '删除确认', { type: 'warning' });
  await dictsApi.removeDictType(row.id);
  ElMessage.success('字典类型已删除');
  await fetchTypes();
}

async function removeItem(row: DictItem) {
  await ElMessageBox.confirm(`确认删除字典项「${row.label}」？`, '删除确认', { type: 'warning' });
  await dictsApi.removeDictItem(row.id);
  ElMessage.success('字典项已删除');
  await fetchItems();
}
</script>
