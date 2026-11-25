<template>
  <div class="space-y-4">
    <PageToolbar title="团长管理" description="团队与团长身份管理。分佣只在创建具体的“指定团队任务”时配置并冻结。">
      <el-form :model="filters" class="grid grid-cols-1 gap-4 md:grid-cols-4">
        <el-form-item label="租户" class="!mb-0">
          <el-select v-model="filters.tenantId" clearable filterable placeholder="全部租户">
            <el-option v-for="item in tenantOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键词" class="!mb-0">
          <el-input v-model="filters.keyword" :placeholder="activeTab === 'applications' ? '申请人、手机号或团队名称' : activeTab === 'commissions' ? '团长、成员或任务名称' : '团队、团长或邀请码'" clearable @keyup.enter="reload(true)" />
        </el-form-item>
        <el-form-item v-if="activeTab === 'applications'" label="申请状态" class="!mb-0">
          <el-select v-model="filters.applicationStatus" clearable placeholder="全部状态">
            <el-option label="待审核" value="PENDING" />
            <el-option label="已通过" value="APPROVED" />
            <el-option label="已驳回" value="REJECTED" />
          </el-select>
        </el-form-item>
        <el-form-item v-else-if="activeTab === 'groups'" label="档案范围" class="!mb-0">
          <el-switch v-model="filters.includeDeleted" active-text="含已删除" inactive-text="正常档案" />
        </el-form-item>
        <el-form-item label="操作" class="!mb-0">
          <div class="flex gap-2"><el-button type="primary" @click="reload(true)">查询</el-button><el-button @click="resetFilters">重置</el-button></div>
        </el-form-item>
      </el-form>
      <template #actions><el-button v-if="activeTab === 'groups'" type="primary" @click="openCreate">新增团长</el-button></template>
    </PageToolbar>

    <el-alert type="info" :closable="false" title="团队负责成员归属与指定团队任务投放；团长档案不再配置默认分佣。分佣规则在任务内设置。" />

    <el-tabs v-model="activeTab" @tab-change="reload(true)">
      <el-tab-pane label="团长列表" name="groups">
        <CrudTablePanel title="团长与团队" description="PC 新增用于创建待绑定团队；H5 申请审核通过后最终生成完全相同的团队与团长身份。">
          <el-table v-loading="groupsLoading" :data="groups" row-key="id" stripe>
            <el-table-column label="团队" min-width="190">
              <template #default="{ row }"><div class="font-medium">{{ row.name }}</div><div class="text-xs text-slate-500">{{ row.tenant?.name || tenantName(row.tenantId) }}</div></template>
            </el-table-column>
            <el-table-column label="团长" min-width="160">
              <template #default="{ row }"><div>{{ row.leaderName || '待绑定 H5 用户' }}</div><div class="text-xs text-slate-500">{{ row.leaderPhone || '--' }}</div></template>
            </el-table-column>
            <el-table-column label="成员邀请码" min-width="178">
              <template #default="{ row }"><code>{{ row.memberInviteCode }}</code><el-button link type="primary" @click="copyText(row.memberInviteCode, '成员邀请码')">复制</el-button></template>
            </el-table-column>
            <el-table-column label="团长身份码" min-width="178">
              <template #default="{ row }"><code>{{ row.leaderBindCode }}</code><el-button link type="primary" @click="copyText(row.leaderBindCode, '团长身份码')">复制</el-button></template>
            </el-table-column>
            <el-table-column label="成员/任务" width="110"><template #default="{ row }">{{ row.memberCount || 0 }} / {{ row.taskCount || 0 }}</template></el-table-column>
            <el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="groupTagType(row)">{{ groupStatusLabel(row) }}</el-tag></template></el-table-column>
            <el-table-column label="操作" fixed="right" width="390">
              <template #default="{ row }">
                <el-button v-if="canBind(row)" link type="primary" @click="bindLeader(row)">绑定团长</el-button>
                <el-button v-if="canOperate(row)" link type="primary" @click="openInviteLink(row, 'member')">成员链接</el-button>
                <el-button v-if="canOperate(row)" link @click="openInviteLink(row, 'leader')">身份链接</el-button>
                <el-button v-if="canOperate(row)" link type="warning" @click="toggleGroup(row)">{{ row.status === 'ENABLED' ? '停用' : '启用' }}</el-button>
                <el-button v-if="canUnbind(row)" link type="warning" @click="openUnbind(row)">解绑团长</el-button>
                <el-button v-if="canDelete(row)" link type="danger" @click="deleteGroup(row)">删除档案</el-button>
              </template>
            </el-table-column>
          </el-table>
          <template #footer><CrudPaginationBar :current-page="groupPage.page" :page-size="groupPage.pageSize" :total="groupPage.total" @update:current-page="groupPage.page = $event; fetchGroups()" @update:page-size="groupPage.pageSize = $event; fetchGroups(true)" /></template>
        </CrudTablePanel>
      </el-tab-pane>

      <el-tab-pane label="团长申请" name="applications">
        <CrudTablePanel title="H5 团长申请" description="审核通过时，后台使用与“PC 绑定团长”相同的统一事务：结束旧成员关系、建立新团队、绑定团长身份并生成邀请码。">
          <el-table v-loading="applicationLoading" :data="applications" row-key="id" stripe>
            <el-table-column label="申请人" min-width="160"><template #default="{ row }"><div class="font-medium">{{ row.appUser?.nickname || '未命名用户' }}</div><div class="text-xs text-slate-500">{{ row.appUser?.phone || row.contactPhone || '--' }}</div></template></el-table-column>
            <el-table-column label="原团队" min-width="140"><template #default="{ row }">{{ row.currentGroup?.name || '--' }}</template></el-table-column>
            <el-table-column label="申请团队" min-width="170"><template #default="{ row }">{{ row.requestedGroupName }}</template></el-table-column>
            <el-table-column label="申请说明" min-width="230" show-overflow-tooltip><template #default="{ row }">{{ row.reason || '--' }}</template></el-table-column>
            <el-table-column label="规则确认" width="105"><template #default="{ row }"><el-tag :type="row.agreedToLeaderRules ? 'success' : 'info'">{{ row.agreedToLeaderRules ? '已确认' : '旧申请' }}</el-tag></template></el-table-column>
            <el-table-column label="状态" width="105"><template #default="{ row }"><el-tag :type="applicationTagType(row.status)">{{ applicationStatusLabel(row.status) }}</el-tag></template></el-table-column>
            <el-table-column label="申请时间" width="170"><template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template></el-table-column>
            <el-table-column label="操作" fixed="right" width="145"><template #default="{ row }"><template v-if="row.status === 'PENDING'"><el-button link type="success" @click="approveApplication(row)">通过</el-button><el-button link type="danger" @click="rejectApplication(row)">驳回</el-button></template><span v-else class="text-slate-400">--</span></template></el-table-column>
          </el-table>
          <template #footer><CrudPaginationBar :current-page="applicationPage.page" :page-size="applicationPage.pageSize" :total="applicationPage.total" @update:current-page="applicationPage.page = $event; fetchApplications()" @update:page-size="applicationPage.pageSize = $event; fetchApplications(true)" /></template>
        </CrudTablePanel>
      </el-tab-pane>

      <el-tab-pane label="佣金明细" name="commissions">
        <CrudTablePanel title="团长佣金明细" description="佣金来自任务发布时保存的任务级快照；修改团长档案不会影响历史任务。">
          <el-table v-loading="commissionLoading" :data="commissions" row-key="id" stripe>
            <el-table-column label="团长" min-width="150"><template #default="{ row }">{{ row.leader?.nickname || row.leader?.phone || '--' }}</template></el-table-column>
            <el-table-column label="成员" min-width="150"><template #default="{ row }">{{ row.worker?.nickname || row.worker?.phone || '--' }}</template></el-table-column>
            <el-table-column label="团队" min-width="160"><template #default="{ row }">{{ row.group?.name || '--' }}</template></el-table-column>
            <el-table-column label="来源任务" min-width="200" show-overflow-tooltip><template #default="{ row }">{{ row.task?.title || '--' }}</template></el-table-column>
            <el-table-column label="成员收益" width="120"><template #default="{ row }">{{ money(row.workerRewardAmount) }}</template></el-table-column>
            <el-table-column label="团长佣金" width="120"><template #default="{ row }"><strong class="text-emerald-600">{{ money(row.commissionAmount) }}</strong></template></el-table-column>
            <el-table-column label="承担方式" width="120"><template #default="{ row }">{{ row.commissionMode === 'INCLUDED' ? '金额内包含' : '金额外另计' }}</template></el-table-column>
            <el-table-column label="结算时间" width="170"><template #default="{ row }">{{ formatDateTime(row.settledAt || row.createdAt) }}</template></el-table-column>
          </el-table>
          <template #footer><CrudPaginationBar :current-page="commissionPage.page" :page-size="commissionPage.pageSize" :total="commissionPage.total" @update:current-page="commissionPage.page = $event; fetchCommissions()" @update:page-size="commissionPage.pageSize = $event; fetchCommissions(true)" /></template>
        </CrudTablePanel>
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="inviteDialog.visible"
      :title="inviteDialog.title"
      width="680px"
      append-to-body
      destroy-on-close
      :close-on-click-modal="false"
    >
      <el-alert
        v-if="inviteDialog.isAbsoluteUrl"
        type="info"
        :closable="false"
        title="请将完整链接发送给对应人员。首次打开后会进入 H5 登录并完成团队成员/团长身份绑定。"
        class="mb-4"
      />
      <el-alert
        v-else
        type="warning"
        :closable="false"
        title="后端没有返回完整 H5 访问地址，当前无法生成可直接打开的邀请链接。请先配置 H5_BASE_URL，再刷新团队列表。邀请码/身份码仍可单独复制。"
        class="mb-4"
      />

      <el-form label-width="104px">
        <el-form-item :label="inviteDialog.codeLabel">
          <div class="flex w-full items-center gap-2">
            <el-input :model-value="inviteDialog.code" readonly />
            <el-button type="primary" @click="copyText(inviteDialog.code, inviteDialog.codeLabel)">复制</el-button>
          </div>
        </el-form-item>

        <el-form-item label="完整链接">
          <div class="w-full">
            <el-input
              :model-value="inviteDialog.url || '当前未生成完整 H5 链接'"
              readonly
              type="textarea"
              :rows="3"
            />
            <div class="mt-2 flex gap-2">
              <el-button
                type="primary"
                :disabled="!inviteDialog.isAbsoluteUrl"
                @click="copyText(inviteDialog.url, inviteDialog.linkLabel)"
              >
                复制链接
              </el-button>
              <el-button
                :disabled="!inviteDialog.isAbsoluteUrl"
                @click="openInviteUrl"
              >
                在新窗口打开
              </el-button>
            </div>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="inviteDialog.visible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="createVisible" title="新增团长团队" width="760px" destroy-on-close>
      <el-alert type="info" :closable="false" title="此处只创建团队与邀请码/身份码。团长佣金不在团队档案配置，而在创建“指定团队任务”时单独设置。" class="mb-4" />
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="108px">
        <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
          <el-form-item label="所属租户" prop="tenantId"><el-select v-model="createForm.tenantId" filterable class="w-full"><el-option v-for="item in tenantOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
          <el-form-item label="团队名称" prop="name"><el-input v-model="createForm.name" maxlength="100" placeholder="例如：华东任务团队" /></el-form-item>
          <el-form-item label="联系人"><el-input v-model="createForm.leaderName" placeholder="可空，绑定 H5 团长后自动更新" /></el-form-item>
          <el-form-item label="手机号"><el-input v-model="createForm.leaderPhone" placeholder="可空，绑定 H5 团长后自动更新" /></el-form-item>
          <el-form-item label="备注" class="md:col-span-2"><el-input v-model="createForm.remark" type="textarea" :rows="3" maxlength="500" show-word-limit /></el-form-item>
        </div>
      </el-form>
      <template #footer><el-button @click="createVisible = false">取消</el-button><el-button type="primary" :loading="createSubmitting" @click="submitCreate">保存团队</el-button></template>
    </el-dialog>

    <el-dialog v-model="unbindVisible" title="解绑团长" width="760px" destroy-on-close>
      <template v-if="unbindTarget && unbindCheck">
        <el-alert type="warning" :closable="false" title="解绑只解除当前团队关系，不删除历史任务、订单、佣金和流水。存在未收口订单时，必须先完成或关闭相关业务。" class="mb-4" />
        <div class="grid grid-cols-2 gap-3 mb-4 text-center"><div class="summary-item"><span>当前成员</span><strong>{{ unbindCheck.activeMemberCount }}</strong></div><div class="summary-item"><span>阻断订单</span><strong :class="{ 'text-rose-600': unbindCheck.inFlightOrderCount }">{{ unbindCheck.inFlightOrderCount }}</strong></div></div>
        <el-table v-if="unbindCheck.inFlightOrders?.length" :data="unbindCheck.inFlightOrders" size="small" max-height="200" class="mb-4"><el-table-column prop="taskTitle" label="关联任务" min-width="180"/><el-table-column prop="participantLabel" label="成员" min-width="120"/><el-table-column prop="status" label="订单状态" width="110"/><el-table-column prop="settlementStatus" label="结算状态" width="110"/></el-table>
        <el-form :model="unbindForm" label-width="108px">
          <el-form-item label="成员处理"><el-radio-group v-model="unbindForm.memberHandling"><el-radio label="UNBIND_ALL">全部解绑为未加入团队</el-radio><el-radio label="TRANSFER_TO_GROUP">转移给另一团队</el-radio></el-radio-group></el-form-item>
          <el-form-item v-if="unbindForm.memberHandling === 'TRANSFER_TO_GROUP'" label="目标团队"><el-select v-model="unbindForm.targetGroupId" filterable class="w-full"><el-option v-for="item in groupChoices" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
          <el-form-item v-if="unbindCheck.unclaimedTaskCount" label="未领取任务"><el-checkbox v-model="unbindForm.stopUnclaimedTasks">停止 {{ unbindCheck.unclaimedTaskCount }} 个未领取任务</el-checkbox></el-form-item>
          <el-form-item label="解绑原因"><el-input v-model="unbindForm.reason" type="textarea" :rows="2" maxlength="255" /></el-form-item>
        </el-form>
      </template>
      <template #footer><el-button @click="unbindVisible = false">取消</el-button><el-button type="warning" :disabled="!unbindCheck?.canUnbind" :loading="unbindSubmitting" @click="submitUnbind">确认解绑</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import PageToolbar from '@/components/common/PageToolbar.vue';
import CrudTablePanel from '@/features/crud/components/CrudTablePanel.vue';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import * as groupsApi from '@/api/modules/distributionGroups';
import * as tenantsApi from '@/api/modules/tenants';
import type { SelectOption } from '@/utils/apiData';
import { formatDateTime } from '@/utils/format';

type TabKey = 'groups' | 'applications' | 'commissions';
const activeTab = ref<TabKey>('groups');
const tenantOptions = ref<SelectOption[]>([]);
const filters = reactive({ tenantId: '', keyword: '', applicationStatus: '', includeDeleted: false });
const groups = ref<groupsApi.DistributionGroupItem[]>([]);
const applications = ref<groupsApi.DistributionLeaderApplicationItem[]>([]);
const commissions = ref<groupsApi.LeaderCommissionSettlementItem[]>([]);
const groupsLoading = ref(false);
const applicationLoading = ref(false);
const commissionLoading = ref(false);
const groupPage = reactive({ page: 1, pageSize: 10, total: 0 });
const applicationPage = reactive({ page: 1, pageSize: 10, total: 0 });
const commissionPage = reactive({ page: 1, pageSize: 10, total: 0 });

const createVisible = ref(false);
const createSubmitting = ref(false);
const createFormRef = ref<FormInstance>();
const createForm = reactive({ tenantId: '', name: '', leaderName: '', leaderPhone: '', remark: '' });
const createRules: FormRules = { tenantId: [{ required: true, message: '请选择租户', trigger: 'change' }], name: [{ required: true, message: '请输入团队名称', trigger: 'blur' }] };

const unbindVisible = ref(false);
const unbindSubmitting = ref(false);
const unbindTarget = ref<groupsApi.DistributionGroupItem | null>(null);
const unbindCheck = ref<groupsApi.DistributionGroupUnbindCheck | null>(null);
const unbindForm = reactive<{ memberHandling: 'UNBIND_ALL' | 'TRANSFER_TO_GROUP'; targetGroupId: string; stopUnclaimedTasks: boolean; reason: string }>({ memberHandling: 'UNBIND_ALL', targetGroupId: '', stopUnclaimedTasks: false, reason: '' });
const groupChoices = ref<groupsApi.DistributionGroupItem[]>([]);

const inviteDialog = reactive({
  visible: false,
  title: '',
  code: '',
  codeLabel: '',
  url: '',
  linkLabel: '',
  isAbsoluteUrl: false,
});

onMounted(async () => { tenantOptions.value = await tenantsApi.getTenantOptions(); await reload(true); });
watch(activeTab, () => { void reload(true); });

async function reload(reset = false) {
  if (activeTab.value === 'groups') return fetchGroups(reset);
  if (activeTab.value === 'applications') return fetchApplications(reset);
  return fetchCommissions(reset);
}
async function fetchGroups(reset = false) {
  if (reset) groupPage.page = 1;
  groupsLoading.value = true;
  try {
    const page = await groupsApi.listDistributionGroups({ tenantId: filters.tenantId || undefined, keyword: filters.keyword || undefined, includeDeleted: filters.includeDeleted || undefined, page: groupPage.page, pageSize: groupPage.pageSize });
    groups.value = page.items; groupPage.total = page.total;
  } finally { groupsLoading.value = false; }
}
async function fetchApplications(reset = false) {
  if (reset) applicationPage.page = 1;
  applicationLoading.value = true;
  try { const page = await groupsApi.listDistributionLeaderApplications({ tenantId: filters.tenantId || undefined, keyword: filters.keyword || undefined, status: filters.applicationStatus || undefined, page: applicationPage.page, pageSize: applicationPage.pageSize }); applications.value = page.items; applicationPage.total = page.total; } finally { applicationLoading.value = false; }
}
async function fetchCommissions(reset = false) {
  if (reset) commissionPage.page = 1;
  commissionLoading.value = true;
  try { const page = await groupsApi.listLeaderCommissionSettlements({ tenantId: filters.tenantId || undefined, keyword: filters.keyword || undefined, page: commissionPage.page, pageSize: commissionPage.pageSize }); commissions.value = page.items; commissionPage.total = page.total; } finally { commissionLoading.value = false; }
}
function resetFilters() { filters.tenantId = ''; filters.keyword = ''; filters.applicationStatus = ''; filters.includeDeleted = false; void reload(true); }
function tenantName(id: string) { return tenantOptions.value.find((item) => item.value === id)?.label || '--'; }
function money(value: unknown) { return `¥${(Number(value || 0) / 100).toFixed(2)}`; }
function groupStatusLabel(row: groupsApi.DistributionGroupItem) { if (row.deletedAt || row.status === 'DELETED') return '已删除'; if (row.status === 'UNBOUND') return '已解绑'; if (row.status === 'DISABLED') return '已停用'; return row.status === 'ENABLED' ? '启用' : row.status || '--'; }
function groupTagType(row: groupsApi.DistributionGroupItem) { const status = groupStatusLabel(row); return status === '启用' ? 'success' : status === '已删除' ? 'danger' : 'info'; }
function applicationStatusLabel(status: string) { return status === 'PENDING' ? '待审核' : status === 'APPROVED' ? '已通过' : status === 'REJECTED' ? '已驳回' : status || '--'; }
function applicationTagType(status: string) { return status === 'PENDING' ? 'warning' : status === 'APPROVED' ? 'success' : status === 'REJECTED' ? 'danger' : 'info'; }
function canOperate(row: groupsApi.DistributionGroupItem) { return !row.deletedAt && ['ENABLED', 'DISABLED'].includes(String(row.status)); }
function canBind(row: groupsApi.DistributionGroupItem) { return canOperate(row) && !row.leaderUserId; }
function canUnbind(row: groupsApi.DistributionGroupItem) { return canOperate(row) && Boolean(row.leaderUserId); }
function canDelete(row: groupsApi.DistributionGroupItem) { return !row.deletedAt && String(row.status) === 'UNBOUND' && Number(row.memberCount || 0) === 0; }
function normalizeCopyText(value: unknown) {
  return String(value ?? '').trim();
}

async function copyText(value: unknown, label = '内容') {
  const text = normalizeCopyText(value);
  if (!text) {
    ElMessage.warning(`${label}为空，暂时无法复制`);
    return;
  }

  if (await tryWriteClipboard(text)) {
    ElMessage.success(`${label}已复制`);
    return;
  }

  try {
    await ElMessageBox.prompt('当前浏览器未授予剪贴板权限。请在下方文本框中手动全选并复制。', `复制${label}`, {
      inputValue: text,
      inputType: 'textarea',
      inputPlaceholder: `请复制${label}`,
      confirmButtonText: '我已复制',
      cancelButtonText: '关闭',
      closeOnClickModal: false,
      closeOnPressEscape: true,
      inputValidator: () => true,
    });
  } catch {
    // The user closed the manual-copy dialog. No state or business data changed.
  }
}

async function tryWriteClipboard(text: string) {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy copy path for denied clipboard permissions.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.cssText = [
    'position:fixed',
    'left:-9999px',
    'top:0',
    'width:1px',
    'height:1px',
    'padding:0',
    'border:0',
    'opacity:0',
    'pointer-events:none',
  ].join(';');

  document.body.appendChild(textarea);
  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

function isAbsoluteHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

async function openInviteLink(row: groupsApi.DistributionGroupItem, type: 'member' | 'leader') {
  const isMember = type === 'member';
  const rawUrl = normalizeCopyText(isMember ? row.memberInviteUrl : row.leaderBindUrl);
  const code = normalizeCopyText(isMember ? row.memberInviteCode : row.leaderBindCode);

  Object.assign(inviteDialog, {
    visible: true,
    title: isMember ? '成员邀请链接' : '团长身份链接',
    code,
    codeLabel: isMember ? '成员邀请码' : '团长身份码',
    url: rawUrl,
    linkLabel: isMember ? '成员邀请链接' : '团长身份链接',
    isAbsoluteUrl: isAbsoluteHttpUrl(rawUrl),
  });

  await nextTick();
}

function openInviteUrl() {
  if (!inviteDialog.isAbsoluteUrl || !inviteDialog.url) {
    ElMessage.warning('当前没有可直接打开的完整 H5 链接');
    return;
  }

  window.open(inviteDialog.url, '_blank', 'noopener,noreferrer');
}

function openCreate() { Object.assign(createForm, { tenantId: filters.tenantId || '', name: '', leaderName: '', leaderPhone: '', remark: '' }); createVisible.value = true; }
async function submitCreate() { await createFormRef.value?.validate(); createSubmitting.value = true; try { await groupsApi.createDistributionGroup({ ...createForm }); ElMessage.success('团队已创建，可使用团长身份码绑定指定 H5 用户'); createVisible.value = false; await fetchGroups(); } finally { createSubmitting.value = false; } }
async function bindLeader(row: groupsApi.DistributionGroupItem) { const { value } = await ElMessageBox.prompt(`请输入要绑定为“${row.name}”团长的 H5 用户手机号。绑定成功后身份码会自动轮换，不能覆盖已绑定团长。`, '绑定团长', { inputPattern: /^1[3-9]\d{9}$/, inputErrorMessage: '请输入有效手机号' }); await groupsApi.bindDistributionGroupLeader(row.id, String(value).trim()); ElMessage.success('团长身份已绑定'); await fetchGroups(); }
async function toggleGroup(row: groupsApi.DistributionGroupItem) { if (row.status === 'ENABLED') { await ElMessageBox.confirm(`确认停用团队“${row.name}”？停用后不能被新任务选择或接收新成员。`, '停用确认', { type: 'warning' }); await groupsApi.disableDistributionGroup(row.id); } else { await groupsApi.enableDistributionGroup(row.id); } ElMessage.success(row.status === 'ENABLED' ? '团队已停用' : '团队已启用'); await fetchGroups(); }
async function openUnbind(row: groupsApi.DistributionGroupItem) { unbindTarget.value = row; unbindForm.memberHandling = 'UNBIND_ALL'; unbindForm.targetGroupId = ''; unbindForm.stopUnclaimedTasks = false; unbindForm.reason = ''; const [check, options] = await Promise.all([groupsApi.getDistributionGroupUnbindCheck(row.id), groupsApi.listDistributionGroups({ tenantId: row.tenantId, page: 1, pageSize: 500 })]); unbindCheck.value = check; groupChoices.value = options.items.filter((item) => item.id !== row.id && item.status === 'ENABLED' && !item.deletedAt); unbindVisible.value = true; }
async function submitUnbind() { const target = unbindTarget.value; const check = unbindCheck.value; if (!target || !check?.canUnbind) return; if (unbindForm.memberHandling === 'TRANSFER_TO_GROUP' && !unbindForm.targetGroupId) { ElMessage.warning('请选择目标团队'); return; } unbindSubmitting.value = true; try { await groupsApi.unbindDistributionGroupLeader(target.id, { memberHandling: unbindForm.memberHandling, targetGroupId: unbindForm.memberHandling === 'TRANSFER_TO_GROUP' ? unbindForm.targetGroupId : undefined, stopUnclaimedTasks: unbindForm.stopUnclaimedTasks, reason: unbindForm.reason || undefined }); ElMessage.success('团长已解绑，历史业务记录保持原归属'); unbindVisible.value = false; await fetchGroups(); } finally { unbindSubmitting.value = false; } }
async function deleteGroup(row: groupsApi.DistributionGroupItem) { const { value } = await ElMessageBox.prompt(`该团队已解绑且无有效成员。删除为逻辑删除，历史订单和佣金仍可追溯。请输入团队名称“${row.name}”确认。`, '删除团队档案', { inputValidator: (value) => String(value || '').trim() === row.name || '请输入完整团队名称' }); await groupsApi.deleteDistributionGroup(row.id, String(value).trim()); ElMessage.success('团队档案已逻辑删除'); await fetchGroups(); }
async function approveApplication(row: groupsApi.DistributionLeaderApplicationItem) { const { value } = await ElMessageBox.prompt('确认通过后会结束申请人的旧成员关系，创建新团队并切换为团长身份。可修改最终团队名称：', '审核通过', { inputValue: row.requestedGroupName, inputValidator: (value) => String(value || '').trim().length >= 2 || '团队名称至少 2 个字' }); await groupsApi.approveDistributionLeaderApplication(row.id, { groupName: String(value).trim() }); ElMessage.success('审核通过，团长身份已创建'); await fetchApplications(); }
async function rejectApplication(row: groupsApi.DistributionLeaderApplicationItem) { const { value } = await ElMessageBox.prompt('请填写驳回原因，H5 用户可以看到该说明后重新申请。', '驳回申请', { inputType: 'textarea', inputValidator: (value) => String(value || '').trim().length > 0 || '请填写驳回原因' }); await groupsApi.rejectDistributionLeaderApplication(row.id, String(value).trim()); ElMessage.success('申请已驳回'); await fetchApplications(); }
</script>

<style scoped>
.summary-item { border: 1px solid var(--el-border-color-lighter); border-radius: 10px; padding: 12px; background: var(--el-fill-color-extra-light); }
.summary-item span { display: block; color: var(--el-text-color-secondary); font-size: 12px; }
.summary-item strong { display: block; margin-top: 4px; font-size: 20px; }
code { padding: 2px 5px; border-radius: 4px; background: var(--el-fill-color-light); font-size: 12px; }
</style>
