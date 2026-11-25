import { request } from '@/api/core/http';
import { normalizePageResult, type PageResult, unwrapData } from '@/utils/apiData';

export interface AppUserDistributionLeader {
  groupId?: string;
  groupName?: string;
  leaderName?: string | null;
  leaderPhone?: string | null;
  maskedLeaderPhone?: string | null;
  leaderUserId?: string | null;
  leaderTaskAccountId?: string | null;
}

export interface AppUserTaskAccountStats {
  totalOrders: number;
  currentOrders: number;
  completedOrders: number;
  abandonedOrders: number;
  settledOrders: number;
  settledAmount: number;
  todayAbandonCount: number;
  latestUsedAt?: string | null;
}

export interface AppUserTaskAccount {
  id: string;
  userId?: string;
  tenantId?: string;
  groupId?: string;
  phone?: string | null;
  maskedPhone?: string | null;
  nickname?: string | null;
  smsVerified?: boolean;
  status: 'ENABLED' | 'DISABLED' | string;
  isDefault?: boolean;
  tenant?: { id: string; name: string; code?: string } | null;
  group?: { id: string; name: string; leaderName?: string | null; leaderPhone?: string | null } | null;
  leader?: AppUserDistributionLeader | null;
  stats?: AppUserTaskAccountStats | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AppUserTaskAccountSummary {
  taskAccountCount: number;
  activeTaskAccountCount: number;
  disabledTaskAccountCount: number;
  defaultTaskAccount?: AppUserTaskAccount | null;
  taskAccounts?: AppUserTaskAccount[];
  distributionLeaders?: AppUserDistributionLeader[];
}

export interface AppUserItem {
  id: string;
  tenantId?: string | null;
  tenant?: { id: string; name: string; code?: string } | null;
  phone?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
  serviceOpenid?: string | null;
  unionid?: string | null;
  status: string;
  resolvedStatus?: {
    status: string;
    canClaim: boolean;
    bannedUntil?: string | null;
    banReason?: string | null;
    message?: string | null;
  };
  bannedUntil?: string | null;
  banReason?: string | null;
  /** 独立测试账号标记；只有明确标记的账号可进入强制测试范围清理。 */
  isTestData?: boolean;
  testMarkedAt?: string | null;
  totalCompletedOrders: number;
  totalSettledAmount: number;
  balanceAmount: number;
  withdrawnAmount: number;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  counts?: Record<string, number>;
  latestParticipant?: any;
  taskAccountCount?: number;
  activeTaskAccountCount?: number;
  disabledTaskAccountCount?: number;
  defaultTaskAccount?: AppUserTaskAccount | null;
  taskAccountSummary?: AppUserTaskAccountSummary | null;
  taskAccounts?: AppUserTaskAccount[];
  distributionLeaders?: AppUserDistributionLeader[];
  participants?: any[];
  withdrawals?: any[];
  registerType?: 'WECHAT_MP' | 'PHONE' | 'UNKNOWN';
}

export interface TaskAccountPhoneOccupancy {
  phone: string;
  occupied: boolean;
  releasable: boolean;
  blockingReason?: string | null;
  taskAccount?: {
    id: string;
    userId: string;
    tenantId: string;
    groupId: string;
    phone: string;
    nickname?: string | null;
    status: string;
    isDefault?: boolean;
  } | null;
  owner?: { id: string; nickname?: string | null; phone?: string | null; deletedAt?: string | null } | null;
  tenant?: { id: string; name: string; code?: string | null } | null;
  group?: { id: string; name: string; leaderName?: string | null; leaderPhone?: string | null; leaderUserId?: string | null; leaderTaskAccountId?: string | null } | null;
}

export interface AppUserQuery {
  keyword?: string;
  phone?: string;
  status?: string;
  tenantId?: string;
  /** 团长分组 ID；用于查询该团长邀请码绑定的成员。 */
  leaderGroupId?: string;
  /** 成员管理页固定传 true：只返回成员，不返回团长本人。 */
  memberOnly?: 'true';
  registerType?: string;
  /** true=仅测试账号；false=仅正式账号；未传=全部。 */
  isTestData?: boolean | string;
  /** 测试清理范围直达：逗号分隔的 H5 成员 ID。 */
  ids?: string;
  page?: number;
  pageSize?: number;
}

export async function listAppUsers(query: AppUserQuery): Promise<PageResult<AppUserItem>> {
  const payload = await request<unknown>({ path: '/app-users', query });
  return normalizePageResult<AppUserItem>(payload);
}

export async function getAppUserDetail(id: string): Promise<AppUserItem> {
  const payload = await request<unknown>({ path: `/app-users/${id}` });
  return unwrapData<AppUserItem>(payload);
}

export async function updateAppUserStatus(id: string, status: 'ENABLED' | 'DISABLED') {
  return request<unknown>({ path: `/app-users/${id}/status`, method: 'PATCH', body: { status } });
}

export async function markAppUserAsTestData(id: string, payload: { confirmIdentity: string }) {
  return request<unknown>({ path: `/app-users/${id}/mark-test-data`, method: 'POST', body: payload });
}

export interface BatchMarkAppUsersAsTestDataResult {
  selectedCount: number;
  markedCount: number;
  alreadyMarkedCount: number;
}

export async function batchMarkAppUsersAsTestData(ids: string[], confirmText: string) {
  const payload = await request<unknown>({ path: '/app-users/batch/mark-test-data', method: 'POST', body: { ids, confirmText } });
  return unwrapData<BatchMarkAppUsersAsTestDataResult>(payload);
}

export async function restrictAppUser(id: string, payload: { days: number; reason: string; screenshotFileId?: string }) {
  return request<unknown>({ path: `/app-users/${id}/restrictions`, method: 'POST', body: payload });
}

export async function cancelAppUserRestriction(id: string) {
  return updateAppUserStatus(id, 'ENABLED');
}

export async function removeAppUser(id: string) {
  return request<unknown>({ path: `/app-users/${id}`, method: 'DELETE' });
}

export async function updateAppUserProfile(id: string, payload: { nickname: string; phone: string }) {
  return request<unknown>({ path: `/app-users/${id}/profile`, method: 'PATCH', body: payload });
}

export async function resetAppUserAbandonCount(id: string) {
  return request<unknown>({ path: `/app-users/${id}/abandon-count/reset`, method: 'POST' });
}


export async function getTaskAccountPhoneOccupancy(phone: string) {
  const payload = await request<unknown>({ path: '/app-users/task-accounts/phone-occupancy', query: { phone } });
  return unwrapData<TaskAccountPhoneOccupancy>(payload);
}

export async function releaseTaskAccountPhone(phone: string) {
  const payload = await request<unknown>({ path: '/app-users/task-accounts/release-phone', method: 'POST', body: { phone } });
  return unwrapData<{ success: boolean; releasedPhone: string; taskAccountId: string; ownerUserId: string; ownerNickname?: string | null }>(payload);
}

export async function updateAppUserTaskAccount(id: string, accountId: string, payload: { nickname: string; phone: string }) {
  return request<unknown>({ path: `/app-users/${id}/task-accounts/${accountId}`, method: 'PATCH', body: payload });
}

export async function removeAppUserTaskAccount(id: string, accountId: string) {
  return request<unknown>({ path: `/app-users/${id}/task-accounts/${accountId}`, method: 'DELETE' });
}

export async function updateAppUserTaskAccountStatus(id: string, accountId: string, status: 'ENABLED' | 'DISABLED') {
  return request<unknown>({ path: `/app-users/${id}/task-accounts/${accountId}/status`, method: 'PATCH', body: { status } });
}

export async function setDefaultAppUserTaskAccount(id: string, accountId: string) {
  return request<unknown>({ path: `/app-users/${id}/task-accounts/${accountId}/default`, method: 'POST' });
}
