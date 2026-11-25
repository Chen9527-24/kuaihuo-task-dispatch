<template>
  <el-drawer v-model="visible" title="任务订单列表" size="1320px">
    <div class="space-y-4">
      <section class="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
        <el-form :model="filters" class="grid grid-cols-1 gap-3 md:grid-cols-4">
          <el-form-item label="参与状态" class="!mb-0">
            <el-select v-model="filters.status" clearable placeholder="全部状态">
              <el-option label="进行中" value="STARTED" />
              <el-option label="已领取" value="CLAIMED" />
              <el-option label="已完成" value="COMPLETED" />
              <el-option label="已放弃" value="ABANDONED" />
            </el-select>
          </el-form-item>
          <el-form-item label="结算状态" class="!mb-0">
            <el-select v-model="filters.settlementStatus" clearable placeholder="全部状态">
              <el-option label="未结算" value="UNSETTLED" />
              <el-option label="已结算" value="SETTLED" />
            </el-select>
          </el-form-item>
          <el-form-item label="用户姓名" class="!mb-0">
            <el-input v-model="filters.visitorName" clearable placeholder="请输入姓名" @keyup.enter="loadOrders(true)" />
          </el-form-item>
          <el-form-item label="手机号" class="!mb-0">
            <el-input v-model="filters.phone" clearable placeholder="请输入手机号" @keyup.enter="loadOrders(true)" />
          </el-form-item>
        </el-form>
        <div class="mt-3 flex items-center gap-2">
          <el-button type="primary" @click="loadOrders(true)">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
          <el-button v-if="can('daily-task:order:settle')" type="warning" plain :loading="cleaning" @click="handleCleanupInvalidOrders">清理无效数据</el-button>
          <el-tag v-if="filters.hasProof" type="warning" effect="plain">仅看已提交个人凭证</el-tag>
        </div>
      </section>

      <el-table v-loading="loading" :data="orders" stripe row-key="id">
        <el-table-column prop="visitorName" label="用户姓名" min-width="140">
          <template #default="{ row }">{{ row.visitorName || '--' }}</template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" min-width="140">
          <template #default="{ row }">{{ row.phone || row.appUser?.phone || '--' }}</template>
        </el-table-column>
        <el-table-column label="自媒体账号ID" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ row.mediaAccountNo || '--' }}</template>
        </el-table-column>
        <el-table-column label="主页识别" min-width="190" show-overflow-tooltip>
          <template #default="{ row }">
            <div v-if="row.homepageRecognition" class="space-y-1 text-xs">
              <el-tag size="small" :type="resolveHomepageRecognitionTagType(row.homepageRecognition?.status)">{{ resolveHomepageRecognitionStatusLabel(row.homepageRecognition?.status) }}</el-tag>
              <div v-if="row.homepageRecognition?.nicknameCandidate" class="truncate text-slate-700">昵称：{{ row.homepageRecognition.nicknameCandidate }}</div>
              <div v-if="row.homepageRecognition?.accountIdCandidate" class="truncate text-slate-500">ID：{{ row.homepageRecognition.accountIdCandidate }}</div>
              <div v-if="row.homepageRecognition?.error" class="truncate text-amber-600">{{ row.homepageRecognition.error }}</div>
              <el-button
                v-if="can('daily-task:order:settle')"
                link
                type="primary"
                size="small"
                :loading="isRetryingHomepageRecognition(row)"
                :disabled="!canRetryHomepageRecognition(row)"
                @click.stop="handleRetryHomepageRecognition(row)"
              >
                重新识别
              </el-button>
            </div>
            <span v-else class="text-slate-400">暂无</span>
          </template>
        </el-table-column>
        <el-table-column label="接单状态" min-width="170" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tag v-if="row.appUser?.status && row.appUser.status !== 'ENABLED'" type="danger">已限制</el-tag>
            <el-tag v-else type="success">正常</el-tag>
            <div v-if="row.appUser?.banReason" class="mt-1 truncate text-xs text-slate-500">{{ row.appUser.banReason }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="参与状态" width="120">
          <template #default="{ row }">
            <el-tag :type="resolveTaskStatusType(row.status)">{{ resolveTaskStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="settlementStatus" label="结算状态" width="120">
          <template #default="{ row }">
            <el-tag :type="resolveSettlementStatusType(row.settlementStatus)">{{ resolveSettlementStatusLabel(row.settlementStatus) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="个人凭证" min-width="160">
          <template #default="{ row }">
            <TaskOrderMediaGallery
              :task-id="taskId"
              :participant-id="row.participantId"
              :files="row.proofImages"
              :legacy-urls="row.legacyProofUrls"
              @preview="openMediaPreview(row, $event)"
            />
          </template>
        </el-table-column>
        <el-table-column label="结算凭证" min-width="160">
          <template #default="{ row }">
            <TaskOrderMediaGallery
              v-if="row.settlementStatus === 'SETTLED' && hasSettlementProof(row)"
              :task-id="taskId"
              :participant-id="row.participantId"
              :files="row.settlementProof ? [row.settlementProof] : []"
              :legacy-urls="[row.legacySettlementProofUrl]"
              @preview="openMediaPreview(row, $event)"
            />
            <el-tag v-else :type="resolveSettlementStatusType(row.settlementStatus)">
              {{ resolveSettlementStatusLabel(row.settlementStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="结算信息" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <div v-if="row.settlementStatus === 'SETTLED'" class="text-sm">
              <div>{{ formatCurrencyFromCent(row.settlementAmount) }}</div>
              <div class="text-xs text-slate-500">任务金额：{{ formatCurrencyFromCent(row.taskRewardAmount) }}</div>
              <div class="truncate text-xs text-slate-500">{{ row.settlementRemark || '已完成结算' }}</div>
            </div>
            <div v-else-if="row.settlementStatus === 'REJECTED'" class="text-sm">
              <div class="text-red-500">已驳回</div>
              <div class="truncate text-xs text-slate-500">{{ row.rejectReason || '未填写驳回原因' }}</div>
            </div>
            <span v-else class="text-slate-400">未结算</span>
            <div v-if="row.taskRewardAmount" class="text-xs text-slate-500">任务金额：{{ formatCurrencyFromCent(row.taskRewardAmount) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="关键时间" min-width="220">
          <template #default="{ row }">
            <div v-if="resolveOrderTimeline(row).length" class="space-y-1 text-sm">
              <div v-for="item in resolveOrderTimeline(row)" :key="`${row.id}-${item.label}`" class="flex items-center gap-2">
                <span class="w-12 shrink-0 text-slate-500">{{ item.label }}</span>
                <span class="min-w-0">{{ formatDateTime(item.value) }}</span>
              </div>
            </div>
            <span v-else class="text-slate-400">暂无</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="340" fixed="right">
          <template #default="{ row }">
            <el-button v-if="can('daily-task:order:settle')" link type="primary" :disabled="!canSettle(row)" @click="openSettle(row)">结算</el-button>
            <el-button v-if="can('daily-task:order:settle')" link type="danger" :disabled="!canReject(row)" @click="openReject(row)">驳回</el-button>
            <el-button v-if="can('daily-task:order:settle')" link type="warning" :disabled="!row.appUser?.id" @click="openBan(row)">禁止接单</el-button>
            <el-button
              v-if="can('daily-task:order:settle')"
              link
              type="warning"
              :loading="isResetting(row)"
              :disabled="!canReset(row) || isResetting(row)"
              @click="handleReset(row)"
            >
              重置状态
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <CrudPaginationBar
        :current-page="pagination.page"
        :page-size="pagination.pageSize"
        :total="pagination.total"
        @update:current-page="pagination.page = $event; loadOrders()"
        @update:page-size="handlePageSizeChange"
      />
    </div>

    <TaskOrderSettleDialog
      v-model="settleDialogVisible"
      :task-id="taskId"
      :order="currentOrder"
      @settled="handleSettled"
    />
    <TaskOrderRejectDialog
      v-model="rejectDialogVisible"
      :task-id="taskId"
      :order="currentOrder"
      @rejected="handleRejected"
    />
    <TaskOrderBanDialog
      v-model="banDialogVisible"
      :task-id="taskId"
      :order="currentOrder"
      @banned="handleBanned"
    />
    <TaskOrderMediaPreviewDialog
      v-model="mediaPreviewVisible"
      :task-id="taskId"
      :participant-id="mediaPreviewParticipantId"
      :sources="mediaPreviewSources"
      :initial-index="mediaPreviewIndex"
    />
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as dailyTasksApi from '@/api/modules/dailyTasks';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import { formatDateTime } from '@/utils/format';
import TaskOrderBanDialog from './TaskOrderBanDialog.vue';
import TaskOrderRejectDialog from './TaskOrderRejectDialog.vue';
import TaskOrderSettleDialog from './TaskOrderSettleDialog.vue';
import TaskOrderMediaGallery from './TaskOrderMediaGallery.vue';
import TaskOrderMediaPreviewDialog from './TaskOrderMediaPreviewDialog.vue';
import type { TaskOrderPreviewSource } from './taskOrderMedia.types';
import { useAuthStore } from '@/stores/auth';

const props = defineProps<{
  modelValue: boolean;
  taskId?: string;
  filterPreset?: 'pending-settlement';
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  changed: [];
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

const auth = useAuthStore();

function can(permission: string) {
  return auth.isPlatformAdmin || auth.user.permissions.includes(permission);
}

const loading = ref(false);
const cleaning = ref(false);
const orders = ref<dailyTasksApi.DailyTaskOrderItem[]>([]);
const settleDialogVisible = ref(false);
const rejectDialogVisible = ref(false);
const banDialogVisible = ref(false);
const currentOrder = ref<dailyTasksApi.DailyTaskOrderItem | null>(null);
const mediaPreviewVisible = ref(false);
const mediaPreviewParticipantId = ref('');
const mediaPreviewSources = ref<TaskOrderPreviewSource[]>([]);
const mediaPreviewIndex = ref(0);
const retryingHomepageRecognitionParticipantIds = ref<string[]>([]);
const resettingParticipantIds = ref<string[]>([]);
let pendingSettlementPresetApplied = false;

const filters = reactive<dailyTasksApi.DailyTaskOrderQuery>({
  status: '',
  settlementStatus: '',
  hasProof: undefined,
  phone: '',
  visitorName: ''
});

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
});

watch(
  () => [props.modelValue, props.taskId, props.filterPreset] as const,
  ([open, taskId]) => {
    if (!open || !taskId) return;
    if (props.filterPreset === 'pending-settlement') {
      applyPendingSettlementPreset();
      pendingSettlementPresetApplied = true;
    } else if (pendingSettlementPresetApplied) {
      clearPresetFilters();
      pendingSettlementPresetApplied = false;
    }
    loadOrders(true);
  }
);

async function loadOrders(resetPage = false) {
  if (!props.taskId) return;
  if (resetPage) pagination.page = 1;

  loading.value = true;
  try {
    const result = await dailyTasksApi.listDailyTaskOrders(props.taskId, {
      ...filters,
      mediaMode: 'optimized',
      page: pagination.page,
      pageSize: pagination.pageSize
    });
    orders.value = result.items;
    pagination.total = result.total;
    pagination.page = result.page;
  } finally {
    loading.value = false;
  }
}

async function handleCleanupInvalidOrders() {
  if (!can('daily-task:order:settle')) {
    ElMessage.warning('当前角色没有审核/结算订单权限');
    return;
  }
  if (!props.taskId) return;
  await ElMessageBox.confirm('确认清理当前任务下的无效进行中订单？该操作会删除未领取评论、无凭证、无结算痕迹的脏数据。', '清理确认', {
    type: 'warning'
  });

  cleaning.value = true;
  try {
    const result = await dailyTasksApi.cleanupInvalidDailyTaskOrders(props.taskId);
    ElMessage.success(result.message || `已清理 ${result.deletedCount ?? 0} 条无效进行中订单`);
    emit('changed');
    await loadOrders(true);
  } finally {
    cleaning.value = false;
  }
}

function applyPendingSettlementPreset() {
  filters.status = 'COMPLETED';
  filters.settlementStatus = 'UNSETTLED';
  filters.hasProof = true;
  filters.phone = '';
  filters.visitorName = '';
}

function clearPresetFilters() {
  filters.status = '';
  filters.settlementStatus = '';
  filters.hasProof = undefined;
  filters.phone = '';
  filters.visitorName = '';
}

function resetFilters() {
  clearPresetFilters();
  loadOrders(true);
}

function handlePageSizeChange(value: number) {
  pagination.pageSize = value;
  loadOrders(true);
}

function openSettle(row: dailyTasksApi.DailyTaskOrderItem) {
  if (!can('daily-task:order:settle')) return;
  currentOrder.value = row;
  settleDialogVisible.value = true;
}

function openReject(row: dailyTasksApi.DailyTaskOrderItem) {
  if (!can('daily-task:order:settle')) return;
  currentOrder.value = row;
  rejectDialogVisible.value = true;
}

function openBan(row: dailyTasksApi.DailyTaskOrderItem) {
  if (!can('daily-task:order:settle')) return;
  currentOrder.value = row;
  banDialogVisible.value = true;
}

function handleSettled() {
  settleDialogVisible.value = false;
  emit('changed');
  loadOrders();
}

function handleRejected() {
  rejectDialogVisible.value = false;
  emit('changed');
  loadOrders();
}

function handleBanned() {
  banDialogVisible.value = false;
  emit('changed');
  loadOrders();
}

function canSettle(row: dailyTasksApi.DailyTaskOrderItem) {
  return row.status === 'COMPLETED' && !['SETTLED', 'REJECTED'].includes(row.settlementStatus);
}

function canReject(row: dailyTasksApi.DailyTaskOrderItem) {
  return row.settlementStatus !== 'SETTLED';
}

function canReset(row: dailyTasksApi.DailyTaskOrderItem) {
  return ['STARTED', 'CLAIMED'].includes(row.status) && row.settlementStatus !== 'SETTLED';
}

function isResetting(row: dailyTasksApi.DailyTaskOrderItem) {
  return resettingParticipantIds.value.includes(row.participantId);
}

async function handleReset(row: dailyTasksApi.DailyTaskOrderItem) {
  if (!props.taskId || !can('daily-task:order:settle') || !canReset(row) || isResetting(row)) return;
  try {
    await ElMessageBox.confirm(
      `确认重置“${row.visitorName || row.phone || row.appUser?.phone || '该成员'}”这条任务状态？重置后此订单会标记为已放弃，已占用评论会释放回任务池，该任务账号可以重新领取任务。此操作不会删除成员主体，也不会计入成员当天主动放弃次数。`,
      '确认重置任务状态',
      { type: 'warning', confirmButtonText: '确认重置', cancelButtonText: '取消' }
    );
  } catch {
    return;
  }

  resettingParticipantIds.value = [...resettingParticipantIds.value, row.participantId];
  try {
    const result = await dailyTasksApi.resetDailyTaskOrder(props.taskId, row.participantId);
    ElMessage.success(result.message || '任务状态已重置');
    emit('changed');
    await loadOrders();
  } finally {
    resettingParticipantIds.value = resettingParticipantIds.value.filter((id) => id !== row.participantId);
  }
}

function openMediaPreview(
  row: dailyTasksApi.DailyTaskOrderItem,
  payload: { sources: TaskOrderPreviewSource[]; initialIndex: number }
) {
  if (!payload.sources.length) return;
  mediaPreviewParticipantId.value = row.participantId;
  mediaPreviewSources.value = payload.sources;
  mediaPreviewIndex.value = payload.initialIndex;
  mediaPreviewVisible.value = true;
}

function hasSettlementProof(row: dailyTasksApi.DailyTaskOrderItem) {
  return Boolean(row.settlementProof?.fileId || String(row.legacySettlementProofUrl || '').trim());
}

function canRetryHomepageRecognition(row: dailyTasksApi.DailyTaskOrderItem) {
  if (!can('daily-task:order:settle')) return false;
  if (!row.homepageRecognition) return false;
  const status = String(row.homepageRecognition.status || '').toUpperCase();
  return !['PENDING', 'PROCESSING'].includes(status);
}

function isRetryingHomepageRecognition(row: dailyTasksApi.DailyTaskOrderItem) {
  return retryingHomepageRecognitionParticipantIds.value.includes(row.participantId);
}

async function handleRetryHomepageRecognition(row: dailyTasksApi.DailyTaskOrderItem) {
  if (!props.taskId || !canRetryHomepageRecognition(row) || isRetryingHomepageRecognition(row)) return;
  try {
    await ElMessageBox.confirm(
      '将使用当前订单已绑定的主页截图重新调用 OCR。该操作只刷新候选信息，不会修改用户手工填写的任务账号昵称或手机号。',
      '确认重新识别',
      { type: 'warning', confirmButtonText: '重新识别', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }

  retryingHomepageRecognitionParticipantIds.value = [...retryingHomepageRecognitionParticipantIds.value, row.participantId];
  try {
    const result = await dailyTasksApi.retryDailyTaskOrderHomepageRecognition(props.taskId, row.participantId);
    if (String(result?.status || '').toUpperCase() === 'NOT_ENABLED') {
      ElMessage.warning('OCR 服务当前未开启，未执行识别');
    } else {
      ElMessage.success('已提交重新识别，结果将自动刷新');
    }
    emit('changed');
    await loadOrders();
  } finally {
    retryingHomepageRecognitionParticipantIds.value = retryingHomepageRecognitionParticipantIds.value.filter((id) => id !== row.participantId);
  }
}

function resolveHomepageRecognitionStatusLabel(status?: string | null) {
  const value = String(status || '').toUpperCase()
  if (value === 'PENDING' || value === 'PROCESSING' || value === 'NOT_REQUESTED') return '识别中'
  if (value === 'SUCCEEDED') return '已识别'
  if (value === 'REVIEW_REQUIRED') return '待核验'
  if (value === 'FAILED') return '识别失败'
  if (value === 'NOT_ENABLED') return '暂未开启'
  return '未识别'
}

function resolveHomepageRecognitionTagType(status?: string | null): 'success' | 'warning' | 'danger' | 'info' {
  const value = String(status || '').toUpperCase()
  if (value === 'SUCCEEDED') return 'success'
  if (value === 'REVIEW_REQUIRED') return 'warning'
  if (value === 'FAILED') return 'danger'
  return 'info'
}

function resolveOrderTimeline(row: dailyTasksApi.DailyTaskOrderItem) {
  return [
    { label: '提交', value: row.createdAt },
    { label: '完成', value: row.completedAt },
    { label: '结算', value: row.settledAt },
    { label: '驳回', value: row.rejectedAt }
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));
}

function formatCurrencyFromCent(amount?: number | null) {
  const value = typeof amount === 'number' && Number.isFinite(amount) ? amount / 100 : 0;
  return `¥ ${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function resolveTaskStatusLabel(status?: string) {
  if (status === 'STARTED') return '进行中';
  if (status === 'CLAIMED') return '已领取';
  if (status === 'COMPLETED') return '已完成';
  if (status === 'ABANDONED') return '已放弃';
  return status || '--';
}

function resolveTaskStatusType(status?: string): 'info' | 'warning' | 'success' {
  if (status === 'COMPLETED') return 'success';
  if (status === 'CLAIMED') return 'warning';
  return 'info';
}

function resolveSettlementStatusLabel(status?: string) {
  if (status === 'SETTLED') return '已结算';
  if (status === 'REJECTED') return '已驳回';
  if (status === 'UNSETTLED') return '未结算';
  return status || '--';
}

function resolveSettlementStatusType(status?: string): 'success' | 'info' | 'danger' {
  if (status === 'SETTLED') return 'success';
  if (status === 'REJECTED') return 'danger';
  return 'info';
}
</script>
