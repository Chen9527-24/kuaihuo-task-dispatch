<template>
  <div class="space-y-4">
    <PageToolbar title="H5成员" description="只展示通过成员邀请码加入团队的 H5 成员；团长本人请在团长管理查看。">
      <template #actions>
        <el-button type="warning" plain @click="openPhoneRelease">按手机号释放占用</el-button>
      </template>
      <el-form :model="filters" class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-10">
        <el-form-item label="关键词" class="!mb-0 md:col-span-2">
          <el-input v-model="filters.keyword" placeholder="手机号 / 姓名 / openid / 任务账号" clearable @keyup.enter="fetchList(true)" />
        </el-form-item>
        <el-form-item label="租户" class="!mb-0">
          <el-select v-model="filters.tenantId" :disabled="!canSelectTenant" filterable clearable placeholder="全部租户" @change="handleTenantChange">
            <el-option v-for="item in visibleTenantOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="团长" class="!mb-0 md:col-span-2">
          <el-select v-model="filters.leaderGroupId" :loading="leaderOptionsLoading" filterable clearable placeholder="全部团长">
            <el-option v-for="item in leaderOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="来源" class="!mb-0">
          <el-select v-model="filters.registerType" clearable placeholder="全部来源">
            <el-option label="服务号授权" value="WECHAT_MP" />
            <el-option label="手机号登录" value="PHONE" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态" class="!mb-0">
          <el-select v-model="filters.status" clearable placeholder="全部状态">
            <el-option label="正常" value="ENABLED" />
            <el-option label="受限" value="RESTRICTED" />
            <el-option label="禁用" value="DISABLED" />
          </el-select>
        </el-form-item>
        <el-form-item label="历史测试标记" class="!mb-0">
          <el-select v-model="filters.isTestData" clearable placeholder="全部账号">
            <el-option label="仅旧测试标记" value="true" />
            <el-option label="仅无旧测试标记" value="false" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作" class="!mb-0">
          <div class="flex gap-2">
            <el-button type="primary" @click="fetchList(true)">查询</el-button>
            <el-button @click="resetFilters">重置</el-button>
          </div>
        </el-form-item>
      </el-form>
    </PageToolbar>


    <CrudTablePanel title="成员列表" description="一条记录代表一个通过成员邀请码加入团队的 H5 成员主体；团长本人不会出现在此列表。">
      <el-table v-loading="loading" :data="items" row-key="id" stripe>
        <el-table-column type="index" label="#" width="60" />
        <el-table-column label="用户" min-width="220">
          <template #default="{ row }">
            <div class="flex items-center gap-3">
              <el-avatar :size="36" :src="row.avatarUrl || undefined">{{ avatarText(row) }}</el-avatar>
              <div class="min-w-0">
                <div class="flex items-center gap-1 truncate font-medium text-slate-900">
                  <span class="truncate">{{ row.nickname || '微信用户' }}</span>
                  <el-tag v-if="row.isTestData" size="small" type="warning" effect="plain">旧测试标记</el-tag>
                </div>
                <div class="truncate text-xs text-slate-500">{{ row.phone || '未绑定手机号' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="所属团长" min-width="180">
          <template #default="{ row }">
            <div v-if="rowDistributionLeaders(row).length" class="space-y-1">
              <div v-for="leader in rowDistributionLeaders(row)" :key="leaderKey(leader)" class="text-xs leading-5 text-slate-600">
                <div class="flex items-center gap-1">
                  <span class="truncate font-medium text-slate-800">{{ leader.leaderName || '未设置团长' }}</span>
                  <el-tag v-if="leader.groupName" size="small" type="success">{{ leader.groupName }}</el-tag>
                </div>
                <div class="truncate text-slate-500">{{ leader.maskedLeaderPhone || maskPhone(leader.leaderPhone) || '--' }}</div>
              </div>
            </div>
            <span v-else class="text-xs text-slate-400">未绑定团长</span>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="120">
          <template #default="{ row }"><el-tag :type="row.registerType === 'WECHAT_MP' ? 'success' : 'info'">{{ sourceLabel(row.registerType) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="所属租户" min-width="150">
          <template #default="{ row }">{{ row.tenant?.name || latestTenantName(row) || '--' }}</template>
        </el-table-column>
        <el-table-column label="任务账号" min-width="270">
          <template #default="{ row }">
            <div v-if="rowTaskAccounts(row).length" class="space-y-1.5">
              <div class="flex items-center gap-2">
                <el-tag size="small" type="success">{{ Number(row.activeTaskAccountCount || 0) }} 启用</el-tag>
                <el-tag v-if="Number(row.disabledTaskAccountCount || 0) > 0" size="small" type="info">{{ row.disabledTaskAccountCount }} 停用</el-tag>
              </div>
              <div v-for="account in rowTaskAccounts(row)" :key="account.id" class="truncate text-xs leading-5 text-slate-600">
                <el-tag v-if="account.isDefault" size="small" type="success" class="mr-1">默认</el-tag>
                <el-tag v-if="account.status === 'DISABLED'" size="small" type="info" class="mr-1">停用</el-tag>
                <span>{{ taskAccountText(account) }}</span>
              </div>
            </div>
            <span v-else class="text-xs text-slate-400">暂无任务账号</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }"><el-tag :type="statusType(row)">{{ statusLabel(row) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="完成/媒体账号" width="140">
          <template #default="{ row }">{{ row.totalCompletedOrders || 0 }} 单 / {{ row.counts?.mediaAccounts || 0 }} 个</template>
        </el-table-column>
        <el-table-column label="余额" width="120">
          <template #default="{ row }">¥{{ formatCent(row.balanceAmount) }}</template>
        </el-table-column>
        <el-table-column label="最近任务" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ latestTaskText(row) }}</template>
        </el-table-column>
        <el-table-column label="注册时间" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="最近登录" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.lastLoginAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="390" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
            <el-button link type="primary" @click="openEdit(row)">编辑主体</el-button>
            <el-button link type="warning" @click="openRestrict(row)">{{ isRestricted(row) ? '修改限制' : '限制' }}</el-button>
            <el-button v-if="isRestricted(row)" link type="success" @click="cancelRestrict(row)">取消限制</el-button>
            <el-button link type="warning" @click="resetAbandonCount(row)">重置放弃</el-button>
            <el-button link @click="toggleStatus(row)">{{ row.status === 'DISABLED' ? '启用' : '禁用' }}</el-button>
            <el-button link type="danger" @click="handleRemove(row)">删除主体</el-button>
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

    <el-drawer v-model="detailVisible" title="H5成员详情" size="860px">
      <div v-loading="detailLoading" class="space-y-4">
        <el-descriptions v-if="detailRow" :column="1" border>
          <el-descriptions-item label="用户ID">{{ detailRow.id }}</el-descriptions-item>
          <el-descriptions-item label="姓名/昵称">{{ detailRow.nickname || '--' }}</el-descriptions-item>
          <el-descriptions-item label="主体手机号">{{ detailRow.phone || '未绑定' }}</el-descriptions-item>
          <el-descriptions-item label="服务号 OpenID">{{ detailRow.serviceOpenid || '--' }}</el-descriptions-item>
          <el-descriptions-item label="UnionID">{{ detailRow.unionid || '--' }}</el-descriptions-item>
          <el-descriptions-item label="钱包余额">¥{{ formatCent(detailRow.balanceAmount) }}，累计结算 ¥{{ formatCent(detailRow.totalSettledAmount) }}，已提现 ¥{{ formatCent(detailRow.withdrawnAmount) }}</el-descriptions-item>
          <el-descriptions-item label="历史测试标记">
            <template v-if="detailRow.isTestData">旧标记已存在<span v-if="detailRow.testMarkedAt">（{{ formatDateTime(detailRow.testMarkedAt) }}）</span></template>
            <span v-else>无旧标记</span>
          </el-descriptions-item>
          <el-descriptions-item label="任务账号">{{ detailTaskAccountSummary.activeTaskAccountCount }} 个启用 / {{ detailTaskAccountSummary.taskAccountCount }} 个总数</el-descriptions-item>
          <el-descriptions-item label="限制原因">{{ detailRow.banReason || detailRow.resolvedStatus?.banReason || '--' }}</el-descriptions-item>
        </el-descriptions>

        <section v-if="detailRow" class="rounded-xl border border-slate-200 bg-white p-3">
          <div class="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 class="m-0 text-base font-semibold text-slate-900">任务账号列表</h3>
              <p class="m-0 mt-1 text-xs text-slate-500">这里管理同一用户主体下的全部任务账号；收益和提现仍汇总到用户主体。</p>
            </div>
            <el-tag type="success">默认：{{ taskAccountText(detailTaskAccountSummary.defaultTaskAccount) || '--' }}</el-tag>
          </div>
          <el-table :data="detailTaskAccounts" row-key="id" border size="small" empty-text="暂无任务账号">
            <el-table-column label="任务账号" min-width="190">
              <template #default="{ row }">
                <div class="font-medium text-slate-900">
                  {{ row.nickname || '--' }}
                  <el-tag v-if="row.isDefault" size="small" type="success">默认</el-tag>
                </div>
                <div class="text-xs text-slate-500">{{ row.maskedPhone || row.phone || '--' }}</div>
              </template>
            </el-table-column>
            <el-table-column label="分组/租户" min-width="180">
              <template #default="{ row }">
                <div>{{ row.group?.name || '--' }}</div>
                <div class="text-xs text-slate-500">{{ row.tenant?.name || '--' }}</div>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }"><el-tag :type="taskAccountStatusType(row)">{{ taskAccountStatusLabel(row) }}</el-tag></template>
            </el-table-column>
            <el-table-column label="任务统计" min-width="210">
              <template #default="{ row }">
                <div>进行 {{ row.stats?.currentOrders || 0 }} / 完成 {{ row.stats?.completedOrders || 0 }} / 放弃 {{ row.stats?.abandonedOrders || 0 }}</div>
                <div class="text-xs text-slate-500">结算 {{ row.stats?.settledOrders || 0 }} 单，收益 ¥{{ formatCent(row.stats?.settledAmount) }}，今日放弃 {{ row.stats?.todayAbandonCount || 0 }}</div>
              </template>
            </el-table-column>
            <el-table-column label="最近使用" width="150">
              <template #default="{ row }">{{ formatDateTime(row.stats?.latestUsedAt || row.updatedAt) }}</template>
            </el-table-column>
            <el-table-column label="创建时间" width="150">
              <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="250" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openTaskAccountEdit(row)">编辑</el-button>
                <el-button v-if="row.status === 'ENABLED' && !row.isDefault" link type="primary" @click="setDefaultTaskAccount(row)">设默认</el-button>
                <el-button link :type="row.status === 'DISABLED' ? 'success' : 'warning'" @click="toggleTaskAccountStatus(row)">{{ row.status === 'DISABLED' ? '启用' : '停用' }}</el-button>
                <el-button link type="danger" @click="handleReleaseTaskAccount(row)">释放占用</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>
      </div>
    </el-drawer>

    <el-dialog v-model="editVisible" title="编辑成员主体资料" width="420px">
      <el-form :model="editForm" label-width="90px">
        <el-form-item label="姓名/昵称"><el-input v-model="editForm.nickname" placeholder="请输入姓名/昵称" maxlength="80" show-word-limit /></el-form-item>
        <el-form-item label="手机号"><el-input v-model="editForm.phone" placeholder="请输入 11 位手机号" maxlength="11" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editing" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="taskAccountEditVisible" title="编辑任务账号" width="420px">
      <el-form :model="taskAccountEditForm" label-width="90px">
        <el-form-item label="账号昵称"><el-input v-model="taskAccountEditForm.nickname" placeholder="请输入任务账号昵称" maxlength="80" show-word-limit /></el-form-item>
        <el-form-item label="手机号"><el-input v-model="taskAccountEditForm.phone" placeholder="请输入 11 位手机号" maxlength="11" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="taskAccountEditVisible = false">取消</el-button>
        <el-button type="primary" :loading="taskAccountEditing" @click="submitTaskAccountEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="phoneReleaseVisible" title="按手机号释放任务账号占用" width="520px" @closed="resetPhoneRelease">
      <div class="space-y-4">
        <el-alert
          title="只处理你输入的一个手机号，不会批量释放全部成员，也不会删除 H5 成员主体。"
          type="warning"
          :closable="false"
          show-icon
        />
        <el-form label-width="90px">
          <el-form-item label="手机号" class="!mb-0">
            <div class="flex w-full gap-2">
              <el-input v-model="phoneReleaseForm.phone" placeholder="请输入被占用的 11 位手机号" maxlength="11" clearable @keyup.enter="checkPhoneOccupancy" />
              <el-button :loading="phoneReleaseChecking" @click="checkPhoneOccupancy">查询占用</el-button>
            </div>
          </el-form-item>
        </el-form>

        <el-descriptions v-if="phoneReleaseOccupancy" :column="1" border>
          <el-descriptions-item label="手机号">{{ phoneReleaseOccupancy.phone }}</el-descriptions-item>
          <el-descriptions-item label="占用状态">
            <el-tag :type="phoneReleaseOccupancy.occupied ? (phoneReleaseOccupancy.releasable ? 'warning' : 'danger') : 'success'">
              {{ phoneReleaseOccupancy.occupied ? (phoneReleaseOccupancy.releasable ? '已被任务账号占用' : '占用但不可在此释放') : '未被任务账号占用' }}
            </el-tag>
          </el-descriptions-item>
          <template v-if="phoneReleaseOccupancy.occupied">
            <el-descriptions-item label="当前任务账号">{{ phoneReleaseOccupancy.taskAccount?.nickname || '--' }} · {{ maskPhone(phoneReleaseOccupancy.taskAccount?.phone) || '--' }}</el-descriptions-item>
            <el-descriptions-item label="当前主体">{{ phoneReleaseOccupancy.owner?.nickname || phoneReleaseOccupancy.owner?.phone || phoneReleaseOccupancy.owner?.id || '--' }}</el-descriptions-item>
            <el-descriptions-item label="团队/租户">{{ phoneReleaseOccupancy.group?.name || '--' }} / {{ phoneReleaseOccupancy.tenant?.name || '--' }}</el-descriptions-item>
            <el-descriptions-item v-if="phoneReleaseOccupancy.blockingReason" label="不能释放原因">{{ phoneReleaseOccupancy.blockingReason }}</el-descriptions-item>
          </template>
        </el-descriptions>
      </div>
      <template #footer>
        <el-button @click="phoneReleaseVisible = false">取消</el-button>
        <el-button
          type="danger"
          :disabled="!phoneReleaseOccupancy?.occupied || !phoneReleaseOccupancy?.releasable"
          :loading="phoneReleasing"
          @click="submitPhoneRelease"
        >确认释放这个手机号</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="restrictVisible" :title="restrictDialogTitle" width="420px">
      <el-form :model="restrictForm" label-width="90px">
        <el-form-item label="限制天数" required><el-input-number v-model="restrictForm.days" :min="1" :max="365" /></el-form-item>
        <el-form-item label="限制原因" required><el-input v-model="restrictForm.reason" type="textarea" :rows="4" placeholder="请输入限制原因" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="restrictVisible = false">取消</el-button>
        <el-button type="primary" :loading="restricting" @click="submitRestrict">{{ isRestricted(currentRow || {}) ? '保存修改' : '确认限制' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as appUsersApi from '@/api/modules/appUsers';
import * as tenantsApi from '@/api/modules/tenants';
import * as groupsApi from '@/api/modules/distributionGroups';
import PageToolbar from '@/components/common/PageToolbar.vue';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import CrudTablePanel from '@/features/crud/components/CrudTablePanel.vue';
import { useRemoteTable } from '@/composables/useRemoteTable';
import { useAuthStore } from '@/stores/auth';
import type { AppUserDistributionLeader, AppUserItem, AppUserQuery, AppUserTaskAccount, AppUserTaskAccountSummary, TaskAccountPhoneOccupancy } from '@/api/modules/appUsers';
import type { DistributionGroupItem } from '@/api/modules/distributionGroups';
import type { SelectOption } from '@/utils/apiData';
import { formatDateTime } from '@/utils/format';

const EMPTY_TASK_ACCOUNT_SUMMARY: AppUserTaskAccountSummary = {
  taskAccountCount: 0,
  activeTaskAccountCount: 0,
  disabledTaskAccountCount: 0,
  defaultTaskAccount: null,
  taskAccounts: [],
  distributionLeaders: []
};

defineOptions({ name: 'AppUserManagementView' });

const authStore = useAuthStore();
const tenantOptions = ref<SelectOption[]>([]);
const leaderOptions = ref<SelectOption[]>([]);
const leaderOptionsLoading = ref(false);
const detailVisible = ref(false);
const detailLoading = ref(false);
const restrictVisible = ref(false);
const editVisible = ref(false);
const taskAccountEditVisible = ref(false);
const phoneReleaseVisible = ref(false);
const detailRow = ref<AppUserItem | null>(null);
const currentRow = ref<AppUserItem | null>(null);
const currentTaskAccount = ref<AppUserTaskAccount | null>(null);
const restricting = ref(false);
const editing = ref(false);
const taskAccountEditing = ref(false);
const phoneReleaseChecking = ref(false);
const phoneReleasing = ref(false);
const phoneReleaseOccupancy = ref<TaskAccountPhoneOccupancy | null>(null);
const restrictForm = reactive({ days: 7, reason: '' });
const editForm = reactive({ nickname: '', phone: '' });
const taskAccountEditForm = reactive({ nickname: '', phone: '' });
const phoneReleaseForm = reactive({ phone: '' });

const { items, filters, pagination, loading, fetchList } = useRemoteTable<AppUserItem, AppUserQuery>(
  { keyword: '', tenantId: '', leaderGroupId: '', memberOnly: 'true', status: '', registerType: '', isTestData: '', ids: '' },
  appUsersApi.listAppUsers,
  10
);

const canSelectTenant = computed(() => authStore.isPlatformAdmin);
const visibleTenantOptions = computed(() => {
  if (canSelectTenant.value) return tenantOptions.value;
  return authStore.tenantId ? [{ label: authStore.tenantName || '当前租户', value: authStore.tenantId }] : tenantOptions.value;
});
const detailTaskAccounts = computed(() => detailRow.value?.taskAccounts || []);
const detailTaskAccountSummary = computed<AppUserTaskAccountSummary>(() => detailRow.value?.taskAccountSummary || EMPTY_TASK_ACCOUNT_SUMMARY);
const restrictDialogTitle = computed(() => (isRestricted(currentRow.value) ? '修改限制' : '限制接单'));

onMounted(async () => {
  tenantOptions.value = await tenantsApi.getTenantOptions();
  applyDefaultTenantScope();
  await loadLeaderOptions();
  await fetchList(true);
});


function applyDefaultTenantScope() {
  if (!canSelectTenant.value && authStore.tenantId) filters.tenantId = authStore.tenantId;
}

async function resetFilters() {
  filters.keyword = '';
  filters.status = '';
  filters.registerType = '';
  filters.isTestData = '';
  filters.ids = '';
  filters.leaderGroupId = '';
  filters.tenantId = canSelectTenant.value ? '' : authStore.tenantId || '';
  await loadLeaderOptions();
  await fetchList(true);
}

async function handleTenantChange() {
  filters.leaderGroupId = '';
  await loadLeaderOptions();
}

async function loadLeaderOptions() {
  leaderOptionsLoading.value = true;
  try {
    const groups = await groupsApi.listDistributionGroupOptions({
      tenantId: filters.tenantId || undefined,
    });
    leaderOptions.value = groups.map((group) => ({
      value: group.id,
      label: leaderOptionLabel(group),
    }));
  } catch {
    leaderOptions.value = [];
  } finally {
    leaderOptionsLoading.value = false;
  }
}

function leaderOptionLabel(group: DistributionGroupItem) {
  const leaderName = String(group.leaderName || '').trim() || '未绑定团长';
  const leaderPhone = maskPhone(group.leaderPhone) || '--';
  const groupName = String(group.name || '').trim() || '未命名团长组';
  const tenantSuffix = !filters.tenantId && group.tenant?.name ? ` · ${group.tenant.name}` : '';
  const statusSuffix = group.status === 'ENABLED' ? '' : '（已停用）';
  return `${leaderName} · ${leaderPhone} · ${groupName}${tenantSuffix}${statusSuffix}`;
}

function avatarText(row: AppUserItem) {
  return String(row.nickname || row.phone || 'H5').slice(-2);
}

function sourceLabel(value?: string) {
  if (value === 'WECHAT_MP') return '服务号';
  if (value === 'PHONE') return '手机号';
  return '未知';
}

function statusLabel(row: AppUserItem) {
  if (row.status === 'DISABLED') return '禁用';
  if (row.resolvedStatus?.status === 'RESTRICTED') return '受限';
  return '正常';
}

function statusType(row: AppUserItem) {
  if (row.status === 'DISABLED') return 'danger';
  if (row.resolvedStatus?.status === 'RESTRICTED') return 'warning';
  return 'success';
}

function isRestricted(row?: Partial<AppUserItem> | null) {
  return row?.status !== 'DISABLED' && row?.resolvedStatus?.status === 'RESTRICTED';
}

function remainingRestrictDays(row: AppUserItem) {
  const until = row.resolvedStatus?.bannedUntil || row.bannedUntil;
  if (!until) return 7;
  const diff = new Date(until).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return 1;
  return Math.min(365, Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000))));
}

function taskAccountStatusLabel(row: AppUserTaskAccount) {
  return row.status === 'DISABLED' ? '停用' : '正常';
}

function taskAccountStatusType(row: AppUserTaskAccount) {
  return row.status === 'DISABLED' ? 'info' : 'success';
}

function formatCent(value: unknown) {
  return (Number(value || 0) / 100).toFixed(2);
}

function latestTenantName(row: AppUserItem) {
  return row.latestParticipant?.task?.tenant?.name || '';
}

function latestTaskText(row: AppUserItem) {
  const task = row.latestParticipant?.task;
  if (!task) return '--';
  const account = row.latestParticipant?.taskAccountNickname || row.latestParticipant?.taskAccountPhone;
  return `${task.title || '未命名任务'} / ${row.latestParticipant?.status || '-'}${account ? ` / ${account}` : ''}`;
}

function rowTaskAccounts(row: AppUserItem) {
  return row.taskAccounts || row.taskAccountSummary?.taskAccounts || (row.defaultTaskAccount ? [row.defaultTaskAccount] : []);
}

function maskPhone(value?: string | null) {
  const phone = String(value || '').replace(/[^0-9]/g, '').slice(0, 11);
  if (phone.length !== 11) return String(value || '');
  return `${phone.slice(0, 3)}****${phone.slice(7)}`;
}

function leaderKey(leader: AppUserDistributionLeader) {
  return [leader.groupId, leader.leaderUserId, leader.leaderTaskAccountId, leader.leaderPhone].filter(Boolean).join(':') || leader.groupName || 'leader';
}

function rowDistributionLeaders(row: AppUserItem): AppUserDistributionLeader[] {
  const direct = row.distributionLeaders || row.taskAccountSummary?.distributionLeaders || [];
  if (direct.length) return direct;
  const leaders: AppUserDistributionLeader[] = [];
  const seen = new Set<string>();
  for (const account of rowTaskAccounts(row)) {
    const group = account.group;
    const leader = account.leader || (group ? {
      groupId: group.id,
      groupName: group.name,
      leaderName: group.leaderName || null,
      leaderPhone: group.leaderPhone || null,
      maskedLeaderPhone: maskPhone(group.leaderPhone),
    } : null);
    if (!leader) continue;
    const key = leaderKey(leader);
    if (seen.has(key)) continue;
    seen.add(key);
    leaders.push(leader);
  }
  return leaders;
}

function taskAccountText(account?: AppUserTaskAccount | null) {
  if (!account) return '';
  return [account.nickname, account.maskedPhone || account.phone].filter(Boolean).join(' · ');
}

async function reloadDetail() {
  const id = detailRow.value?.id || currentRow.value?.id;
  if (!id) return;
  detailLoading.value = true;
  try {
    detailRow.value = await appUsersApi.getAppUserDetail(id);
  } finally {
    detailLoading.value = false;
  }
}

async function reloadAll() {
  await fetchList();
  if (detailVisible.value) await reloadDetail();
}

async function openDetail(row: AppUserItem) {
  currentRow.value = row;
  detailRow.value = row;
  detailVisible.value = true;
  await reloadDetail();
}

function openEdit(row: AppUserItem) {
  currentRow.value = row;
  editForm.nickname = row.nickname || '';
  editForm.phone = row.phone || '';
  editVisible.value = true;
}

async function submitEdit() {
  if (!currentRow.value) return;
  const phone = String(editForm.phone || '').replace(/[^0-9]/g, '');
  const nickname = String(editForm.nickname || '').trim();
  if (!nickname) {
    ElMessage.warning('请输入姓名/昵称');
    return;
  }
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    ElMessage.warning('手机号格式不正确');
    return;
  }
  editing.value = true;
  try {
    await appUsersApi.updateAppUserProfile(currentRow.value.id, { nickname, phone });
    ElMessage.success('成员主体资料已更新');
    editVisible.value = false;
    await reloadAll();
  } finally {
    editing.value = false;
  }
}

function openTaskAccountEdit(row: AppUserTaskAccount) {
  currentTaskAccount.value = row;
  taskAccountEditForm.nickname = row.nickname || '';
  taskAccountEditForm.phone = row.phone || '';
  taskAccountEditVisible.value = true;
}

async function submitTaskAccountEdit() {
  if (!detailRow.value || !currentTaskAccount.value) return;
  const phone = String(taskAccountEditForm.phone || '').replace(/[^0-9]/g, '');
  const nickname = String(taskAccountEditForm.nickname || '').trim();
  if (!nickname) {
    ElMessage.warning('请输入任务账号昵称');
    return;
  }
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    ElMessage.warning('任务账号手机号格式不正确');
    return;
  }
  taskAccountEditing.value = true;
  try {
    await appUsersApi.updateAppUserTaskAccount(detailRow.value.id, currentTaskAccount.value.id, { nickname, phone });
    ElMessage.success('任务账号已更新');
    taskAccountEditVisible.value = false;
    await reloadAll();
  } finally {
    taskAccountEditing.value = false;
  }
}

function normalizePhoneInput(value: unknown) {
  return String(value || '').replace(/[^0-9]/g, '').slice(0, 11);
}

function openPhoneRelease() {
  resetPhoneRelease();
  phoneReleaseVisible.value = true;
}

function resetPhoneRelease() {
  phoneReleaseForm.phone = '';
  phoneReleaseOccupancy.value = null;
  phoneReleaseChecking.value = false;
  phoneReleasing.value = false;
}

async function checkPhoneOccupancy() {
  const phone = normalizePhoneInput(phoneReleaseForm.phone);
  phoneReleaseForm.phone = phone;
  phoneReleaseOccupancy.value = null;
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    ElMessage.warning('请输入有效的 11 位手机号');
    return;
  }
  phoneReleaseChecking.value = true;
  try {
    phoneReleaseOccupancy.value = await appUsersApi.getTaskAccountPhoneOccupancy(phone);
    if (!phoneReleaseOccupancy.value.occupied) {
      ElMessage.success('该手机号当前没有任务账号占用');
    }
  } finally {
    phoneReleaseChecking.value = false;
  }
}

async function submitPhoneRelease() {
  const occupancy = phoneReleaseOccupancy.value;
  if (!occupancy?.occupied || !occupancy.releasable) return;
  const phone = occupancy.phone;
  await ElMessageBox.confirm(
    `确认只释放手机号 ${maskPhone(phone)} 的任务账号占用？该操作会删除当前任务账号记录，但不会删除 H5 成员主体，历史任务快照仍保留。`,
    '释放手机号占用',
    { type: 'warning', confirmButtonText: '确认释放', cancelButtonText: '取消' },
  );
  phoneReleasing.value = true;
  try {
    await appUsersApi.releaseTaskAccountPhone(phone);
    ElMessage.success(`手机号 ${maskPhone(phone)} 的任务账号占用已释放`);
    phoneReleaseVisible.value = false;
    await reloadAll();
  } finally {
    phoneReleasing.value = false;
  }
}

async function resetAbandonCount(row: AppUserItem) {
  await ElMessageBox.confirm(`确认重置成员「${row.nickname || row.phone || row.id}」今日放弃次数？`, '重置确认', { type: 'warning' });
  await appUsersApi.resetAppUserAbandonCount(row.id);
  ElMessage.success('今日放弃次数已重置');
  await fetchList();
}

function openRestrict(row: AppUserItem) {
  currentRow.value = row;
  restrictForm.days = isRestricted(row) ? remainingRestrictDays(row) : 7;
  restrictForm.reason = isRestricted(row) ? String(row.resolvedStatus?.banReason || row.banReason || '') : '';
  restrictVisible.value = true;
}

async function submitRestrict() {
  if (!currentRow.value) return;
  if (!restrictForm.reason.trim()) {
    ElMessage.warning('请输入限制原因');
    return;
  }
  restricting.value = true;
  try {
    await appUsersApi.restrictAppUser(currentRow.value.id, { days: restrictForm.days, reason: restrictForm.reason.trim() });
    ElMessage.success(isRestricted(currentRow.value) ? '限制信息已更新' : '已限制该用户接单');
    restrictVisible.value = false;
    await fetchList();
  } finally {
    restricting.value = false;
  }
}

async function cancelRestrict(row: AppUserItem) {
  await ElMessageBox.confirm(`确认取消成员「${row.nickname || row.phone || row.id}」的接单限制？`, '取消限制', { type: 'warning' });
  await appUsersApi.cancelAppUserRestriction(row.id);
  ElMessage.success('已取消接单限制');
  await fetchList();
}

async function toggleStatus(row: AppUserItem) {
  const nextStatus = row.status === 'DISABLED' ? 'ENABLED' : 'DISABLED';
  await appUsersApi.updateAppUserStatus(row.id, nextStatus);
  ElMessage.success(nextStatus === 'ENABLED' ? '成员已启用' : '成员已禁用');
  await fetchList();
}

async function setDefaultTaskAccount(row: AppUserTaskAccount) {
  if (!detailRow.value) return;
  await appUsersApi.setDefaultAppUserTaskAccount(detailRow.value.id, row.id);
  ElMessage.success('默认任务账号已更新');
  await reloadAll();
}

async function toggleTaskAccountStatus(row: AppUserTaskAccount) {
  if (!detailRow.value) return;
  const nextStatus = row.status === 'DISABLED' ? 'ENABLED' : 'DISABLED';
  if (nextStatus === 'DISABLED') {
    await ElMessageBox.confirm(`确认停用任务账号「${row.nickname || row.maskedPhone || row.id}」？停用后该任务账号不能继续接单。`, '停用确认', { type: 'warning' });
  }
  await appUsersApi.updateAppUserTaskAccountStatus(detailRow.value.id, row.id, nextStatus);
  ElMessage.success(nextStatus === 'ENABLED' ? '任务账号已启用' : '任务账号已停用');
  await reloadAll();
}

async function handleReleaseTaskAccount(row: AppUserTaskAccount) {
  if (!detailRow.value) return;
  await ElMessageBox.confirm(`确认释放任务账号「${row.nickname || row.maskedPhone || row.id}」的手机号占用？该操作会删除这条任务账号记录，历史任务记录仍保留快照；不会删除 H5 成员主体。`, '释放任务账号占用', { type: 'warning' });
  await appUsersApi.removeAppUserTaskAccount(detailRow.value.id, row.id);
  ElMessage.success('该任务账号的手机号占用已释放');
  await reloadAll();
}

async function handleRemove(row: AppUserItem) {
  await ElMessageBox.confirm(`确认删除成员主体「${row.nickname || row.phone || row.id}」？该操作会停用该成员主体。`, '删除确认', { type: 'warning' });
  await appUsersApi.removeAppUser(row.id);
  ElMessage.success('成员主体已删除');
  await fetchList();
}
</script>
