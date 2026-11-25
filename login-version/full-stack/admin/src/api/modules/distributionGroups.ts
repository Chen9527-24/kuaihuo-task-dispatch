import { request } from '@/api/core/http';
import { normalizePageResult, unwrapData, type PageResult } from '@/utils/apiData';

export interface DistributionGroupItem {
  id: string;
  tenantId: string;
  tenant?: { id: string; name: string; code?: string } | null;
  name: string;
  leaderName?: string | null;
  leaderPhone?: string | null;
  leaderUserId?: string | null;
  memberInviteCode: string;
  leaderBindCode: string;
  memberInviteUrl?: string;
  leaderBindUrl?: string;
  status: string;
  isTestData?: boolean;
  leaderUnboundAt?: string | null;
  deletedAt?: string | null;
  testResetAt?: string | null;
  commissionEnabled?: boolean;
  commissionRuleType?: 'PERCENT' | 'FIXED' | string | null;
  commissionRuleValue?: number | null;
  memberCount?: number;
  taskCount?: number;
  remark?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface DistributionGroupPayload {
  tenantId: string;
  name: string;
  leaderName?: string;
  leaderPhone?: string;
  memberInviteCode?: string;
  leaderBindCode?: string;
  /** 团队档案不再配置默认分佣；佣金只在创建指定团队任务时设置。 */
  remark?: string;
}

export interface DistributionLeaderApplicationItem {
  id: string;
  tenantId?: string | null;
  appUserId: string;
  currentGroupId?: string | null;
  requestedGroupName: string;
  reason?: string | null;
  contactPhone?: string | null;
  agreedToLeaderRules?: boolean;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | string;
  reviewRemark?: string | null;
  reviewedAt?: string | null;
  createdAt?: string;
  appUser?: { id: string; nickname?: string | null; phone?: string | null } | null;
  tenant?: { id: string; name: string; code?: string } | null;
  currentGroup?: { id: string; name: string } | null;
  group?: { id: string; name: string } | null;
  reviewer?: { id: string; username?: string; displayName?: string } | null;
}

export interface LeaderCommissionSettlementItem {
  id: string;
  tenantId: string;
  groupId: string;
  leaderUserId: string;
  workerUserId?: string | null;
  taskId: string;
  workerRewardAmount: number;
  commissionAmount: number;
  commissionMode: 'INCLUDED' | 'EXTRA' | string;
  status: string;
  settledAt?: string;
  createdAt?: string;
  leader?: { id: string; nickname?: string | null; phone?: string | null } | null;
  worker?: { id: string; nickname?: string | null; phone?: string | null } | null;
  group?: { id: string; name: string } | null;
  task?: { id: string; title: string } | null;
}

export interface GroupCollaborationItem {
  id: string;
  tenantId: string;
  sourceGroupId: string;
  targetGroupId: string;
  status: string;
  startAt?: string | null;
  endAt?: string | null;
  createdAt?: string;
}

export async function listDistributionGroups(params: Record<string, unknown> = {}): Promise<PageResult<DistributionGroupItem>> {
  const payload = await request<unknown>({ path: '/distribution-groups', query: params });
  return normalizePageResult<DistributionGroupItem>(payload);
}

/** Load every selectable team without exceeding the server's per-page limit. */
export async function listDistributionGroupOptions(filters: {tenantId?: string; includeDeleted?: boolean}) {
  const groups: DistributionGroupItem[] = [];
  const pageSize = 500;
  for (let page = 1; ; page += 1) {
    const result = await listDistributionGroups({ ...filters, page, pageSize });
    groups.push(...result.items);
    if (result.items.length < pageSize || groups.length >= result.total) return groups;
  }
}

export async function createDistributionGroup(data: DistributionGroupPayload) {
  return request<unknown>({ path: '/distribution-groups', method: 'POST', body: data });
}

export async function enableDistributionGroup(id: string) {
  return request<unknown>({ path: `/distribution-groups/${id}/enable`, method: 'POST' });
}

export async function disableDistributionGroup(id: string) {
  return request<unknown>({ path: `/distribution-groups/${id}/disable`, method: 'POST' });
}

export async function resetMemberInviteCode(id: string) {
  return request<unknown>({ path: `/distribution-groups/${id}/reset-member-invite-code`, method: 'POST' });
}

export async function resetLeaderBindCode(id: string) {
  return request<unknown>({ path: `/distribution-groups/${id}/reset-leader-bind-code`, method: 'POST' });
}

export async function updateMemberInviteCode(id: string, code: string) {
  return request<unknown>({ path: `/distribution-groups/${id}/member-invite-code`, method: 'PATCH', body: { code } });
}

export async function updateLeaderBindCode(id: string, code: string) {
  return request<unknown>({ path: `/distribution-groups/${id}/leader-bind-code`, method: 'PATCH', body: { code } });
}

export async function bindDistributionGroupLeader(id: string, phone: string) {
  return request<unknown>({ path: `/distribution-groups/${id}/bind-leader`, method: 'POST', body: { phone } });
}

export interface DistributionGroupUnbindCheck {
  groupId: string;
  status: string;
  activeMemberCount: number;
  ownedTaskCount: number;
  unclaimedTaskCount: number;
  /** 仅作为分佣接收方关联、但任务归属其他团队的历史/当前任务总数。 */
  commissionAssociatedTaskCount: number;
  /** 仍可能继续领取并产生新佣金的外部归属任务；必须先由任务归属方停用或调整后才能解绑。 */
  externalCommissionActiveTaskCount: number;
  inFlightOrderCount: number;
  pendingWithdrawalCount: number;
  inFlightOrders?: Array<{
    id: string;
    taskId: string;
    taskTitle: string;
    participantLabel: string;
    status: string;
    settlementStatus: string;
  }>;
  canUnbind: boolean;
}

export interface DistributionGroupForceUnbindDeletePreview {
  groupId: string;
  groupName: string;
  isTestData: boolean;
  purgeEnabled: boolean;
  activeMemberCount: number;
  taskCount: number;
  participantCount: number;
  accountCount: number;
  commissionSettlementCount: number;
  walletLedgerCount: number;
  withdrawalCount: number;
  manualAdjustmentCount: number;
  inFlightOrderCount: number;
  tasks: Array<{ id: string; title: string; status: string; isTestData: boolean; relation: string }>;
  accounts: Array<{ id: string; label: string; phone?: string | null; isTestData: boolean; role: string }>;
  inFlightOrders: Array<{ id: string; taskId: string; taskTitle: string; participantLabel: string; status: string; settlementStatus: string; relation: string }>;
  confirmForceText: string;
  blockers: string[];
  canForceUnbindDelete: boolean;
}

export interface DistributionGroupTestResetPreview {
  groupId: string;
  isTestData: boolean;
  purgeEnabled: boolean;
  taskCount: number;
  participantCount: number;
  commissionSettlementCount: number;
  walletLedgerCount: number;
  impactedUserCount: number;
  outsideGroupParticipantCount: number;
  crossGroupParticipantCount: number;
  externalCommissionTaskCount: number;
  pendingWithdrawalCount: number;
  paidWithdrawalCount: number;
  manualAdjustmentCount: number;
  blockers: string[];
  canReset: boolean;
}

type UnknownRecord = Record<string, unknown>;
type DistributionGroupInFlightOrder = NonNullable<DistributionGroupUnbindCheck['inFlightOrders']>[number];

function asRecord(value: unknown): UnknownRecord {
  const unwrapped = unwrapData<unknown>(value);
  return unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped)
    ? unwrapped as UnknownRecord
    : {};
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function asNumber(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function normalizeUnbindCheck(payload: unknown): DistributionGroupUnbindCheck {
  const source = asRecord(payload);
  return {
    groupId: asString(source.groupId),
    status: asString(source.status),
    activeMemberCount: asNumber(source.activeMemberCount),
    ownedTaskCount: asNumber(source.ownedTaskCount),
    unclaimedTaskCount: asNumber(source.unclaimedTaskCount),
    commissionAssociatedTaskCount: asNumber(source.commissionAssociatedTaskCount),
    externalCommissionActiveTaskCount: asNumber(source.externalCommissionActiveTaskCount),
    inFlightOrderCount: asNumber(source.inFlightOrderCount),
    pendingWithdrawalCount: asNumber(source.pendingWithdrawalCount),
    inFlightOrders: asArray<DistributionGroupInFlightOrder>(source.inFlightOrders),
    canUnbind: Boolean(source.canUnbind),
  };
}

function normalizeTestResetPreview(payload: unknown): DistributionGroupTestResetPreview {
  const source = asRecord(payload);
  return {
    groupId: asString(source.groupId),
    isTestData: Boolean(source.isTestData),
    purgeEnabled: Boolean(source.purgeEnabled),
    taskCount: asNumber(source.taskCount),
    participantCount: asNumber(source.participantCount),
    commissionSettlementCount: asNumber(source.commissionSettlementCount),
    walletLedgerCount: asNumber(source.walletLedgerCount),
    impactedUserCount: asNumber(source.impactedUserCount),
    outsideGroupParticipantCount: asNumber(source.outsideGroupParticipantCount),
    crossGroupParticipantCount: asNumber(source.crossGroupParticipantCount),
    externalCommissionTaskCount: asNumber(source.externalCommissionTaskCount),
    pendingWithdrawalCount: asNumber(source.pendingWithdrawalCount),
    paidWithdrawalCount: asNumber(source.paidWithdrawalCount),
    manualAdjustmentCount: asNumber(source.manualAdjustmentCount),
    blockers: asArray<unknown>(source.blockers).map(asString).filter(Boolean),
    canReset: Boolean(source.canReset),
  };
}

function normalizeForceUnbindDeletePreview(payload: unknown): DistributionGroupForceUnbindDeletePreview {
  const source = asRecord(payload);
  return {
    groupId: asString(source.groupId),
    groupName: asString(source.groupName),
    isTestData: Boolean(source.isTestData),
    purgeEnabled: Boolean(source.purgeEnabled),
    activeMemberCount: asNumber(source.activeMemberCount),
    taskCount: asNumber(source.taskCount),
    participantCount: asNumber(source.participantCount),
    accountCount: asNumber(source.accountCount),
    commissionSettlementCount: asNumber(source.commissionSettlementCount),
    walletLedgerCount: asNumber(source.walletLedgerCount),
    withdrawalCount: asNumber(source.withdrawalCount),
    manualAdjustmentCount: asNumber(source.manualAdjustmentCount),
    inFlightOrderCount: asNumber(source.inFlightOrderCount),
    tasks: asArray<DistributionGroupForceUnbindDeletePreview['tasks'][number]>(source.tasks),
    accounts: asArray<DistributionGroupForceUnbindDeletePreview['accounts'][number]>(source.accounts),
    inFlightOrders: asArray<DistributionGroupForceUnbindDeletePreview['inFlightOrders'][number]>(source.inFlightOrders),
    confirmForceText: asString(source.confirmForceText),
    blockers: asArray<unknown>(source.blockers).map(asString).filter(Boolean),
    canForceUnbindDelete: Boolean(source.canForceUnbindDelete),
  };
}

export async function getDistributionGroupUnbindCheck(id: string): Promise<DistributionGroupUnbindCheck> {
  const payload = await request<unknown>({ path: `/distribution-groups/${id}/unbind-check` });
  return normalizeUnbindCheck(payload);
}

export async function getDistributionGroupTestResetPreview(id: string): Promise<DistributionGroupTestResetPreview> {
  const payload = await request<unknown>({ path: `/distribution-groups/${id}/test-reset-check` });
  return normalizeTestResetPreview(payload);
}

export async function getDistributionGroupForceUnbindDeletePreview(id: string): Promise<DistributionGroupForceUnbindDeletePreview> {
  const payload = await request<unknown>({ path: `/distribution-groups/${id}/test-force-unbind-delete-preview` });
  return normalizeForceUnbindDeletePreview(payload);
}

export async function unbindDistributionGroupLeader(id: string, data: {
  memberHandling: 'UNBIND_ALL' | 'TRANSFER_TO_GROUP';
  targetGroupId?: string;
  stopUnclaimedTasks?: boolean;
  reason?: string;
}) {
  return request<unknown>({ path: `/distribution-groups/${id}/unbind-leader`, method: 'POST', body: data });
}


export async function forceUnbindDeleteDistributionGroupTestData(id: string, data: { confirmForceText: string; reason?: string }) {
  return request<unknown>({ path: `/distribution-groups/${id}/force-unbind-delete-test-data`, method: 'POST', body: data });
}

export async function resetDistributionGroupTestData(id: string, confirmName: string) {
  return request<unknown>({ path: `/distribution-groups/${id}/reset-test-data`, method: 'POST', body: { confirmName } });
}

export async function markDistributionGroupAsTestData(id: string, confirmName: string) {
  return request<unknown>({ path: `/distribution-groups/${id}/mark-test-data`, method: 'POST', body: { confirmName } });
}

export async function deleteDistributionGroup(id: string, confirmName: string) {
  return request<unknown>({ path: `/distribution-groups/${id}`, method: 'DELETE', body: { confirmName } });
}

export async function updateDistributionGroupCommissionConfig(id: string, data: {
  commissionEnabled: boolean;
  commissionRuleType?: 'PERCENT' | 'FIXED';
  commissionRuleValue?: number;
}) {
  return request<unknown>({ path: `/distribution-groups/${id}/commission-config`, method: 'PATCH', body: data });
}

export async function listDistributionLeaderApplications(params: Record<string, unknown> = {}): Promise<PageResult<DistributionLeaderApplicationItem>> {
  const payload = await request<unknown>({ path: '/distribution-groups/leader-applications', query: params });
  return normalizePageResult<DistributionLeaderApplicationItem>(payload);
}

export async function approveDistributionLeaderApplication(id: string, data: {
  groupName?: string;
  reviewRemark?: string;
}) {
  return request<unknown>({ path: `/distribution-groups/leader-applications/${id}/approve`, method: 'POST', body: data });
}

export async function rejectDistributionLeaderApplication(id: string, reviewRemark: string) {
  return request<unknown>({ path: `/distribution-groups/leader-applications/${id}/reject`, method: 'POST', body: { reviewRemark } });
}

export async function listLeaderCommissionSettlements(params: Record<string, unknown> = {}): Promise<PageResult<LeaderCommissionSettlementItem>> {
  const payload = await request<unknown>({ path: '/distribution-groups/leader-commissions', query: params });
  return normalizePageResult<LeaderCommissionSettlementItem>(payload);
}

export async function listGroupCollaborations(params: Record<string, unknown> = {}): Promise<PageResult<GroupCollaborationItem>> {
  const payload = await request<unknown>({ path: '/group-collaborations', query: params });
  return normalizePageResult<GroupCollaborationItem>(payload);
}

export async function createGroupCollaboration(data: { tenantId: string; sourceGroupId: string; targetGroupId: string; startAt?: string; endAt?: string }) {
  return request<unknown>({ path: '/group-collaborations', method: 'POST', body: data });
}

export async function revokeGroupCollaboration(id: string) {
  return request<unknown>({ path: `/group-collaborations/${id}/revoke`, method: 'POST' });
}
