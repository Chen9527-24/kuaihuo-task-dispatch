<template>
  <div class="space-y-4">
    <PageToolbar title="每日任务" description="配置视频任务、推流和参与进度">
      <el-form :model="filters" class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-7">
        <el-form-item label="关键词" class="!mb-0">
          <el-input v-model="filters.keyword" placeholder="任务标题" clearable @keyup.enter="fetchList(true)" />
        </el-form-item>
        <el-form-item label="租户" class="!mb-0">
          <el-select v-model="filters.tenantId" placeholder="全部租户" filterable clearable @change="handleTenantFilterChange">
            <el-option v-for="item in tenantOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属团队" class="!mb-0">
          <el-select
            v-model="filters.distributionGroupId"
            placeholder="请先选择租户"
            filterable
            clearable
            :disabled="!filters.tenantId"
            :loading="filterGroupLoading"
            @visible-change="handleFilterGroupVisible"
          >
            <el-option v-for="item in filterGroupOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="平台" class="!mb-0">
          <el-select v-model="filters.platform" placeholder="全部平台" clearable>
            <el-option v-for="item in platformOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态" class="!mb-0">
          <el-select v-model="filters.status" placeholder="全部状态" clearable>
            <el-option v-for="item in taskStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作" class="!mb-0">
          <div class="flex gap-2">
            <el-button type="primary" @click="fetchList(true)">查询</el-button>
            <el-button @click="handleResetFilters">重置</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #actions>
        <el-button v-if="can('daily-task:create')" type="primary" @click="openCreate">新增</el-button>
      </template>
    </PageToolbar>

    <section class="grid grid-cols-1 gap-4 md:grid-cols-5">
      <article class="panel-surface p-5 shadow-panel">
        <div class="text-sm text-slate-500">当前筛选总数</div>
        <div class="mt-2 text-2xl font-semibold">{{ pagination.total }}</div>
      </article>
      <article class="panel-surface p-5 shadow-panel">
        <div class="text-sm text-slate-500">本页待发布</div>
        <div class="mt-2 text-2xl font-semibold">{{ countByStatus('READY') }}</div>
      </article>
      <article class="panel-surface p-5 shadow-panel">
        <div class="text-sm text-slate-500">本页已推流</div>
        <div class="mt-2 text-2xl font-semibold">{{ countByStatus('DISPATCHED') }}</div>
      </article>
      <article class="panel-surface p-5 shadow-panel">
        <div class="text-sm text-slate-500">本页已完成</div>
        <div class="mt-2 text-2xl font-semibold">{{ countByStatus('COMPLETED') }}</div>
      </article>
      <article class="panel-surface p-5 shadow-panel">
        <div class="text-sm text-slate-500">本页待结算</div>
        <div class="mt-2 text-2xl font-semibold">{{ pendingSettlementTotal }}</div>
      </article>
    </section>

    <CrudTablePanel title="每日任务列表" description="任务关联租户、多媒体账号、平台和评论配置">
      <el-table v-loading="loading" :data="items" row-key="id" stripe class="daily-task-table">
        <el-table-column type="index" label="#" width="60" fixed="left" />
        <el-table-column label="任务信息" min-width="380" fixed="left" class-name="task-info-column">
          <template #default="{ row }">
            <div class="task-info-card">
              <el-image
                v-if="row.coverUrl"
                :src="resolveAssetUrl(row.coverUrl)"
                class="task-cover-image"
                fit="cover"
                lazy
                :preview-src-list="[resolveAssetUrl(row.coverUrl)]"
                :preview-teleported="true"
              />
              <div v-else class="task-cover-placeholder">无封面</div>

              <div class="task-info-main">
                <div class="task-info-heading">
                  <el-badge v-if="pendingSettlementCount(row) > 0" :value="pendingSettlementCount(row)" :max="99" type="warning" class="task-settlement-badge">
                    <el-button v-if="can('daily-task:order:read')" plain size="small" type="warning" class="task-settlement-button" @click="openPendingSettlementOrders(row)">待结算</el-button>
                  </el-badge>
                  <div class="task-title-wrap">
                    <el-tooltip :content="row.title || '--'" placement="top-start" :show-after="300">
                      <div class="task-info-title">{{ row.title || '--' }}</div>
                    </el-tooltip>
                  </div>
                  <el-tag v-if="row.testBatchId" type="warning" effect="plain" size="small" class="task-test-tag">测试批次</el-tag>
                  <el-tag v-else-if="row.isTestData" type="info" effect="plain" size="small" class="task-test-tag">旧测试标记</el-tag>
                </div>

                <div class="task-info-meta">
                  <DictTag :value="row.platform" :options="platformOptions" />
                  <a v-if="primaryWebVideoUrl(row)" :href="primaryWebVideoUrl(row)" target="_blank" rel="noopener noreferrer" class="task-video-link">查看作品</a>
                  <span v-else class="task-video-empty">未配置作品链接</span>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="账号" min-width="170">
          <template #default="{ row }">{{ row.mediaAccount?.accountName || '--' }}</template>
        </el-table-column>
        <el-table-column label="租户" min-width="150">
          <template #default="{ row }">{{ row.tenant?.name || tenantName(row.tenantId) }}</template>
        </el-table-column>
        <el-table-column label="可见范围" min-width="140">
          <template #default="{ row }">
            <el-tag v-if="row.distributionScope === 'GROUP'" type="success">指定团队</el-tag>
            <el-tag v-else>全租户开放</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="所属团队" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <template v-if="row.distributionGroupId">
              <span>{{ row.leaderGroup?.name || '团队档案已删除' }}</span>
              <el-tag v-if="row.leaderGroup && String(row.leaderGroup.status || '').toUpperCase() !== 'ENABLED'" type="info" size="small" class="ml-2">
                {{ formatLeaderGroupStatus(row.leaderGroup.status) }}
              </el-tag>
            </template>
            <span v-else class="text-slate-400">--</span>
          </template>
        </el-table-column>
        <el-table-column label="成员实际收益" min-width="148">
          <template #default="{ row }">
            <div class="money-cell">
              <strong>{{ formatCurrencyFromCent(row.rewardAmount) }}</strong>
              <small v-if="row.commissionEnabled">
                {{ row.commissionMode === 'INCLUDED' ? '团队佣金内含' : '团队佣金另计' }} · {{ formatCurrencyFromCent(row.commissionAmount) }}
              </small>
              <small v-else>未启用团队佣金</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="评论进度" min-width="180">
          <template #default="{ row }">
            <button v-if="can('daily-task:progress:read')" type="button" class="w-full text-left" @click="openProgress(row)">
              <div class="text-sm">{{ row.claimedCommentCount || 0 }} / {{ resolveDisplayCommentTotal(row) }}</div>
              <el-progress :percentage="progressPercent(row)" :stroke-width="8" />
            </button>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="120">
          <template #default="{ row }"><DictTag :value="row.status" :options="taskStatusOptions" /></template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" width="180" class-name="updated-at-cell" show-overflow-tooltip>
          <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="475" fixed="right" class-name="operation-cell">
          <template #default="{ row }">
            <el-button v-if="can('daily-task:update')" link type="primary" :disabled="isTaskContentLocked(row)" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="can('daily-task:comment:read')" link type="warning" :disabled="isTaskContentLocked(row)" @click="openCommentsDrawer(row)">评论配置</el-button>
            <el-button v-if="can('daily-task:order:read')" link type="info" @click="openOrdersDrawer(row)">订单列表</el-button>
            <el-button v-if="can('daily-task:dispatch') && ['DRAFT', 'READY'].includes(row.status)" link type="success" :loading="publishingId === row.id" @click="publishTask(row)">发布</el-button>
            <el-button v-if="can('daily-task:dispatch') && ['DISPATCHED', 'RUNNING'].includes(row.status)" link type="success" @click="openDispatchDialog(row)">派发链接</el-button>
            <el-button v-if="can('daily-task:update') && ['READY', 'DISPATCHED', 'RUNNING'].includes(row.status)" link type="warning" @click="pauseTask(row)">暂停</el-button>
            <el-button v-if="can('daily-task:update') && row.status === 'PAUSED'" link type="success" @click="resumeTask(row)">恢复</el-button>
            <el-button v-if="can('daily-task:update') && ['READY', 'DISPATCHED', 'RUNNING', 'PAUSED'].includes(row.status)" link type="warning" @click="closeTask(row)">关闭</el-button>
            <el-button v-if="can('daily-task:update') && ['CLOSED', 'COMPLETED', 'DISABLED', 'CANCELLED'].includes(row.status)" link type="info" @click="archiveTask(row)">归档</el-button>
            <el-button v-if="can('daily-task:delete') && !row.testBatchId && !hasClaims(row)" link type="danger" @click="handleRemove(row)">删除</el-button>
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

    <DailyTaskFormDialog
      v-model="dialogVisible"
      :mode="dialogMode"
      :task-id="currentRecord?.id != null ? String(currentRecord.id) : undefined"
      :initial-data="currentFormData"
      :tenant-options="tenantOptions"
      :platform-options="platformOptions"
      :status-options="taskStatusOptions"
      :media-account-options="mediaAccountOptions"
      :group-options="groupOptions"
      :account-loading="accountLoading"
      :group-loading="groupLoading"
      :submitting="submitting"
      @dependency-change="loadMediaAccountOptions"
      @submit="handleSubmit"
    />

    <TaskProgressDrawer
      v-model="progressDrawerVisible"
      :task-id="currentRecord?.id != null ? String(currentRecord.id) : undefined"
      :comment-status-options="commentStatusOptions"
    />

    <TaskCommentsDrawer
      v-model="commentsDrawerVisible"
      :task-id="currentRecord?.id != null ? String(currentRecord.id) : undefined"
      :comment-status-options="commentStatusOptions"
      :source-options="commentSourceOptions"
      @changed="fetchList()"
    />

    <TaskOrdersDrawer
      v-model="ordersDrawerVisible"
      :task-id="currentRecord?.id != null ? String(currentRecord.id) : undefined"
      :filter-preset="ordersDrawerFilterPreset"
      @changed="fetchList()"
    />
    <TaskDispatchDialog v-model="dispatchDialogVisible" :record="currentRecord" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as dailyTasksApi from '@/api/modules/dailyTasks';
import * as dictsApi from '@/api/modules/dicts';
import * as mediaAccountsApi from '@/api/modules/mediaAccounts';
import * as groupsApi from '@/api/modules/distributionGroups';
import * as tenantsApi from '@/api/modules/tenants';
import DictTag from '@/components/common/DictTag.vue';
import PageToolbar from '@/components/common/PageToolbar.vue';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import CrudTablePanel from '@/features/crud/components/CrudTablePanel.vue';
import { useRemoteTable } from '@/composables/useRemoteTable';
import { useAuthStore } from '@/stores/auth';
import { DICT_TYPES } from '@/constants/dictTypes';
import type { DailyTaskItem } from '@/api/modules/dailyTasks';
import type { SelectOption } from '@/utils/apiData';
import { omitEmpty } from '@/utils/apiData';
import { formatDateTime, resolveAssetUrl } from '@/utils/format';
import DailyTaskFormDialog, { type LeaderGroupOption } from './components/DailyTaskFormDialog.vue';
import TaskCommentsDrawer from './components/TaskCommentsDrawer.vue';
import TaskDispatchDialog from './components/TaskDispatchDialog.vue';
import TaskOrdersDrawer from './components/TaskOrdersDrawer.vue';
import TaskProgressDrawer from './components/TaskProgressDrawer.vue';
import {
  COMMENT_SOURCE_FALLBACKS,
  DAILY_TASK_DEFAULT_FORM,
  DAILY_TASK_STATUS_FALLBACKS,
  MEDIA_PLATFORM_FALLBACKS,
  TASK_COMMENT_STATUS_FALLBACKS
} from './constants';
import type { DailyTaskFilters, DailyTaskFormModel } from './types';

defineOptions({ name: 'DailyTaskManagementView' });

const auth = useAuthStore();
function can(permission: string) {
  return auth.isPlatformAdmin || auth.user.permissions.includes(permission);
}

const tenantOptions = ref<SelectOption[]>([]);
const platformOptions = ref<SelectOption[]>(MEDIA_PLATFORM_FALLBACKS);
const taskStatusOptions = ref<SelectOption[]>(DAILY_TASK_STATUS_FALLBACKS);
const commentStatusOptions = ref<SelectOption[]>(TASK_COMMENT_STATUS_FALLBACKS);
const commentSourceOptions = ref<SelectOption[]>(COMMENT_SOURCE_FALLBACKS);
const mediaAccountOptions = ref<SelectOption[]>([]);
const groupOptions = ref<LeaderGroupOption[]>([]);
/** 每日任务列表筛选用团长，包含已停用/已删除档案，保证历史任务仍可定位。 */
const filterGroupOptions = ref<SelectOption[]>([]);
const accountLoading = ref(false);
const groupLoading = ref(false);
const filterGroupLoading = ref(false);

const dialogVisible = ref(false);
const progressDrawerVisible = ref(false);
const commentsDrawerVisible = ref(false);
const dispatchDialogVisible = ref(false);
const publishingId = ref('');
const ordersDrawerVisible = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const currentRecord = ref<DailyTaskItem | null>(null);
const ordersDrawerFilterPreset = ref<'pending-settlement' | undefined>();
const submitting = ref(false);

const { items, filters, pagination, loading, fetchList, resetFilters } = useRemoteTable<DailyTaskItem, DailyTaskFilters>(
  { keyword: '', tenantId: '', platform: '', distributionGroupId: '', status: '', isTestData: '', testBatchId: '', ids: '' },
  dailyTasksApi.listDailyTasks,
  10
);

const currentFormData = computed<Partial<DailyTaskFormModel> | undefined>(() => {
  if (!currentRecord.value) return undefined;
  const { primaryVideoUrl, backupVideoUrls } = resolveFormVideoLinks(currentRecord.value);
  const commentItems =
    (Array.isArray(currentRecord.value.comment) ? currentRecord.value.comment : currentRecord.value.comments ?? [])
      .map((item) => {
        if (typeof item === 'string') return String(item).trim();
        if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') return item.text.trim();
        if (item && typeof item === 'object' && 'content' in item && typeof item.content === 'string') return item.content.trim();
        return '';
      })
      .filter(Boolean)
      .map((text) => ({ text }));

  return {
    ...DAILY_TASK_DEFAULT_FORM,
    tenantId: normalizeStringValue(currentRecord.value.tenantId),
    mediaAccountId: normalizeStringValue(currentRecord.value.mediaAccountId),
    platform: normalizeStringValue(currentRecord.value.platform),
    title: normalizeStringValue(currentRecord.value.title),
    videoUrl: primaryVideoUrl,
    coverUrl: normalizeStringValue(currentRecord.value.coverUrl),
    coverFileId: normalizeStringValue(currentRecord.value.coverFileId),
    copywriting: normalizeStringValue(currentRecord.value.copywriting),
    commentRequirement: normalizeStringValue(currentRecord.value.commentRequirement),
    commentExample: normalizeStringValue(currentRecord.value.commentExample),
    targetCommentCount: normalizeNumberValue(currentRecord.value.targetCommentCount, DAILY_TASK_DEFAULT_FORM.targetCommentCount),
    rewardAmount: normalizeNumberValue(currentRecord.value.rewardAmount, DAILY_TASK_DEFAULT_FORM.rewardAmount),
    taskBudgetAmount: normalizeNumberValue(
      currentRecord.value.taskBudgetAmount,
      normalizeNumberValue(currentRecord.value.rewardAmount, DAILY_TASK_DEFAULT_FORM.taskBudgetAmount)
    ),
    status: normalizeStringValue(currentRecord.value.status) || DAILY_TASK_DEFAULT_FORM.status,
    distributionScope: normalizeStringValue(currentRecord.value.distributionScope) || DAILY_TASK_DEFAULT_FORM.distributionScope,
    distributionGroupId: normalizeStringValue(currentRecord.value.distributionGroupId),
    allowGroupCollaboration: Boolean(currentRecord.value.allowGroupCollaboration),
    commissionEnabled: Boolean(currentRecord.value.commissionEnabled),
    commissionRuleId: '',
    commissionRuleType: currentRecord.value.commissionRuleType === 'FIXED' ? 'FIXED' : 'PERCENT',
    commissionRuleValue: normalizeNumberValue(currentRecord.value.commissionRuleValue, 0),
    commissionRuleDisplayValue: normalizeNumberValue(currentRecord.value.commissionRuleValue, 0) / 100,
    commissionMode: currentRecord.value.commissionMode === 'INCLUDED' ? 'INCLUDED' : 'EXTRA',
    commissionLocked: Boolean(currentRecord.value.commissionLocked),
    remark: normalizeStringValue(currentRecord.value.remark),
    backupVideoUrls,
    commentItems
  };
});

onMounted(async () => {
  await loadOptions();
  // 每日任务列表不依赖团队选项；默认“全部租户”查询不能被表单辅助数据阻断。
  await fetchList(true);
});

async function loadOptions() {
  const [dictMap, tenants] = await Promise.all([
    dictsApi.getDictOptions([
      DICT_TYPES.mediaPlatform,
      DICT_TYPES.dailyTaskStatus,
      DICT_TYPES.taskCommentStatus,
      DICT_TYPES.commentSource
    ]),
    tenantsApi.getTenantOptions()
  ]);
  platformOptions.value = dictMap[DICT_TYPES.mediaPlatform]?.length ? dictMap[DICT_TYPES.mediaPlatform] : MEDIA_PLATFORM_FALLBACKS;
  taskStatusOptions.value = mergeOptionsWithFallback(dictMap[DICT_TYPES.dailyTaskStatus], DAILY_TASK_STATUS_FALLBACKS);
  commentStatusOptions.value = dictMap[DICT_TYPES.taskCommentStatus]?.length ? dictMap[DICT_TYPES.taskCommentStatus] : TASK_COMMENT_STATUS_FALLBACKS;
  commentSourceOptions.value = dictMap[DICT_TYPES.commentSource]?.length ? dictMap[DICT_TYPES.commentSource] : COMMENT_SOURCE_FALLBACKS;
  tenantOptions.value = tenants;
}

async function loadTaskFilterGroupOptions() {
  if (!filters.tenantId) {
    filterGroupOptions.value = [];
    return;
  }

  filterGroupLoading.value = true;
  try {
    const groups = await groupsApi.listDistributionGroupOptions({
      tenantId: filters.tenantId,
      includeDeleted: true
    });
    filterGroupOptions.value = groups.map((item) => ({
      value: item.id,
      label: `${item.name}${formatLeaderGroupOptionSuffix(item.status, item.deletedAt)}`
    }));
  } finally {
    filterGroupLoading.value = false;
  }
}

async function handleTenantFilterChange() {
  filters.distributionGroupId = '';
  filterGroupOptions.value = [];
  await loadTaskFilterGroupOptions();
}

async function handleFilterGroupVisible(visible: boolean) {
  if (visible && filters.tenantId && !filterGroupOptions.value.length) {
    await loadTaskFilterGroupOptions();
  }
}

async function handleResetFilters() {
  await resetFilters();
  filterGroupOptions.value = [];
}

async function loadMediaAccountOptions(payload: { tenantId: string; platform: string; needsGroupOptions: boolean }) {
  if (!payload.tenantId || !payload.platform) {
    mediaAccountOptions.value = [];
  } else {
    accountLoading.value = true;
    try {
      mediaAccountOptions.value = await mediaAccountsApi.getMediaAccountOptions(payload);
    } finally {
      accountLoading.value = false;
    }
  }

  if (!payload.tenantId || !payload.needsGroupOptions) {
    groupOptions.value = [];
    return;
  }
  groupLoading.value = true;
  try {
    const groups = await groupsApi.listDistributionGroupOptions({ tenantId: payload.tenantId });
    groupOptions.value = groups
      .filter((item) => String(item.status || 'ENABLED').toUpperCase() === 'ENABLED')
      .map((item) => ({
        label: `${item.name}${item.leaderName ? ` · ${item.leaderName}` : ' · 待绑定团长'}`,
        value: item.id,
        leaderName: item.leaderName || null,
        memberCount: item.memberCount || 0,
      }));
  } finally {
    groupLoading.value = false;
  }
}

function tenantName(id?: string) {
  return tenantOptions.value.find((item) => item.value === id)?.label || '--';
}

function progressPercent(row: DailyTaskItem) {
  const total = resolveDisplayCommentTotal(row);
  if (!total) return 0;
  return Math.min(100, Math.round(((row.claimedCommentCount || 0) / total) * 100));
}

function resolveDisplayCommentTotal(row: DailyTaskItem) {
  const actualCommentCount = resolveActualCommentCount(row);
  if (actualCommentCount > 0 && row.targetCommentCount !== actualCommentCount) {
    return actualCommentCount;
  }
  return row.targetCommentCount || actualCommentCount;
}

function resolveActualCommentCount(row: DailyTaskItem) {
  const commentList = Array.isArray(row.comment) ? row.comment : Array.isArray(row.comments) ? row.comments : [];
  return commentList.length;
}

function countByStatus(status: string) {
  return items.value.filter((item) => item.status === status).length;
}

const pendingSettlementTotal = computed(() => items.value.reduce((total, item) => total + pendingSettlementCount(item), 0));

function pendingSettlementCount(row: DailyTaskItem) {
  const count = Number(row.pendingSettlementCount);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

/**
 * Whether a task already has any participant/claim history.
 * The list endpoint returns participantCount for all task rows; the remaining
 * counters are retained as defensive compatibility fallbacks for old rows.
 */
function hasClaims(row: DailyTaskItem) {
  const counts = [
    row.participantCount,
    row.claimedCommentCount,
    row.completedCommentCount,
    row.pendingSettlementCount
  ];
  return counts.some((value) => {
    const count = Number(value ?? 0);
    return Number.isFinite(count) && count > 0;
  });
}

/** 已关闭/归档/停用的任务只能查看历史，不再编辑任务内容。 */
function isTaskContentLocked(row: DailyTaskItem) {
  return ['DISABLED', 'CANCELLED', 'CLOSED', 'ARCHIVED'].includes(String(row.status || '').toUpperCase());
}

function openCreate() {
  dialogMode.value = 'create';
  currentRecord.value = null;
  mediaAccountOptions.value = [];
  groupOptions.value = [];
  dialogVisible.value = true;
}

function openEdit(row: DailyTaskItem) {
  if (isTaskContentLocked(row)) {
    ElMessage.warning('当前任务已停用，不能编辑');
    return;
  }
  dialogMode.value = 'edit';
  currentRecord.value = row;
  dialogVisible.value = true;
}

function openProgress(row: DailyTaskItem) {
  currentRecord.value = row;
  progressDrawerVisible.value = true;
}

function openCommentsDrawer(row: DailyTaskItem) {
  if (isTaskContentLocked(row)) {
    ElMessage.warning('当前任务已停用，不能编辑评论配置');
    return;
  }
  currentRecord.value = row;
  commentsDrawerVisible.value = true;
}

function openOrdersDrawer(row: DailyTaskItem) {
  currentRecord.value = row;
  ordersDrawerFilterPreset.value = undefined;
  ordersDrawerVisible.value = true;
}

function openPendingSettlementOrders(row: DailyTaskItem) {
  if (!pendingSettlementCount(row)) return;
  currentRecord.value = row;
  ordersDrawerFilterPreset.value = 'pending-settlement';
  ordersDrawerVisible.value = true;
}

async function publishTask(row: DailyTaskItem) {
  if (publishingId.value) return;
  const confirmed = await ElMessageBox.confirm(
    `发布「${row.title}」后，符合范围的成员可以领取该任务。`,
    '发布任务', { confirmButtonText: '确认发布', cancelButtonText: '取消' },
  ).catch(() => false);
  if (!confirmed || publishingId.value) return;
  publishingId.value = row.id;
  try {
    await dailyTasksApi.dispatchDailyTask(row.id);
    openDispatchDialog(row);
    await fetchList();
  } finally {
    publishingId.value = '';
  }
}

function openDispatchDialog(row: DailyTaskItem) {
  if (isTaskContentLocked(row)) {
    ElMessage.warning('当前任务已停用，不能发推流');
    return;
  }
  currentRecord.value = row;
  dispatchDialogVisible.value = true;
}

async function handleSubmit(payload: DailyTaskFormModel) {
  const isGroupCommission = payload.distributionScope === 'GROUP' && Boolean(payload.commissionEnabled);
  const commissionRuleType = payload.commissionRuleType === 'FIXED' ? 'FIXED' : 'PERCENT';
  const commissionDisplayValue = Number(payload.commissionRuleDisplayValue);
  const commissionRuleValue = isGroupCommission ? Math.round(commissionDisplayValue * 100) : undefined;

  // Build the task-level commission values at the API boundary. This guarantees
  // that the visible rule selection and the submitted integer snapshot cannot drift.
  if (isGroupCommission) {
    if (!Number.isFinite(commissionDisplayValue) || commissionDisplayValue <= 0 || !Number.isInteger(commissionRuleValue)) {
      ElMessage.warning('请填写大于 0 的分佣值');
      return;
    }
    if (commissionRuleType === 'PERCENT' && commissionDisplayValue > 100) {
      ElMessage.warning('比例分佣不能超过 100%');
      return;
    }
  }

  submitting.value = true;
  try {
    const videoLinks = [
      { url: normalizeStringValue(payload.videoUrl).trim(), isPrimary: true },
      ...normalizeStringArray(payload.backupVideoUrls)
        .map((url) => url.trim())
        .filter(Boolean)
        .map((url) => ({ url, isPrimary: false }))
    ];
    const body = omitEmpty<dailyTasksApi.DailyTaskPayload>({
      tenantId: payload.tenantId,
      mediaAccountId: payload.mediaAccountId,
      platform: payload.platform,
      title: payload.title,
      videoUrl: normalizeStringValue(payload.videoUrl).trim(),
      coverFileId: payload.coverFileId,
      copywriting: payload.copywriting,
      commentRequirement: payload.commentRequirement,
      commentExample: payload.commentExample,
      targetCommentCount: payload.targetCommentCount,
      // rewardAmount 是成员端可见金额；taskBudgetAmount 是任务发布时锁定的分佣计价基数。
      rewardAmount: payload.rewardAmount,
      taskBudgetAmount: payload.taskBudgetAmount,
      distributionScope: payload.distributionScope,
      distributionGroupId: payload.distributionScope === 'GROUP' ? payload.distributionGroupId : '',
      allowGroupCollaboration: false,
      commissionEnabled: isGroupCommission,
      commissionMode: isGroupCommission ? payload.commissionMode : undefined,
      commissionRuleType: isGroupCommission ? commissionRuleType : undefined,
      commissionRuleValue: isGroupCommission ? commissionRuleValue : undefined,
      remark: payload.remark,
      videoLinks,
      comment: payload.commentItems
    });

    if (dialogMode.value === 'create') {
      await dailyTasksApi.createDailyTask(body as dailyTasksApi.DailyTaskPayload);
      ElMessage.success('每日任务已新增');
    } else if (currentRecord.value) {
      delete body.tenantId;
      body.comment = [];
      body.replaceComments = false;
      await dailyTasksApi.updateDailyTask(currentRecord.value.id, body);
      ElMessage.success('每日任务已更新');
    }
    dialogVisible.value = false;
    await fetchList();
  } finally {
    submitting.value = false;
  }
}

async function pauseTask(row: DailyTaskItem) {
  await ElMessageBox.confirm(`确认暂停每日任务「${row.title}」？暂停会阻止新成员领取，已领取成员仍可完成和结算。`, '暂停任务', { type: 'warning' });
  await dailyTasksApi.pauseDailyTask(row.id);
  ElMessage.success('任务已暂停');
  await fetchList();
}
async function resumeTask(row: DailyTaskItem) {
  await dailyTasksApi.resumeDailyTask(row.id);
  ElMessage.success('任务已恢复');
  await fetchList();
}
async function closeTask(row: DailyTaskItem) {
  await ElMessageBox.confirm(`确认关闭每日任务「${row.title}」？关闭后不再允许新领取，历史订单仍可完成与结算。`, '关闭任务', { type: 'warning' });
  await dailyTasksApi.closeDailyTask(row.id);
  ElMessage.success('任务已关闭');
  await fetchList();
}
async function archiveTask(row: DailyTaskItem) {
  await ElMessageBox.confirm(`确认归档每日任务「${row.title}」？归档只收起任务，不删除历史订单、佣金或流水。`, '归档任务', { type: 'warning' });
  await dailyTasksApi.archiveDailyTask(row.id);
  ElMessage.success('任务已归档');
  await fetchList();
}

async function handleRemove(row: DailyTaskItem) {
  if (row.testBatchId) {
    ElMessage.warning('该任务属于历史测试批次。批次清理入口已停止使用，为避免误删关联订单和账务，请暂停、关闭或归档，不要直接删除。');
    return;
  }
  if (hasClaims(row)) {
    ElMessage.warning('已有领取记录的任务不能直接删除。请暂停、关闭或归档任务，保留订单和账务历史。');
    return;
  }
  await ElMessageBox.confirm(`确认删除每日任务「${row.title}」？`, '删除确认', { type: 'warning' });
  await dailyTasksApi.removeDailyTask(row.id);
  ElMessage.success('每日任务已删除');
  await fetchList();
}

function mergeOptionsWithFallback(remote: SelectOption[] | undefined, fallback: SelectOption[]) {
  const byValue = new Map<string, SelectOption>();
  fallback.forEach((item) => byValue.set(String(item.value), item));
  (remote || []).forEach((item) => byValue.set(String(item.value), item));
  return Array.from(byValue.values());
}

function formatLeaderGroupOptionSuffix(status?: string | null, deletedAt?: string | null) {
  if (deletedAt || String(status || '').toUpperCase() === 'DELETED') return '（已删除）';
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'DISABLED') return '（已停用）';
  if (normalized === 'UNBOUND') return '（已解绑）';
  return '';
}

function formatLeaderGroupStatus(status?: string | null) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'DISABLED') return '已停用';
  if (normalized === 'UNBOUND') return '已解绑';
  if (normalized === 'DELETED') return '已删除';
  if (normalized === 'RESETTING') return '处理中';
  return normalized || '异常';
}

function normalizeStringValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => normalizeStringValue(item)).filter(Boolean) : [];
}

function normalizeNumberValue(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function formatCurrencyFromCent(amount?: number | null) {
  const value = typeof amount === 'number' && Number.isFinite(amount) ? amount / 100 : 0;
  return `¥ ${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function resolveFormVideoLinks(record: DailyTaskItem) {
  const normalizedLinks = Array.isArray(record.videoLinks)
    ? record.videoLinks
        .map((item) => ({
          url: normalizeStringValue(item?.url).trim(),
          isPrimary: Boolean(item?.isPrimary)
        }))
        .filter((item) => item.url)
    : [];

  const legacyLinks = (Array.isArray(record.videoUrl) ? record.videoUrl : [record.videoUrl])
    .map(value => normalizeStringValue(value).trim()).filter(Boolean);
  const primaryVideoUrl = normalizedLinks.find(item => item.isPrimary)?.url || normalizedLinks[0]?.url || legacyLinks[0] || '';
  const allUrls = new Set([...normalizedLinks.map(item => item.url), ...legacyLinks]);
  allUrls.delete(primaryVideoUrl);
  return { primaryVideoUrl, backupVideoUrls: [...allUrls] };
}

function primaryWebVideoUrl(record: DailyTaskItem) {
  const { primaryVideoUrl } = resolveFormVideoLinks(record);
  return /^https?:\/\//i.test(primaryVideoUrl) ? primaryVideoUrl : '';
}
</script>

<style scoped>
:deep(.daily-task-table .el-table-fixed-column--left),
:deep(.daily-task-table .el-table__fixed-left),
:deep(.daily-task-table .el-table-fixed-column--left .el-table__cell),
:deep(.daily-task-table .el-table__fixed-left .el-table__cell),
:deep(.daily-task-table .el-table-fixed-column--right),
:deep(.daily-task-table .el-table__fixed-right),
:deep(.daily-task-table .el-table-fixed-column--right .el-table__cell),
:deep(.daily-task-table .el-table__fixed-right .el-table__cell) {
  background: var(--el-bg-color);
}

:deep(.daily-task-table .task-info-column .cell) {
  padding-top: 10px;
  padding-bottom: 10px;
}

.task-info-card {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.task-cover-image,
.task-cover-placeholder {
  width: 84px;
  min-width: 84px;
  height: 56px;
  min-height: 56px;
  border-radius: 10px;
}

.task-cover-image {
  object-fit: cover;
}

.task-cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}

.task-info-main {
  min-width: 0;
  flex: 1;
}

.task-info-heading {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 12px;
}

.task-title-wrap {
  min-width: 0;
  flex: 1;
}

.task-info-title {
  display: -webkit-box;
  overflow: hidden;
  color: var(--el-text-color-primary);
  font-weight: 500;
  line-height: 1.45;
  text-overflow: ellipsis;
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.task-settlement-badge {
  flex: 0 0 auto;
  margin-top: 1px;
}

.task-settlement-button {
  height: 26px;
  padding: 0 8px;
  font-size: 12px;
}

.task-test-tag {
  flex: 0 0 auto;
  margin-top: 2px;
}

.task-info-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.task-video-link,
.task-video-empty {
  min-width: 0;
  overflow: hidden;
  color: var(--el-color-primary);
  font-size: 12px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-video-link:hover {
  color: var(--el-color-primary-light-3);
}

.task-video-empty {
  color: var(--el-text-color-placeholder);
}

.money-cell { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
.money-cell strong { color: var(--el-text-color-primary); font-weight: 650; }
.money-cell small { color: var(--el-text-color-secondary); font-size: 12px; white-space: nowrap; }

:deep(.daily-task-table .operation-cell .cell) {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

:deep(.daily-task-table .updated-at-cell .cell) {
  white-space: nowrap;
}

.scope-navigation-alert {
  margin-bottom: 16px;
}
.scope-navigation-alert__content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.scope-navigation-alert__actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}
.test-purge-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.test-purge-summary-item,
.test-purge-action-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-fill-color-extra-light);
}
.test-purge-summary-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 13px 15px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.test-purge-summary-item strong {
  color: var(--el-text-color-primary);
  font-size: 22px;
}
.test-purge-summary-item.is-danger {
  border-color: var(--el-color-danger-light-5);
  background: var(--el-color-danger-light-9);
}
.test-purge-summary-item.is-danger strong { color: var(--el-color-danger); }
.test-purge-action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.test-purge-action-card {
  display: flex;
  min-width: 0;
  cursor: pointer;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  padding: 14px 16px;
  text-align: left;
  transition: border-color .2s, background .2s;
}
.test-purge-action-card:hover {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
}
.test-purge-action-card.is-blocked {
  border-color: var(--el-color-danger-light-5);
  background: var(--el-color-danger-light-9);
}
.test-purge-action-card__label { color: var(--el-text-color-secondary); font-size: 13px; }
.test-purge-action-card strong { color: var(--el-text-color-primary); font-size: 18px; }
.test-purge-action-card small { color: var(--el-text-color-secondary); line-height: 1.5; }
.test-purge-action-card__names { max-width: 100%; overflow: hidden; color: var(--el-color-primary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.test-purge-blocker-list { margin: 6px 0 0; padding-left: 18px; color: var(--el-text-color-regular); line-height: 1.8; }
.test-purge-explain { color: var(--el-text-color-regular); line-height: 1.85; }
.test-purge-explain p { margin: 0 0 4px; }
.test-purge-list { display: flex; flex-wrap: wrap; gap: 8px; padding: 4px 0 8px; }
@media (max-width: 768px) {
  .test-purge-summary-grid, .test-purge-action-grid { grid-template-columns: 1fr; }
  .scope-navigation-alert__content { align-items: flex-start; flex-direction: column; }
}
</style>
