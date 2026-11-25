import { request } from '@/api/core/http';
import {
  isRecord,
  normalizeList,
  normalizePageResult,
  pickArray,
  pickNumber,
  pickOptionalString,
  pickString,
  unwrapData,
  type PageResult,
  type UnknownRecord
} from '@/utils/apiData';

export interface DailyTaskVideoLinkInput {
  url: string;
  isPrimary?: boolean;
}

export interface DailyTaskCommentInput {
  text: string;
}

export interface DailyTaskItem {
  id: string;
  postId?: string | null;
  videoId?: string | null;
  tenantId: string;
  tenant?: { id: string; name: string } | null;
  mediaAccountId: string;
  mediaAccount?: { id: string; accountName: string; accountId: string; platform: string; status?: string } | null;
  platform: string;
  title: string;
  videoUrl: string | string[];
  coverFileId?: string | null;
  coverUrl?: string | null;
  copywriting?: string | null;
  commentRequirement?: string | null;
  commentExample?: string | null;
  targetCommentCount: number;
  rewardAmount?: number;
  /** 管理端录入的任务金额（分）；开启分佣时是计算基数。 */
  taskBudgetAmount?: number;
  commissionMode?: 'INCLUDED' | 'EXTRA' | string | null;
  commissionRuleType?: 'PERCENT' | 'FIXED' | string | null;
  commissionRuleValue?: number | null;
  commissionAmount?: number;
  commissionGroupId?: string | null;
  commissionLeaderUserId?: string | null;
  participantCount?: number;
  commissionLocked?: boolean;
  claimedCommentCount?: number;
  completedCommentCount?: number;
  /** 已完成、未结算且已提交个人凭证的订单数量。 */
  pendingSettlementCount?: number;
  status: string;
  distributionScope?: string;
  /** 任务归属团长。仅 distributionGroupId 关联，不把仅佣金接收方混入。 */
  distributionGroupId?: string | null;
  leaderGroup?: { id: string; name: string; status?: string; deletedAt?: string | null } | null;
  /** 仅测试环境可标记；标记后任务会强制停用，允许走受控测试清理。 */
  isTestData?: boolean;
  testMarkedAt?: string | null;
  testMarkedById?: string | null;
  /** 明确测试批次归属；批次清理只按此字段处理。 */
  testBatchId?: string | null;
  allowGroupCollaboration?: boolean;
  commissionEnabled?: boolean;
  commissionRuleId?: string | null;
  remark?: string | null;
  dispatchedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  comments?: TaskCommentItem[];
  comment?: DailyTaskCommentInput[];
  videoLinks?: Array<{ id: string; url: string; isPrimary: boolean }>;
}

export interface DailyTaskQuery {
  keyword?: string;
  tenantId?: string;
  platform?: string;
  status?: string;
  /** 任务归属团长 ID。 */
  distributionGroupId?: string;
  /** true=仅旧测试标记任务；false=仅普通任务；未传=全部。 */
  isTestData?: boolean | string;
  /** 明确测试批次 ID。 */
  testBatchId?: string;
  /** 测试清理范围直达：逗号分隔的每日任务 ID。 */
  ids?: string;
  page?: number;
  pageSize?: number;
}

export interface RemoveDailyTaskPayload {
  /** 删除已标记测试任务时必须回填完整任务标题。 */
  confirmTitle?: string;
  /** 管理员强制清理：自动纳入关联任务和关联账号的完整测试财务范围。 */
  forceAdminPurge?: boolean;
  /** 必须与服务端预览返回的确认文本完全一致。 */
  confirmForceText?: string;
  /** 旧版兼容字段：V11 页面不再使用。 */
  forceExternalWithdrawalPurge?: boolean;
  /** 旧版兼容字段：V11 页面不再使用。 */
  confirmExternalWithdrawalText?: string;
}

export interface MarkDailyTasksAsTestDataResult {
  selectedCount: number;
  markedCount: number;
  alreadyMarkedCount: number;
  stoppedCount: number;
  taskId?: string;
}

export interface TestScopeAccountItem {
  id: string;
  label: string;
  isTestData?: boolean;
}

export interface TestScopeGroupItem {
  id: string;
  label: string;
  status?: string | null;
  isTestData?: boolean;
}

export interface TestScopeTaskItem {
  id: string;
  title: string;
  status?: string | null;
  distributionGroupId?: string | null;
  commissionGroupId?: string | null;
  isTestData?: boolean;
}

export interface TestScopeExternalWithdrawalItem {
  id: string;
  appUserId: string;
  status: string;
  transferMode: string;
  outBillNo?: string | null;
}

export interface TestAccountScopePurgePreview {
  selectedTaskId: string;
  selectedTaskTitle: string;
  purgeEnabled: boolean;
  /** 管理员强制清理会自动纳入的任务。 */
  forceScopeTaskIds: string[];
  forceScopeTaskCount: number;
  forceScopeTasks: TestScopeTaskItem[];
  forceParticipantCount: number;
  forceUserIds: string[];
  forceUserCount: number;
  forceAccounts: TestScopeAccountItem[];
  forceCommissionSettlementCount: number;
  forceWalletLedgerCount: number;
  forceWithdrawalCount: number;
  forceManualAdjustmentCount: number;
  forceConfirmText?: string | null;
  forceBlockers: string[];
  canAdminForcePurge: boolean;
  scopeTaskIds?: string[];
  scopeParticipantIds?: string[];
  scopeUserIds?: string[];
  scopeGroupIds?: string[];
  scopeTaskCount: number;
  participantCount: number;
  testAccountCount: number;
  memberAccountCount: number;
  leaderAccountCount: number;
  testAccounts: TestScopeAccountItem[];
  memberAccounts: TestScopeAccountItem[];
  leaderAccounts: TestScopeAccountItem[];
  /** H5 成员页可批量处理的未标记测试成员。 */
  missingTestMemberAccounts: TestScopeAccountItem[];
  scopeGroups: TestScopeGroupItem[];
  /** 团长管理页需逐条确认标记的团长。 */
  missingTestGroups: TestScopeGroupItem[];
  taskTitles: string[];
  scopeTasks: TestScopeTaskItem[];
  /** 每日任务页会自动勾选的未标记任务。 */
  nonTestTasks: TestScopeTaskItem[];
  commissionSettlementCount: number;
  walletLedgerCount: number;
  withdrawalCount: number;
  manualAdjustmentCount: number;
  externalWithdrawalBlockCount: number;
  externalWithdrawals: TestScopeExternalWithdrawalItem[];
  externalWithdrawalOverrideText?: string | null;
  canPurgeWithExternalWithdrawalOverride: boolean;
  nonTestTaskCount: number;
  blockers: string[];
  canPurge: boolean;
}

export interface DailyTaskPayload {
  tenantId?: string;
  mediaAccountId: string;
  platform: string;
  title: string;
  videoUrl: string;
  coverFileId?: string;
  copywriting?: string;
  commentRequirement?: string;
  commentExample?: string;
  targetCommentCount: number;
  rewardAmount?: number;
  taskBudgetAmount?: number;
  commissionMode?: 'INCLUDED' | 'EXTRA';
  status?: string;
  distributionScope?: string;
  distributionGroupId?: string;
  allowGroupCollaboration?: boolean;
  commissionEnabled?: boolean;
  /** 历史兼容字段：新任务不再写入全局佣金规则 ID。 */
  commissionRuleId?: string;
  /** 任务级分佣规则。PERCENT 用基点，FIXED 用分。 */
  commissionRuleType?: 'PERCENT' | 'FIXED';
  commissionRuleValue?: number;
  /** 正式任务不传；测试任务必须明确归属批次。 */
  testBatchId?: string;
  remark?: string;
  videoLinks?: DailyTaskVideoLinkInput[];
  comment?: DailyTaskCommentInput[];
  replaceComments?: boolean;
}

export interface TaskCommentItem {
  id: string;
  taskId?: string;
  content: string;
  source?: string;
  status: string;
  regionCode?: string | null;
  assigneeId?: string | null;
  assignee?: { id: string; displayName?: string; username?: string } | null;
  assignedAt?: string | null;
  completedAt?: string | null;
  sort?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskProgress {
  taskId: string;
  targetCommentCount: number;
  totalCommentCount: number;
  claimedCommentCount: number;
  completedCommentCount: number;
  completionRate: number;
  statusCounts: Record<string, number>;
  details: TaskCommentItem[];
}

export interface DailyTaskOrderQuery {
  /** optimized 仅返回受控媒体描述，由 PC 按需申请缩略图或原图链接。 */
  mediaMode?: 'legacy' | 'optimized';
  page?: number;
  pageSize?: number;
  status?: string;
  settlementStatus?: string;
  /** 仅查询已提交个人凭证的订单。 */
  hasProof?: boolean;
  phone?: string;
  visitorName?: string;
}

export interface DailyTaskOrderMediaDescriptor {
  fileId: string;
  storageDriver?: string | null;
  hasThumbnail?: boolean;
  thumbnailMimeType?: string | null;
  thumbnailSize?: number | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
}

export interface DailyTaskOrderFileAccess {
  fileId: string;
  url: string;
  fullUrl?: string;
  variant: 'thumbnail' | 'original';
  expiresAt?: string | null;
  fallbackToOriginal?: boolean;
}

export interface DailyTaskHomepageRecognition {
  expectedPlatform?: string | null;
  detectedPlatform?: string | null;
  platformConfidence?: number | null;
  nicknameCandidate?: string | null;
  accountIdCandidate?: string | null;
  status?: string | null;
  error?: string | null;
  requestedAt?: string | null;
  completedAt?: string | null;
}

export interface DailyTaskOrderItem {
  id: string;
  participantId: string;
  status: string;
  settlementStatus: string;
  visitorName?: string | null;
  phone?: string | null;
  /** legacy 模式的原图 URL；optimized 模式不依赖该字段。 */
  uploadedImageUrl?: string[];
  /** optimized 模式的受控凭证文件描述。 */
  proofImages?: DailyTaskOrderMediaDescriptor[];
  /** 少量旧数据只有 /uploads URL、没有文件关联时的兼容字段。 */
  legacyProofUrls?: string[];
  receiptProofUrl?: string | null;
  receiptProofFileId?: string | null;
  settlementProofUrl?: string | null;
  settlementProofFileId?: string | null;
  settlementProof?: DailyTaskOrderMediaDescriptor | null;
  legacySettlementProofUrl?: string | null;
  settlementAmount?: number | null;
  settlementOrderNo?: string | null;
  settlementRemark?: string | null;
  rejectReason?: string | null;
  taskRewardAmount?: number | null;
  mediaAccountNo?: string | null;
  /** 主页截图 OCR 候选，仅用于核验，不替代用户手工账号信息。 */
  homepageRecognition?: DailyTaskHomepageRecognition | null;
  appUser?: { id: string; phone?: string | null; nickname?: string | null; status?: string | null; bannedUntil?: string | null; banReason?: string | null } | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  completedAt?: string | null;
  settledAt?: string | null;
  rejectedAt?: string | null;
  raw?: UnknownRecord;
}

export interface SettleDailyTaskOrderPayload {
  settlementAmount: number;
  settlementProofFileId?: string;
  settlementOrderNo?: string;
  settlementRemark?: string;
}

export interface RejectDailyTaskOrderPayload {
  rejectReason: string;
}

export interface CleanupInvalidOrdersResult {
  deletedCount?: number;
  message?: string;
}

export interface ResetDailyTaskOrderResult {
  success: boolean;
  participantId: string;
  status: string;
  releasedCommentCount?: number;
  message?: string;
}

export interface AiGenerateCommentsPayload {
  messageContent: string;
  useConversationContext: boolean;
  count: number;
  videoTitle: string;
  videoUrl: string;
  videoContent: string;
  accountPositioning: string;
  videoStyle: string;
  videoScript: string;
  targetAudience: string;
  audiencePainPoint: string;
  operationGoal: string;
  platform: string;
  customSystemPrompt: string;
  customUserPrompt: string;
}

export interface AiGeneratedCommentItem {
  commentText: string;
  replies: string[];
  replyGroupNo?: string;
  type?: string;
}

interface AiGenerateCommentsResponseData {
  conversationId?: string;
  rows?: unknown[];
}

function normalizeDailyTaskOrderMediaDescriptor(item: unknown): DailyTaskOrderMediaDescriptor | null {
  const record = isRecord(item) ? item : {};
  const fileId = pickString(record, ['fileId', 'id']);
  if (!fileId) return null;
  return {
    fileId,
    storageDriver: pickOptionalString(record, ['storageDriver']),
    hasThumbnail: record.hasThumbnail === true,
    thumbnailMimeType: pickOptionalString(record, ['thumbnailMimeType']),
    thumbnailSize: pickNumber(record, ['thumbnailSize'], 0) || null,
    imageWidth: pickNumber(record, ['imageWidth'], 0) || null,
    imageHeight: pickNumber(record, ['imageHeight'], 0) || null
  };
}

function normalizeDailyTaskOrderItem(item: unknown): DailyTaskOrderItem {
  const record = isRecord(item) ? item : {};
  const uploadedImageUrl = pickArray<unknown>(record, ['uploadedImageUrl', 'uploadedImageUrls', 'receiptProofUrls'])
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .map((value) => value.trim());
  const proofImages = pickArray<unknown>(record, ['proofImages'])
    .map((value) => normalizeDailyTaskOrderMediaDescriptor(value))
    .filter((value): value is DailyTaskOrderMediaDescriptor => Boolean(value));
  const settlementProof = normalizeDailyTaskOrderMediaDescriptor(record.settlementProof);
  const legacyProofUrls = pickArray<unknown>(record, ['legacyProofUrls'])
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .map((value) => value.trim());
  const homepageRecognitionRecord = isRecord((record as any).homepageRecognition)
    ? (record as any).homepageRecognition as UnknownRecord
    : null;
  const homepageRecognition = homepageRecognitionRecord
    ? {
        expectedPlatform: pickOptionalString(homepageRecognitionRecord, ['expectedPlatform']),
        detectedPlatform: pickOptionalString(homepageRecognitionRecord, ['detectedPlatform']),
        platformConfidence: pickNumber(homepageRecognitionRecord, ['platformConfidence'], 0) || null,
        nicknameCandidate: pickOptionalString(homepageRecognitionRecord, ['nicknameCandidate']),
        accountIdCandidate: pickOptionalString(homepageRecognitionRecord, ['accountIdCandidate']),
        status: pickOptionalString(homepageRecognitionRecord, ['status', 'ocrStatus']),
        error: pickOptionalString(homepageRecognitionRecord, ['error', 'ocrError']),
        requestedAt: pickOptionalString(homepageRecognitionRecord, ['requestedAt', 'ocrRequestedAt']),
        completedAt: pickOptionalString(homepageRecognitionRecord, ['completedAt', 'ocrCompletedAt'])
      }
    : null;

  return {
    id: pickString(record, ['id', 'orderId', 'taskOrderId', 'participantId']),
    participantId: pickString(record, ['participantId', 'visitorId', 'userId', 'id']),
    status: pickString(record, ['status', 'taskStatus', 'participantStatus']),
    settlementStatus: pickString(record, ['settlementStatus', 'settleStatus']),
    visitorName: pickOptionalString(record, ['visitorName', 'name', 'realName', 'userName', 'nickname']),
    phone: pickOptionalString(record, ['phone', 'mobile', 'mobilePhone', 'tel']),
    uploadedImageUrl,
    proofImages,
    legacyProofUrls,
    receiptProofUrl: pickOptionalString(record, [
      'receiptProofUrl',
      'receiptVoucherUrl',
      'collectionProofUrl',
      'receivingProofUrl',
      'paymentProofUrl',
      'receiptUrl',
      'proofUrl'
    ]),
    receiptProofFileId: pickOptionalString(record, [
      'receiptProofFileId',
      'receiptVoucherFileId',
      'collectionProofFileId',
      'receivingProofFileId',
      'paymentProofFileId',
      'receiptFileId',
      'proofFileId'
    ]),
    settlementProofUrl: pickOptionalString(record, ['settlementProofUrl', 'settleProofUrl']),
    settlementProofFileId: pickOptionalString(record, ['settlementProofFileId', 'settleProofFileId']),
    settlementProof,
    legacySettlementProofUrl: pickOptionalString(record, ['legacySettlementProofUrl']),
    settlementAmount: pickNumber(record, ['settlementAmount'], 0),
    settlementOrderNo: pickOptionalString(record, ['settlementOrderNo', 'paymentOrderNo', 'payOrderNo', 'tradeNo']),
    settlementRemark: pickOptionalString(record, ['settlementRemark', 'remark']),
    taskRewardAmount: pickNumber(record, ['taskRewardAmount', 'rewardAmount'], 0),
    mediaAccountNo: pickOptionalString(record, ['mediaAccountNo', 'accountNo', 'selfMediaAccountId']),
    homepageRecognition,
    appUser: isRecord((record as any).appUser) ? (record as any).appUser as any : null,
    rejectReason: pickOptionalString(record, ['rejectReason', 'rejectionReason', 'rejectRemark', 'rejectDesc', 'rejectMessage']),
    createdAt: pickOptionalString(record, ['createdAt']),
    updatedAt: pickOptionalString(record, ['updatedAt']),
    completedAt: pickOptionalString(record, ['completedAt']),
    settledAt: pickOptionalString(record, ['settledAt', 'settlementAt', 'settleAt']),
    rejectedAt: pickOptionalString(record, ['rejectedAt', 'rejectAt']),
    raw: record
  };
}

function normalizeAiGeneratedComment(item: unknown): AiGeneratedCommentItem {
  const record = isRecord(item) ? item : {};
  return {
    commentText: pickString(record, ['comment_text', 'commentText', 'content', 'text']),
    replies: pickArray<unknown>(record, ['replies'])
      .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      .map((value) => value.trim()),
    replyGroupNo: pickOptionalString(record, ['reply_group_no', 'replyGroupNo']) ?? undefined,
    type: pickOptionalString(record, ['type']) ?? undefined
  };
}

export async function listDailyTasks(query: DailyTaskQuery): Promise<PageResult<DailyTaskItem>> {
  const payload = await request<unknown>({
    path: '/daily-tasks',
    query
  });
  return normalizePageResult<DailyTaskItem>(payload);
}

export async function getDailyTaskDetail(id: string): Promise<DailyTaskItem> {
  return unwrapData<DailyTaskItem>(await request<unknown>({ path: `/daily-tasks/${id}` }));
}

export async function createDailyTask(payload: DailyTaskPayload): Promise<DailyTaskItem> {
  return unwrapData<DailyTaskItem>(await request<unknown>({
    path: '/daily-tasks',
    method: 'POST',
    body: payload
  }));
}

export async function updateDailyTask(id: string, payload: Partial<DailyTaskPayload>): Promise<DailyTaskItem> {
  return unwrapData<DailyTaskItem>(await request<unknown>({
    path: `/daily-tasks/${id}`,
    method: 'PATCH',
    body: payload
  }));
}

/** 任务状态只通过独立操作流转，避免编辑表单误改历史状态。 */
export async function pauseDailyTask(id: string): Promise<DailyTaskItem> {
  return unwrapData<DailyTaskItem>(await request<unknown>({ path: `/daily-tasks/${id}/pause`, method: 'POST' }));
}

export async function resumeDailyTask(id: string): Promise<DailyTaskItem> {
  return unwrapData<DailyTaskItem>(await request<unknown>({ path: `/daily-tasks/${id}/resume`, method: 'POST' }));
}

export async function closeDailyTask(id: string): Promise<DailyTaskItem> {
  return unwrapData<DailyTaskItem>(await request<unknown>({ path: `/daily-tasks/${id}/close`, method: 'POST' }));
}

export async function archiveDailyTask(id: string): Promise<DailyTaskItem> {
  return unwrapData<DailyTaskItem>(await request<unknown>({ path: `/daily-tasks/${id}/archive`, method: 'POST' }));
}

export async function removeDailyTask(id: string, payload: RemoveDailyTaskPayload = {}) {
  return request<unknown>({
    path: `/daily-tasks/${id}`,
    method: 'DELETE',
    body: payload
  });
}

/** 仅测试环境可用；标记后会自动停用任务，阻止继续领取和结算。 */
export async function markDailyTaskAsTestData(id: string): Promise<MarkDailyTasksAsTestDataResult> {
  const payload = await request<unknown>({
    path: `/daily-tasks/${id}/mark-test-data`,
    method: 'POST'
  });
  return unwrapData<MarkDailyTasksAsTestDataResult>(payload);
}

/** 仅测试环境可用；一次最多标记 100 条任务。 */
export async function batchMarkDailyTasksAsTestData(ids: string[]): Promise<MarkDailyTasksAsTestDataResult> {
  const payload = await request<unknown>({
    path: '/daily-tasks/batch/mark-test-data',
    method: 'POST',
    body: { ids }
  });
  return unwrapData<MarkDailyTasksAsTestDataResult>(payload);
}

/** 获取测试账号范围强制清理预览；只读，不会修改任务、订单或账本。 */
export async function getTestAccountScopePurgePreview(id: string): Promise<TestAccountScopePurgePreview> {
  const payload = await request<unknown>({
    path: `/daily-tasks/${id}/test-force-purge-preview`
  });
  const source = unwrapData<Partial<TestAccountScopePurgePreview>>(payload) || {};
  return {
    selectedTaskId: String(source.selectedTaskId || id),
    selectedTaskTitle: String(source.selectedTaskTitle || ''),
    purgeEnabled: source.purgeEnabled === true,
    forceScopeTaskIds: Array.isArray(source.forceScopeTaskIds) ? source.forceScopeTaskIds : [],
    forceScopeTaskCount: Number(source.forceScopeTaskCount || 0),
    forceScopeTasks: Array.isArray(source.forceScopeTasks) ? source.forceScopeTasks : [],
    forceParticipantCount: Number(source.forceParticipantCount || 0),
    forceUserIds: Array.isArray(source.forceUserIds) ? source.forceUserIds : [],
    forceUserCount: Number(source.forceUserCount || 0),
    forceAccounts: Array.isArray(source.forceAccounts) ? source.forceAccounts : [],
    forceCommissionSettlementCount: Number(source.forceCommissionSettlementCount || 0),
    forceWalletLedgerCount: Number(source.forceWalletLedgerCount || 0),
    forceWithdrawalCount: Number(source.forceWithdrawalCount || 0),
    forceManualAdjustmentCount: Number(source.forceManualAdjustmentCount || 0),
    forceConfirmText: source.forceConfirmText || null,
    forceBlockers: Array.isArray(source.forceBlockers) ? source.forceBlockers : [],
    canAdminForcePurge: source.canAdminForcePurge === true,
    scopeTaskIds: Array.isArray(source.scopeTaskIds) ? source.scopeTaskIds : [],
    scopeParticipantIds: Array.isArray(source.scopeParticipantIds) ? source.scopeParticipantIds : [],
    scopeUserIds: Array.isArray(source.scopeUserIds) ? source.scopeUserIds : [],
    scopeGroupIds: Array.isArray(source.scopeGroupIds) ? source.scopeGroupIds : [],
    scopeTaskCount: Number(source.scopeTaskCount || 0),
    participantCount: Number(source.participantCount || 0),
    testAccountCount: Number(source.testAccountCount || 0),
    memberAccountCount: Number(source.memberAccountCount || 0),
    leaderAccountCount: Number(source.leaderAccountCount || 0),
    testAccounts: Array.isArray(source.testAccounts) ? source.testAccounts : [],
    memberAccounts: Array.isArray(source.memberAccounts) ? source.memberAccounts : [],
    leaderAccounts: Array.isArray(source.leaderAccounts) ? source.leaderAccounts : [],
    missingTestMemberAccounts: Array.isArray(source.missingTestMemberAccounts) ? source.missingTestMemberAccounts : [],
    scopeGroups: Array.isArray(source.scopeGroups) ? source.scopeGroups : [],
    missingTestGroups: Array.isArray(source.missingTestGroups) ? source.missingTestGroups : [],
    taskTitles: Array.isArray(source.taskTitles) ? source.taskTitles : [],
    scopeTasks: Array.isArray(source.scopeTasks) ? source.scopeTasks : [],
    nonTestTasks: Array.isArray(source.nonTestTasks) ? source.nonTestTasks : [],
    commissionSettlementCount: Number(source.commissionSettlementCount || 0),
    walletLedgerCount: Number(source.walletLedgerCount || 0),
    withdrawalCount: Number(source.withdrawalCount || 0),
    manualAdjustmentCount: Number(source.manualAdjustmentCount || 0),
    externalWithdrawalBlockCount: Number(source.externalWithdrawalBlockCount || 0),
    externalWithdrawals: Array.isArray(source.externalWithdrawals) ? source.externalWithdrawals : [],
    externalWithdrawalOverrideText: source.externalWithdrawalOverrideText || null,
    canPurgeWithExternalWithdrawalOverride: source.canPurgeWithExternalWithdrawalOverride === true,
    nonTestTaskCount: Number(source.nonTestTaskCount || 0),
    blockers: Array.isArray(source.blockers) ? source.blockers : [],
    canPurge: source.canPurge === true,
  };
}

export async function dispatchDailyTask(id: string) {
  return request<unknown>({
    path: `/daily-tasks/${id}/dispatch`,
    method: 'POST'
  });
}

export async function getDailyTaskProgress(id: string): Promise<TaskProgress> {
  const payload = await request<unknown>({
    path: `/daily-tasks/${id}/progress`
  });
  return (payload && typeof payload === 'object' && 'data' in payload ? (payload as { data: TaskProgress }).data : payload) as TaskProgress;
}

export async function listDailyTaskOrders(id: string, query: DailyTaskOrderQuery): Promise<PageResult<DailyTaskOrderItem>> {
  const payload = await request<unknown>({
    path: `/daily-tasks/${id}/orders`,
    query
  });
  const pageResult = normalizePageResult<unknown>(payload);
  return {
    ...pageResult,
    items: pageResult.items.map((item) => normalizeDailyTaskOrderItem(item))
  };
}

export async function retryDailyTaskOrderHomepageRecognition(
  taskId: string,
  participantId: string
): Promise<DailyTaskHomepageRecognition> {
  const payload = await request<unknown>({
    path: `/daily-tasks/${taskId}/orders/${participantId}/homepage-recognition/retry`,
    method: 'POST'
  });
  return unwrapData<DailyTaskHomepageRecognition>(payload);
}

export async function getDailyTaskOrderFileAccess(
  taskId: string,
  participantId: string,
  fileId: string,
  variant: 'thumbnail' | 'original'
): Promise<DailyTaskOrderFileAccess> {
  const payload = await request<unknown>({
    path: `/daily-tasks/${taskId}/orders/${participantId}/files/${fileId}/access`,
    query: { variant },
    skipGlobalLoading: true,
    skipGlobalError: true
  });
  return unwrapData<DailyTaskOrderFileAccess>(payload);
}

export async function settleDailyTaskOrder(id: string, participantId: string, payload: SettleDailyTaskOrderPayload) {
  return request<unknown>({
    path: `/daily-tasks/${id}/orders/${participantId}/settle`,
    method: 'POST',
    body: payload
  });
}

export async function rejectDailyTaskOrder(id: string, participantId: string, payload: RejectDailyTaskOrderPayload) {
  return request<unknown>({
    path: `/daily-tasks/${id}/orders/${participantId}/reject`,
    method: 'POST',
    body: payload
  });
}

export async function cleanupInvalidDailyTaskOrders(id: string): Promise<CleanupInvalidOrdersResult> {
  const payload = await request<unknown>({
    path: `/daily-tasks/${id}/orders/cleanup-invalid`,
    method: 'POST'
  });
  return (payload && typeof payload === 'object' && 'data' in payload
    ? (payload as { data: CleanupInvalidOrdersResult }).data
    : payload) as CleanupInvalidOrdersResult;
}

export async function resetDailyTaskOrder(id: string, participantId: string): Promise<ResetDailyTaskOrderResult> {
  const payload = await request<unknown>({
    path: `/daily-tasks/${id}/orders/${participantId}/reset`,
    method: 'POST'
  });
  return unwrapData<ResetDailyTaskOrderResult>(payload);
}

export async function listTaskComments(id: string): Promise<TaskCommentItem[]> {
  const payload = await request<unknown>({
    path: `/daily-tasks/${id}/comments`
  });
  return normalizeList<TaskCommentItem>(payload);
}

export async function createTaskComment(id: string, payload: Partial<TaskCommentItem> | Array<Partial<TaskCommentItem>>) {
  return request<unknown>({
    path: `/daily-tasks/${id}/comments`,
    method: 'POST',
    body: payload
  });
}

export async function updateTaskComment(id: string, commentId: string, payload: Partial<TaskCommentItem>) {
  return request<unknown>({
    path: `/daily-tasks/${id}/comments/${commentId}`,
    method: 'PATCH',
    body: payload
  });
}

export async function removeTaskComment(id: string, commentId: string) {
  return request<unknown>({
    path: `/daily-tasks/${id}/comments/${commentId}`,
    method: 'DELETE'
  });
}

export async function batchRemoveTaskComments(id: string, ids: string[]) {
  return request<unknown>({
    path: `/daily-tasks/${id}/comments/batch`,
    method: 'DELETE',
    body: { ids }
  });
}

export async function aiGenerateComments(payload: AiGenerateCommentsPayload): Promise<AiGeneratedCommentItem[]> {
  const response = await request<unknown>({
    path: '/daily-tasks/comments/ai-generate',
    method: 'POST',
    body: payload
  });
  const data =
    response && typeof response === 'object' && 'data' in response ? (response as { data?: unknown }).data : response;
  const rows =
    data && typeof data === 'object' && 'rows' in (data as AiGenerateCommentsResponseData)
      ? (data as AiGenerateCommentsResponseData).rows
      : data;
  return (Array.isArray(rows) ? rows : []).map((item) => normalizeAiGeneratedComment(item)).filter((item) => Boolean(item.commentText));
}


export interface BanDailyTaskOrderUserPayload {
  days: number;
  reason: string;
  screenshotFileId?: string;
}

export async function banDailyTaskOrderUser(id: string, participantId: string, payload: BanDailyTaskOrderUserPayload) {
  return request<unknown>({
    path: `/daily-tasks/${id}/orders/${participantId}/ban-user`,
    method: 'POST',
    body: payload
  });
}
