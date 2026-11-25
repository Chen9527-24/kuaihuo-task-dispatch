<template>
  <div class="space-y-4">
    <PageToolbar title="提现管理" description="处理 H5 用户微信零钱提现申请；未关联商户号前可用 MOCK/MANUAL 模式测试完整流程。">
      <el-form :model="filters" class="grid grid-cols-1 gap-4 md:grid-cols-7">
        <el-form-item label="关键词" class="!mb-0 md:col-span-2">
          <el-input v-model="filters.keyword" placeholder="手机号 / 昵称 / 提现单号" clearable @keyup.enter="fetchList(true)" />
        </el-form-item>
        <el-form-item label="租户" class="!mb-0">
          <el-select v-model="filters.tenantId" :disabled="!canSelectTenant" filterable clearable placeholder="全部租户">
            <el-option v-for="item in visibleTenantOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态" class="!mb-0">
          <el-select v-model="filters.status" clearable placeholder="全部状态">
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="模式" class="!mb-0">
          <el-select v-model="filters.transferMode" clearable placeholder="全部模式">
            <el-option label="模拟 MOCK" value="MOCK" />
            <el-option label="人工 MANUAL" value="MANUAL" />
            <el-option label="微信 WECHAT" value="WECHAT" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作" class="!mb-0 md:col-span-2">
          <div class="flex gap-2">
            <el-button type="primary" @click="fetchList(true)">查询</el-button>
            <el-button @click="resetFilters">重置</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #actions>
        <el-button :loading="exporting" @click="exportRecords">导出</el-button>
      </template>
    </PageToolbar>


    <CrudTablePanel title="提现申请" description="拒绝会释放冻结余额；微信模式不允许人工标记已打款，必须通过回调或查单确认。">
      <el-table v-loading="loading" :data="items" row-key="id" stripe>
        <el-table-column type="index" label="#" width="60" />
        <el-table-column label="用户" min-width="210">
          <template #default="{ row }">
            <div class="flex items-center gap-3">
              <el-avatar :size="34" :src="row.appUser?.avatarUrl || undefined">{{ avatarText(row) }}</el-avatar>
              <div class="min-w-0">
                <div class="truncate font-medium text-slate-900">{{ row.appUser?.nickname || '微信用户' }}</div>
                <div class="truncate text-xs text-slate-500">{{ row.appUser?.phone || '未绑定手机号' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="租户" min-width="150">
          <template #default="{ row }">{{ row.tenant?.name || '--' }}</template>
        </el-table-column>
        <el-table-column label="金额" width="120">
          <template #default="{ row }"><span class="font-semibold text-orange-600">¥{{ formatCent(row.amount) }}</span></template>
        </el-table-column>
        <el-table-column label="状态" width="140">
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ row.statusLabel || statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="模式" width="110">
          <template #default="{ row }"><el-tag effect="plain">{{ row.transferMode || '-' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="提现单号" min-width="210" show-overflow-tooltip>
          <template #default="{ row }">{{ row.outBillNo || row.id }}</template>
        </el-table-column>
        <el-table-column label="申请时间" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="完成/拒绝时间" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.paidAt || row.rejectedAt || row.failedAt || row.cancelledAt) }}</template>
        </el-table-column>
        <el-table-column label="原因/备注" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ row.rejectReason || row.failReason || row.remark || '--' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'PENDING'" link type="primary" @click="approve(row)">通过</el-button>
            <el-button v-if="canReject(row)" link type="danger" @click="openReject(row)">拒绝</el-button>
            <el-button v-if="canMarkPaid(row)" link type="success" @click="openMarkPaid(row)">标记已打款</el-button>
            <el-button v-if="row.transferMode === 'WECHAT' && row.status !== 'PENDING'" link type="warning" @click="sync(row)">同步</el-button>
            <el-button link @click="openDetail(row)">详情</el-button>
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

    <el-drawer v-model="detailVisible" title="提现详情" size="560px">
      <el-descriptions v-if="detailRow" :column="1" border>
        <el-descriptions-item label="提现ID">{{ detailRow.id }}</el-descriptions-item>
        <el-descriptions-item label="用户">{{ detailRow.appUser?.nickname || '--' }} / {{ detailRow.appUser?.phone || '--' }}</el-descriptions-item>
        <el-descriptions-item label="OpenID">{{ detailRow.appUser?.serviceOpenid || '--' }}</el-descriptions-item>
        <el-descriptions-item label="金额">¥{{ formatCent(detailRow.amount) }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ detailRow.statusLabel || statusLabel(detailRow.status) }}</el-descriptions-item>
        <el-descriptions-item label="转账模式">{{ detailRow.transferMode || '--' }}</el-descriptions-item>
        <el-descriptions-item label="商户单号">{{ detailRow.outBillNo || '--' }}</el-descriptions-item>
        <el-descriptions-item label="微信转账单号">{{ detailRow.transferBillNo || '--' }}</el-descriptions-item>
        <el-descriptions-item label="微信状态">{{ detailRow.transferState || '--' }}</el-descriptions-item>
        <el-descriptions-item label="拒绝原因">{{ detailRow.rejectReason || '--' }}</el-descriptions-item>
        <el-descriptions-item label="失败原因">{{ detailRow.failReason || '--' }}</el-descriptions-item>
      </el-descriptions>
    </el-drawer>

    <el-dialog v-model="rejectVisible" title="拒绝提现" width="420px">
      <el-form label-width="86px">
        <el-form-item label="拒绝原因"><el-input v-model="rejectReason" type="textarea" :rows="4" placeholder="请输入拒绝原因" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectVisible = false">取消</el-button>
        <el-button type="danger" :loading="acting" @click="submitReject">确认拒绝</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="markPaidVisible" title="人工标记已打款" width="420px">
      <el-alert type="warning" show-icon :closable="false" title="该操作只更新系统状态，不会调用微信打款。" class="mb-4" />
      <el-form label-width="86px">
        <el-form-item label="流水号"><el-input v-model="markPaidForm.tradeNo" placeholder="可选，财务/模拟流水号" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="markPaidForm.remark" type="textarea" :rows="3" placeholder="可选" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="markPaidVisible = false">取消</el-button>
        <el-button type="primary" :loading="acting" @click="submitMarkPaid">确认标记</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import ExcelJS from 'exceljs';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as tenantsApi from '@/api/modules/tenants';
import * as withdrawalsApi from '@/api/modules/withdrawals';
import PageToolbar from '@/components/common/PageToolbar.vue';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import CrudTablePanel from '@/features/crud/components/CrudTablePanel.vue';
import { useRemoteTable } from '@/composables/useRemoteTable';
import { useAuthStore } from '@/stores/auth';
import type { SelectOption } from '@/utils/apiData';
import type { WithdrawalItem, WithdrawalQuery } from '@/api/modules/withdrawals';
import { formatDateTime } from '@/utils/format';

defineOptions({ name: 'WithdrawalManagementView' });

const authStore = useAuthStore();
const tenantOptions = ref<SelectOption[]>([]);
const detailVisible = ref(false);
const rejectVisible = ref(false);
const markPaidVisible = ref(false);
const acting = ref(false);
const exporting = ref(false);
const detailRow = ref<WithdrawalItem | null>(null);
const currentRow = ref<WithdrawalItem | null>(null);
const rejectReason = ref('');
const markPaidForm = reactive({ tradeNo: '', remark: '' });

const statusOptions = [
  { label: '待审核', value: 'PENDING' },
  { label: '已通过/待打款', value: 'APPROVED' },
  { label: '待用户确认', value: 'WAIT_USER_CONFIRM' },
  { label: '处理中', value: 'PROCESSING' },
  { label: '已打款', value: 'PAID' },
  { label: '已拒绝', value: 'REJECTED' },
  { label: '失败', value: 'FAILED' },
  { label: '已撤销', value: 'CANCELLED' }
];

const { items, filters, pagination, loading, fetchList } = useRemoteTable<WithdrawalItem, WithdrawalQuery>(
  { keyword: '', tenantId: '', status: '', transferMode: '', appUserIds: '' },
  withdrawalsApi.listWithdrawals,
  10
);

const canSelectTenant = computed(() => authStore.isPlatformAdmin);
const visibleTenantOptions = computed(() => {
  if (canSelectTenant.value) return tenantOptions.value;
  return authStore.tenantId ? [{ label: authStore.tenantName || '当前租户', value: authStore.tenantId }] : tenantOptions.value;
});

onMounted(async () => {
  tenantOptions.value = await tenantsApi.getTenantOptions();
  applyDefaultTenantScope();
  await fetchList(true);
});

function applyDefaultTenantScope() {
  if (!canSelectTenant.value && authStore.tenantId) filters.tenantId = authStore.tenantId;
}

async function resetFilters() {
  filters.keyword = '';
  filters.status = '';
  filters.transferMode = '';
  filters.appUserIds = '';
  filters.tenantId = canSelectTenant.value ? '' : authStore.tenantId || '';
  await fetchList(true);
}

async function exportRecords() {
  exporting.value = true;
  try {
    const rows = await withdrawalsApi.exportWithdrawals({ ...filters });
    if (!rows.length) {
      ElMessage.warning('暂无可导出的提现记录');
      return;
    }
    await exportWithdrawalWorkbook(rows);
    ElMessage.success('导出成功');
  } finally {
    exporting.value = false;
  }
}

async function exportWithdrawalWorkbook(rows: WithdrawalItem[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('提现记录');
  sheet.columns = [
    { header: '提现ID', key: 'id', width: 28 },
    { header: '提现单号', key: 'withdrawNo', width: 28 },
    { header: '租户', key: 'tenantName', width: 18 },
    { header: '用户昵称', key: 'nickname', width: 18 },
    { header: '手机号', key: 'phone', width: 16 },
    { header: '金额', key: 'amount', width: 12 },
    { header: '状态', key: 'status', width: 16 },
    { header: '模式', key: 'transferMode', width: 12 },
    { header: '商户单号', key: 'outBillNo', width: 28 },
    { header: '微信转账单号', key: 'transferBillNo', width: 28 },
    { header: '人工流水号', key: 'tradeNo', width: 22 },
    { header: '申请时间', key: 'createdAt', width: 20 },
    { header: '审核时间', key: 'approvedAt', width: 20 },
    { header: '完成时间', key: 'finishedAt', width: 20 },
    { header: '拒绝/失败原因', key: 'reason', width: 30 },
    { header: '备注', key: 'remark', width: 30 }
  ];
  sheet.addRows(rows.map((row) => ({
    id: row.id,
    withdrawNo: row.outBillNo || row.id,
    tenantName: row.tenant?.name || '',
    nickname: row.appUser?.nickname || '',
    phone: row.appUser?.phone || '',
    amount: Number(row.amount || 0) / 100,
    status: row.statusLabel || statusLabel(row.status),
    transferMode: row.transferMode || '',
    outBillNo: row.outBillNo || '',
    transferBillNo: row.transferBillNo || '',
    tradeNo: row.tradeNo || '',
    createdAt: formatDateTime(row.createdAt),
    approvedAt: formatDateTime(row.approvedAt),
    finishedAt: formatDateTime(row.paidAt || row.rejectedAt || row.failedAt || row.cancelledAt),
    reason: row.rejectReason || row.failReason || '',
    remark: row.remark || ''
  })));
  sheet.getRow(1).font = { bold: true };
  sheet.getColumn('amount').numFmt = '0.00';
  sheet.eachRow((row) => {
    row.alignment = { vertical: 'middle' };
  });
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(buffer, `提现记录_${formatExportDate()}.xlsx`);
}

function downloadBlob(buffer: ArrayBuffer | BlobPart, filename: string) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function formatExportDate() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function avatarText(row: WithdrawalItem) {
  return String(row.appUser?.nickname || row.appUser?.phone || 'H5').slice(-2);
}

function formatCent(value: unknown) {
  return (Number(value || 0) / 100).toFixed(2);
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    PENDING: '待审核',
    APPROVED: '已通过/待打款',
    WAIT_USER_CONFIRM: '待用户确认',
    PROCESSING: '处理中',
    PAID: '已打款',
    REJECTED: '已拒绝',
    FAILED: '失败',
    CANCELLED: '已撤销',
    EXPIRED: '已过期'
  };
  return map[String(status || '').toUpperCase()] || status || '--';
}

function statusType(status: string) {
  const value = String(status || '').toUpperCase();
  if (value === 'PAID') return 'success';
  if (['REJECTED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(value)) return 'danger';
  if (['WAIT_USER_CONFIRM', 'PROCESSING', 'APPROVED'].includes(value)) return 'warning';
  return 'info';
}

function isActiveStatus(status: string) {
  return ['PENDING', 'APPROVED', 'WAIT_USER_CONFIRM', 'PROCESSING'].includes(String(status || '').toUpperCase());
}

function canReject(row: WithdrawalItem) {
  return row.canRejectWithdrawal !== false && isActiveStatus(row.status);
}

function canMarkPaid(row: WithdrawalItem) {
  return row.transferMode !== 'WECHAT' && ['APPROVED', 'WAIT_USER_CONFIRM', 'PROCESSING'].includes(String(row.status || '').toUpperCase());
}

function openDetail(row: WithdrawalItem) {
  detailRow.value = row;
  detailVisible.value = true;
}

async function approve(row: WithdrawalItem) {
  await ElMessageBox.confirm(`确认通过 ${row.appUser?.nickname || row.appUser?.phone || row.id} 的提现申请？`, '审核通过', { type: 'warning' });
  acting.value = true;
  try {
    await withdrawalsApi.approveWithdrawal(row.id);
    ElMessage.success('已审核通过');
    await fetchList();
  } finally {
    acting.value = false;
  }
}

function openReject(row: WithdrawalItem) {
  currentRow.value = row;
  rejectReason.value = '';
  rejectVisible.value = true;
}

async function submitReject() {
  if (!currentRow.value) return;
  const reason = rejectReason.value.trim();
  if (!reason) {
    ElMessage.warning('请输入拒绝原因');
    return;
  }
  acting.value = true;
  try {
    await withdrawalsApi.rejectWithdrawal(currentRow.value.id, { rejectReason: reason });
    ElMessage.success('已拒绝并释放余额');
    rejectVisible.value = false;
    await fetchList();
  } finally {
    acting.value = false;
  }
}

function openMarkPaid(row: WithdrawalItem) {
  currentRow.value = row;
  markPaidForm.tradeNo = '';
  markPaidForm.remark = '';
  markPaidVisible.value = true;
}

async function submitMarkPaid() {
  if (!currentRow.value) return;
  acting.value = true;
  try {
    await withdrawalsApi.markWithdrawalPaid(currentRow.value.id, {
      tradeNo: markPaidForm.tradeNo.trim() || undefined,
      remark: markPaidForm.remark.trim() || undefined
    });
    ElMessage.success('已标记为已打款');
    markPaidVisible.value = false;
    await fetchList();
  } finally {
    acting.value = false;
  }
}

async function sync(row: WithdrawalItem) {
  acting.value = true;
  try {
    await withdrawalsApi.syncWithdrawal(row.id);
    ElMessage.success('已同步微信提现状态');
    await fetchList();
  } finally {
    acting.value = false;
  }
}

</script>

<style scoped>
.withdrawal-scope-alert { margin-bottom: 16px; }
.withdrawal-scope-alert__content { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.withdrawal-scope-alert__actions { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 8px; }
@media (max-width: 768px) { .withdrawal-scope-alert__content { align-items: flex-start; flex-direction: column; } }
</style>
