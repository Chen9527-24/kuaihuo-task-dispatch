import { request } from '@/api/core/http';
import { normalizeList, normalizePageResult, type PageResult } from '@/utils/apiData';

export interface WithdrawalQuery {
  page?: number;
  pageSize?: number;
  status?: string;
  keyword?: string;
  tenantId?: string;
  transferMode?: string;
  /** 测试清理范围直达：逗号分隔的 H5 用户 ID。 */
  appUserIds?: string;
}

export interface WithdrawalUser {
  id: string;
  phone?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
  serviceOpenid?: string | null;
  balanceAmount?: number;
  withdrawnAmount?: number;
}

export interface WithdrawalItem {
  id: string;
  tenantId?: string | null;
  tenant?: { id: string; name?: string; code?: string } | null;
  appUserId: string;
  appUser?: WithdrawalUser | null;
  amount: number;
  channel: string;
  transferMode: string;
  status: string;
  statusLabel?: string;
  outBillNo?: string | null;
  tradeNo?: string | null;
  transferBillNo?: string | null;
  transferState?: string | null;
  rejectReason?: string | null;
  failReason?: string | null;
  remark?: string | null;
  createdAt?: string;
  updatedAt?: string;
  approvedAt?: string | null;
  paidAt?: string | null;
  rejectedAt?: string | null;
  failedAt?: string | null;
  cancelledAt?: string | null;
  canRejectWithdrawal?: boolean;
}

export interface RejectWithdrawalPayload {
  rejectReason: string;
}

export interface MarkWithdrawalPaidPayload {
  tradeNo?: string;
  remark?: string;
}

export async function listWithdrawals(query: WithdrawalQuery): Promise<PageResult<WithdrawalItem>> {
  const payload = await request<unknown>({ path: '/withdrawals', query });
  return normalizePageResult<WithdrawalItem>(payload);
}

export async function exportWithdrawals(query: WithdrawalQuery): Promise<WithdrawalItem[]> {
  const payload = await request<unknown>({ path: '/withdrawals/export', query });
  return normalizeList<WithdrawalItem>(payload);
}

export async function getWithdrawalDetail(id: string) {
  return request<unknown>({ path: `/withdrawals/${id}` });
}

export async function approveWithdrawal(id: string) {
  return request<unknown>({ path: `/withdrawals/${id}/approve`, method: 'POST' });
}

export async function rejectWithdrawal(id: string, payload: RejectWithdrawalPayload) {
  return request<unknown>({ path: `/withdrawals/${id}/reject`, method: 'POST', body: payload });
}

export async function markWithdrawalPaid(id: string, payload: MarkWithdrawalPaidPayload) {
  return request<unknown>({ path: `/withdrawals/${id}/mark-paid`, method: 'POST', body: payload });
}

export async function syncWithdrawal(id: string) {
  return request<unknown>({ path: `/withdrawals/${id}/sync`, method: 'POST' });
}
