-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "industry" VARCHAR(255),
    "productIntro" TEXT,
    "coreSellingPoint" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "expiredAt" TIMESTAMP(3) NOT NULL,
    "remark" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "username" VARCHAR(32) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" VARCHAR(50) NOT NULL,
    "phone" VARCHAR(20),
    "avatarUrl" TEXT,
    "avatarFileId" TEXT,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
    "remark" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "scope" VARCHAR(32) NOT NULL DEFAULT 'PLATFORM',
    "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
    "description" TEXT,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "group" VARCHAR(32) NOT NULL DEFAULT 'system',
    "type" VARCHAR(32) NOT NULL DEFAULT 'BUTTON',
    "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "routePath" TEXT,
    "component" TEXT,
    "icon" TEXT,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "DictType" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DictType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DictItem" (
    "id" TEXT NOT NULL,
    "typeCode" VARCHAR(64) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "value" VARCHAR(64) NOT NULL,
    "color" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DictItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "platform" VARCHAR(32) NOT NULL,
    "accountId" VARCHAR(100) NOT NULL,
    "accountName" VARCHAR(100) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
    "positioning" TEXT,
    "remark" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTenantMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTenantMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadFile" (
    "id" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "scene" VARCHAR(64),
    "status" VARCHAR(32) NOT NULL DEFAULT 'TEMP',
    "storageDriver" VARCHAR(16) NOT NULL,
    "bucket" TEXT,
    "objectKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" VARCHAR(120) NOT NULL,
    "size" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailObjectKey" TEXT,
    "thumbnailMimeType" VARCHAR(120),
    "thumbnailSize" INTEGER,
    "imageWidth" INTEGER,
    "imageHeight" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileUsage" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "bizType" VARCHAR(64) NOT NULL,
    "bizId" TEXT NOT NULL,
    "fieldName" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mediaAccountId" TEXT NOT NULL,
    "platform" VARCHAR(32) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "postId" VARCHAR(64),
    "authorName" VARCHAR(100),
    "videoUrl" TEXT NOT NULL,
    "coverFileId" TEXT,
    "coverUrl" TEXT,
    "copywriting" TEXT,
    "commentRequirement" TEXT,
    "commentExample" TEXT,
    "targetCommentCount" INTEGER NOT NULL,
    "rewardAmount" INTEGER NOT NULL DEFAULT 0,
    "claimedCommentCount" INTEGER NOT NULL DEFAULT 0,
    "completedCommentCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "stepConfig" JSONB,
    "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    "distributionScope" VARCHAR(32) NOT NULL DEFAULT 'TENANT',
    "distributionGroupId" TEXT,
    "allowGroupCollaboration" BOOLEAN NOT NULL DEFAULT false,
    "commissionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "commissionRuleId" TEXT,
    "taskBudgetAmount" INTEGER NOT NULL DEFAULT 0,
    "commissionMode" VARCHAR(16),
    "commissionRuleType" VARCHAR(16),
    "commissionRuleValue" INTEGER,
    "commissionAmount" INTEGER NOT NULL DEFAULT 0,
    "commissionGroupId" TEXT,
    "commissionLeaderUserId" TEXT,
    "remark" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "isTestData" BOOLEAN NOT NULL DEFAULT false,
    "testMarkedAt" TIMESTAMP(3),
    "testMarkedById" TEXT,
    "testBatchId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyTaskVideoLink" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyTaskVideoLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'AVAILABLE',
    "assigneeId" TEXT,
    "participantId" TEXT,
    "claimerName" VARCHAR(50),
    "assignedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "source" VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
    "regionCode" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskParticipant" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "visitorToken" VARCHAR(64) NOT NULL,
    "visitorName" VARCHAR(50),
    "phone" VARCHAR(20),
    "taskAccountId" TEXT,
    "taskAccountPhone" VARCHAR(20),
    "taskAccountNickname" VARCHAR(80),
    "primaryGroupId" TEXT,
    "taskOwnerGroupId" TEXT,
    "participantGroupId" TEXT,
    "sourceCollaborationId" TEXT,
    "commissionBaseAmount" INTEGER NOT NULL DEFAULT 0,
    "commissionCalculated" BOOLEAN NOT NULL DEFAULT false,
    "leaderCommissionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "leaderCommissionGroupId" TEXT,
    "leaderCommissionLeaderUserId" TEXT,
    "leaderCommissionMode" VARCHAR(16),
    "leaderCommissionAmount" INTEGER NOT NULL DEFAULT 0,
    "leaderCommissionSettledAt" TIMESTAMP(3),
    "testBatchId" TEXT,
    "uploadedImageFileId" TEXT,
    "uploadedImageUrl" TEXT,
    "status" VARCHAR(32) NOT NULL DEFAULT 'STARTED',
    "settlementStatus" VARCHAR(32) NOT NULL DEFAULT 'UNSETTLED',
    "settlementAmount" INTEGER,
    "settlementOrderNo" VARCHAR(128),
    "settlementProofFileId" TEXT,
    "settlementProofUrl" TEXT,
    "settlementRemark" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "resubmitStartedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "settledById" TEXT,
    "appUserId" TEXT,
    "mediaAccountNo" VARCHAR(100),
    "proofOcrStatus" VARCHAR(32) DEFAULT 'PENDING',
    "proofOcrText" TEXT,
    "abandonedAt" TIMESTAMP(3),
    "abandonReason" TEXT,
    "sourcePlatform" VARCHAR(32),
    "ip" TEXT,
    "userAgent" TEXT,
    "startedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDispatch" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationLog" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "tenantId" TEXT,
    "module" VARCHAR(64) NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "bizId" TEXT,
    "description" TEXT,
    "beforeData" JSONB,
    "afterData" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "phone" VARCHAR(20),
    "nickname" VARCHAR(80),
    "avatarUrl" TEXT,
    "wechatOpenid" VARCHAR(128),
    "serviceOpenid" VARCHAR(128),
    "unionid" VARCHAR(128),
    "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
    "bannedUntil" TIMESTAMP(3),
    "banReason" TEXT,
    "isTestData" BOOLEAN NOT NULL DEFAULT false,
    "testMarkedAt" TIMESTAMP(3),
    "testMarkedById" TEXT,
    "totalCompletedOrders" INTEGER NOT NULL DEFAULT 0,
    "totalSettledAmount" INTEGER NOT NULL DEFAULT 0,
    "balanceAmount" INTEGER NOT NULL DEFAULT 0,
    "withdrawnAmount" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppUserMediaAccount" (
    "id" TEXT NOT NULL,
    "appUserId" TEXT NOT NULL,
    "platform" VARCHAR(32) NOT NULL,
    "accountNo" VARCHAR(100) NOT NULL,
    "accountName" VARCHAR(100),
    "source" VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
    "proofFileId" TEXT,
    "proofUrl" TEXT,
    "ocrText" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUserMediaAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppUserRestriction" (
    "id" TEXT NOT NULL,
    "appUserId" TEXT NOT NULL,
    "operatorId" TEXT,
    "reason" TEXT NOT NULL,
    "screenshotFileId" TEXT,
    "screenshotUrl" TEXT,
    "days" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppUserRestriction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAbandonLog" (
    "id" TEXT NOT NULL,
    "appUserId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "participantId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAbandonLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppUserWalletLedger" (
    "id" TEXT NOT NULL,
    "appUserId" TEXT NOT NULL,
    "participantId" TEXT,
    "testBatchId" TEXT,
    "type" VARCHAR(32) NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppUserWalletLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppUserWithdrawal" (
    "id" TEXT NOT NULL,
    "appUserId" TEXT NOT NULL,
    "tenantId" TEXT,
    "testBatchId" TEXT,
    "amount" INTEGER NOT NULL,
    "channel" VARCHAR(32) NOT NULL DEFAULT 'WECHAT_TRANSFER',
    "transferMode" VARCHAR(32) NOT NULL DEFAULT 'WECHAT',
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "outBatchNo" VARCHAR(128),
    "outDetailNo" VARCHAR(128),
    "outBillNo" VARCHAR(32),
    "tradeNo" VARCHAR(128),
    "transferBillNo" VARCHAR(128),
    "transferState" VARCHAR(64),
    "transferPackageInfo" TEXT,
    "transferPackageExpireAt" TIMESTAMP(3),
    "transferMchId" VARCHAR(32),
    "transferAppId" VARCHAR(32),
    "rejectReason" TEXT,
    "failReason" TEXT,
    "operatorId" TEXT,
    "notifyRaw" JSONB,
    "remark" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUserWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestDataBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "purpose" VARCHAR(500),
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "purgedAt" TIMESTAMP(3),
    "purgedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestDataBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestDataBatchUser" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "appUserId" TEXT NOT NULL,
    "role" VARCHAR(32) NOT NULL DEFAULT 'MEMBER',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestDataBatchUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestDataBatchGroup" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestDataBatchGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "leaderName" VARCHAR(80),
    "leaderPhone" VARCHAR(20),
    "leaderUserId" TEXT,
    "leaderTaskAccountId" TEXT,
    "memberInviteCode" VARCHAR(32) NOT NULL,
    "leaderBindCode" VARCHAR(64) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
    "isTestData" BOOLEAN NOT NULL DEFAULT false,
    "leaderUnboundAt" TIMESTAMP(3),
    "leaderUnboundById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "testResetAt" TIMESTAMP(3),
    "testResetById" TEXT,
    "commissionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "commissionRuleType" VARCHAR(16),
    "commissionRuleValue" INTEGER,
    "selfCommissionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultCommissionRuleId" TEXT,
    "remark" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "disabledAt" TIMESTAMP(3),

    CONSTRAINT "DistributionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionUserBinding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
    "bindSource" VARCHAR(32) NOT NULL DEFAULT 'INVITE',
    "inviteCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "unbindAt" TIMESTAMP(3),

    CONSTRAINT "DistributionUserBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionTaskAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "nickname" VARCHAR(80) NOT NULL,
    "smsVerified" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributionTaskAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionLeaderApplication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "appUserId" TEXT NOT NULL,
    "currentGroupId" TEXT,
    "requestedGroupName" VARCHAR(100) NOT NULL,
    "contactPhone" VARCHAR(20),
    "agreedToLeaderRules" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "reviewRemark" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "groupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributionLeaderApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderCommissionSettlement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "leaderUserId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "workerUserId" TEXT,
    "workerRewardAmount" INTEGER NOT NULL,
    "commissionAmount" INTEGER NOT NULL,
    "commissionMode" VARCHAR(16) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'SETTLED',
    "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledById" TEXT,
    "remark" TEXT,
    "testBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaderCommissionSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionTaskAccountHomepageRecognition" (
    "id" TEXT NOT NULL,
    "taskAccountId" TEXT NOT NULL,
    "expectedPlatform" VARCHAR(32) NOT NULL,
    "homepageProofFileId" VARCHAR(64),
    "detectedPlatform" VARCHAR(32),
    "platformConfidence" INTEGER,
    "nicknameCandidate" VARCHAR(100),
    "accountIdCandidate" VARCHAR(100),
    "ocrStatus" VARCHAR(32) NOT NULL DEFAULT 'NOT_REQUESTED',
    "ocrText" TEXT,
    "ocrError" VARCHAR(500),
    "ocrAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "ocrRequestedAt" TIMESTAMP(3),
    "ocrStartedAt" TIMESTAMP(3),
    "ocrCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributionTaskAccountHomepageRecognition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupCollaboration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceGroupId" TEXT NOT NULL,
    "targetGroupId" TEXT NOT NULL,
    "scopeType" VARCHAR(64) NOT NULL DEFAULT 'ALL_COLLABORATIVE_TASKS',
    "status" VARCHAR(32) NOT NULL DEFAULT 'APPROVED',
    "allowAllCollaborativeTasks" BOOLEAN NOT NULL DEFAULT true,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupCollaboration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_code_key" ON "Tenant"("code");

-- CreateIndex
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");

-- CreateIndex
CREATE INDEX "Tenant_expiredAt_idx" ON "Tenant"("expiredAt");

-- CreateIndex
CREATE INDEX "Tenant_deletedAt_idx" ON "Tenant"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "User_phone_idx" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE INDEX "Role_tenantId_idx" ON "Role"("tenantId");

-- CreateIndex
CREATE INDEX "Role_scope_idx" ON "Role"("scope");

-- CreateIndex
CREATE INDEX "Role_status_idx" ON "Role"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "Permission_parentId_idx" ON "Permission"("parentId");

-- CreateIndex
CREATE INDEX "Permission_type_idx" ON "Permission"("type");

-- CreateIndex
CREATE INDEX "Permission_status_idx" ON "Permission"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DictType_code_key" ON "DictType"("code");

-- CreateIndex
CREATE INDEX "DictType_status_idx" ON "DictType"("status");

-- CreateIndex
CREATE INDEX "DictItem_typeCode_status_idx" ON "DictItem"("typeCode", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DictItem_typeCode_value_key" ON "DictItem"("typeCode", "value");

-- CreateIndex
CREATE INDEX "MediaAccount_tenantId_platform_idx" ON "MediaAccount"("tenantId", "platform");

-- CreateIndex
CREATE INDEX "MediaAccount_status_idx" ON "MediaAccount"("status");

-- CreateIndex
CREATE INDEX "MediaAccount_deletedAt_idx" ON "MediaAccount"("deletedAt");

-- CreateIndex
CREATE INDEX "UserTenantMembership_userId_status_idx" ON "UserTenantMembership"("userId", "status");

-- CreateIndex
CREATE INDEX "UserTenantMembership_tenantId_status_idx" ON "UserTenantMembership"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UserTenantMembership_userId_tenantId_key" ON "UserTenantMembership"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "UploadFile_uploaderId_createdAt_idx" ON "UploadFile"("uploaderId", "createdAt");

-- CreateIndex
CREATE INDEX "UploadFile_scene_idx" ON "UploadFile"("scene");

-- CreateIndex
CREATE INDEX "UploadFile_status_idx" ON "UploadFile"("status");

-- CreateIndex
CREATE INDEX "FileUsage_bizType_bizId_idx" ON "FileUsage"("bizType", "bizId");

-- CreateIndex
CREATE INDEX "FileUsage_fileId_idx" ON "FileUsage"("fileId");

-- CreateIndex
CREATE INDEX "DailyTask_tenantId_platform_idx" ON "DailyTask"("tenantId", "platform");

-- CreateIndex
CREATE INDEX "DailyTask_distributionGroupId_idx" ON "DailyTask"("distributionGroupId");

-- CreateIndex
CREATE INDEX "DailyTask_distributionScope_idx" ON "DailyTask"("distributionScope");

-- CreateIndex
CREATE INDEX "DailyTask_commissionGroupId_idx" ON "DailyTask"("commissionGroupId");

-- CreateIndex
CREATE INDEX "DailyTask_commissionLeaderUserId_idx" ON "DailyTask"("commissionLeaderUserId");

-- CreateIndex
CREATE INDEX "DailyTask_allowGroupCollaboration_idx" ON "DailyTask"("allowGroupCollaboration");

-- CreateIndex
CREATE INDEX "DailyTask_mediaAccountId_idx" ON "DailyTask"("mediaAccountId");

-- CreateIndex
CREATE INDEX "DailyTask_status_idx" ON "DailyTask"("status");

-- CreateIndex
CREATE INDEX "DailyTask_createdAt_idx" ON "DailyTask"("createdAt");

-- CreateIndex
CREATE INDEX "DailyTask_deletedAt_idx" ON "DailyTask"("deletedAt");

-- CreateIndex
CREATE INDEX "DailyTask_isTestData_idx" ON "DailyTask"("isTestData");

-- CreateIndex
CREATE INDEX "DailyTask_testBatchId_idx" ON "DailyTask"("testBatchId");

-- CreateIndex
CREATE INDEX "DailyTask_distributionGroupId_status_idx" ON "DailyTask"("distributionGroupId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DailyTask_tenantId_platform_postId_key" ON "DailyTask"("tenantId", "platform", "postId");

-- CreateIndex
CREATE INDEX "DailyTaskVideoLink_taskId_idx" ON "DailyTaskVideoLink"("taskId");

-- CreateIndex
CREATE INDEX "TaskComment_taskId_idx" ON "TaskComment"("taskId");

-- CreateIndex
CREATE INDEX "TaskComment_status_idx" ON "TaskComment"("status");

-- CreateIndex
CREATE INDEX "TaskComment_assigneeId_idx" ON "TaskComment"("assigneeId");

-- CreateIndex
CREATE INDEX "TaskComment_participantId_idx" ON "TaskComment"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskParticipant_visitorToken_key" ON "TaskParticipant"("visitorToken");

-- CreateIndex
CREATE INDEX "TaskParticipant_taskId_idx" ON "TaskParticipant"("taskId");

-- CreateIndex
CREATE INDEX "TaskParticipant_status_idx" ON "TaskParticipant"("status");

-- CreateIndex
CREATE INDEX "TaskParticipant_visitorName_idx" ON "TaskParticipant"("visitorName");

-- CreateIndex
CREATE INDEX "TaskParticipant_phone_idx" ON "TaskParticipant"("phone");

-- CreateIndex
CREATE INDEX "TaskParticipant_taskAccountId_idx" ON "TaskParticipant"("taskAccountId");

-- CreateIndex
CREATE INDEX "TaskParticipant_taskAccountPhone_idx" ON "TaskParticipant"("taskAccountPhone");

-- CreateIndex
CREATE INDEX "TaskParticipant_primaryGroupId_idx" ON "TaskParticipant"("primaryGroupId");

-- CreateIndex
CREATE INDEX "TaskParticipant_participantGroupId_idx" ON "TaskParticipant"("participantGroupId");

-- CreateIndex
CREATE INDEX "TaskParticipant_appUserId_idx" ON "TaskParticipant"("appUserId");

-- CreateIndex
CREATE INDEX "TaskParticipant_mediaAccountNo_idx" ON "TaskParticipant"("mediaAccountNo");

-- CreateIndex
CREATE INDEX "TaskParticipant_settlementStatus_idx" ON "TaskParticipant"("settlementStatus");

-- CreateIndex
CREATE INDEX "TaskParticipant_rejectedAt_idx" ON "TaskParticipant"("rejectedAt");

-- CreateIndex
CREATE INDEX "TaskParticipant_resubmitStartedAt_idx" ON "TaskParticipant"("resubmitStartedAt");

-- CreateIndex
CREATE INDEX "TaskParticipant_settledAt_idx" ON "TaskParticipant"("settledAt");

-- CreateIndex
CREATE INDEX "TaskParticipant_leaderCommissionGroupId_idx" ON "TaskParticipant"("leaderCommissionGroupId");

-- CreateIndex
CREATE INDEX "TaskParticipant_leaderCommissionLeaderUserId_idx" ON "TaskParticipant"("leaderCommissionLeaderUserId");

-- CreateIndex
CREATE INDEX "TaskParticipant_testBatchId_idx" ON "TaskParticipant"("testBatchId");

-- CreateIndex
CREATE INDEX "TaskDispatch_taskId_idx" ON "TaskDispatch"("taskId");

-- CreateIndex
CREATE INDEX "TaskDispatch_status_idx" ON "TaskDispatch"("status");

-- CreateIndex
CREATE INDEX "OperationLog_operatorId_idx" ON "OperationLog"("operatorId");

-- CreateIndex
CREATE INDEX "OperationLog_tenantId_idx" ON "OperationLog"("tenantId");

-- CreateIndex
CREATE INDEX "OperationLog_module_action_idx" ON "OperationLog"("module", "action");

-- CreateIndex
CREATE INDEX "OperationLog_createdAt_idx" ON "OperationLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_phone_key" ON "AppUser"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_wechatOpenid_key" ON "AppUser"("wechatOpenid");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_serviceOpenid_key" ON "AppUser"("serviceOpenid");

-- CreateIndex
CREATE INDEX "AppUser_tenantId_idx" ON "AppUser"("tenantId");

-- CreateIndex
CREATE INDEX "AppUser_status_idx" ON "AppUser"("status");

-- CreateIndex
CREATE INDEX "AppUser_isTestData_idx" ON "AppUser"("isTestData");

-- CreateIndex
CREATE INDEX "AppUser_bannedUntil_idx" ON "AppUser"("bannedUntil");

-- CreateIndex
CREATE INDEX "AppUser_createdAt_idx" ON "AppUser"("createdAt");

-- CreateIndex
CREATE INDEX "AppUserMediaAccount_platform_accountNo_idx" ON "AppUserMediaAccount"("platform", "accountNo");

-- CreateIndex
CREATE UNIQUE INDEX "AppUserMediaAccount_appUserId_platform_accountNo_key" ON "AppUserMediaAccount"("appUserId", "platform", "accountNo");

-- CreateIndex
CREATE INDEX "AppUserRestriction_appUserId_status_idx" ON "AppUserRestriction"("appUserId", "status");

-- CreateIndex
CREATE INDEX "AppUserRestriction_endsAt_idx" ON "AppUserRestriction"("endsAt");

-- CreateIndex
CREATE INDEX "TaskAbandonLog_appUserId_createdAt_idx" ON "TaskAbandonLog"("appUserId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskAbandonLog_taskId_idx" ON "TaskAbandonLog"("taskId");

-- CreateIndex
CREATE INDEX "AppUserWalletLedger_appUserId_createdAt_idx" ON "AppUserWalletLedger"("appUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AppUserWalletLedger_participantId_idx" ON "AppUserWalletLedger"("participantId");

-- CreateIndex
CREATE INDEX "AppUserWalletLedger_testBatchId_idx" ON "AppUserWalletLedger"("testBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "AppUserWithdrawal_outBillNo_key" ON "AppUserWithdrawal"("outBillNo");

-- CreateIndex
CREATE INDEX "AppUserWithdrawal_appUserId_status_idx" ON "AppUserWithdrawal"("appUserId", "status");

-- CreateIndex
CREATE INDEX "AppUserWithdrawal_tenantId_status_idx" ON "AppUserWithdrawal"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AppUserWithdrawal_transferMode_idx" ON "AppUserWithdrawal"("transferMode");

-- CreateIndex
CREATE INDEX "AppUserWithdrawal_testBatchId_idx" ON "AppUserWithdrawal"("testBatchId");

-- CreateIndex
CREATE INDEX "AppUserWithdrawal_createdAt_idx" ON "AppUserWithdrawal"("createdAt");

-- CreateIndex
CREATE INDEX "TestDataBatch_tenantId_status_idx" ON "TestDataBatch"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TestDataBatch_createdAt_idx" ON "TestDataBatch"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TestDataBatch_tenantId_name_key" ON "TestDataBatch"("tenantId", "name");

-- CreateIndex
CREATE INDEX "TestDataBatchUser_appUserId_createdAt_idx" ON "TestDataBatchUser"("appUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TestDataBatchUser_batchId_appUserId_key" ON "TestDataBatchUser"("batchId", "appUserId");

-- CreateIndex
CREATE INDEX "TestDataBatchGroup_groupId_createdAt_idx" ON "TestDataBatchGroup"("groupId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TestDataBatchGroup_batchId_groupId_key" ON "TestDataBatchGroup"("batchId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionGroup_memberInviteCode_key" ON "DistributionGroup"("memberInviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionGroup_leaderBindCode_key" ON "DistributionGroup"("leaderBindCode");

-- CreateIndex
CREATE INDEX "DistributionGroup_tenantId_status_idx" ON "DistributionGroup"("tenantId", "status");

-- CreateIndex
CREATE INDEX "DistributionGroup_deletedAt_idx" ON "DistributionGroup"("deletedAt");

-- CreateIndex
CREATE INDEX "DistributionGroup_isTestData_idx" ON "DistributionGroup"("isTestData");

-- CreateIndex
CREATE INDEX "DistributionGroup_leaderUserId_idx" ON "DistributionGroup"("leaderUserId");

-- CreateIndex
CREATE INDEX "DistributionGroup_leaderPhone_idx" ON "DistributionGroup"("leaderPhone");

-- CreateIndex
CREATE INDEX "DistributionGroup_createdAt_idx" ON "DistributionGroup"("createdAt");

-- CreateIndex
CREATE INDEX "DistributionUserBinding_userId_status_idx" ON "DistributionUserBinding"("userId", "status");

-- CreateIndex
CREATE INDEX "DistributionUserBinding_tenantId_groupId_status_idx" ON "DistributionUserBinding"("tenantId", "groupId", "status");

-- CreateIndex
CREATE INDEX "DistributionUserBinding_groupId_status_idx" ON "DistributionUserBinding"("groupId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionTaskAccount_phone_key" ON "DistributionTaskAccount"("phone");

-- CreateIndex
CREATE INDEX "DistributionTaskAccount_userId_status_idx" ON "DistributionTaskAccount"("userId", "status");

-- CreateIndex
CREATE INDEX "DistributionTaskAccount_tenantId_groupId_status_idx" ON "DistributionTaskAccount"("tenantId", "groupId", "status");

-- CreateIndex
CREATE INDEX "DistributionTaskAccount_groupId_status_idx" ON "DistributionTaskAccount"("groupId", "status");

-- CreateIndex
CREATE INDEX "DistributionLeaderApplication_appUserId_status_idx" ON "DistributionLeaderApplication"("appUserId", "status");

-- CreateIndex
CREATE INDEX "DistributionLeaderApplication_tenantId_status_createdAt_idx" ON "DistributionLeaderApplication"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DistributionLeaderApplication_groupId_idx" ON "DistributionLeaderApplication"("groupId");

-- CreateIndex
CREATE INDEX "DistributionLeaderApplication_createdAt_idx" ON "DistributionLeaderApplication"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderCommissionSettlement_participantId_key" ON "LeaderCommissionSettlement"("participantId");

-- CreateIndex
CREATE INDEX "LeaderCommissionSettlement_tenantId_settledAt_idx" ON "LeaderCommissionSettlement"("tenantId", "settledAt");

-- CreateIndex
CREATE INDEX "LeaderCommissionSettlement_leaderUserId_settledAt_idx" ON "LeaderCommissionSettlement"("leaderUserId", "settledAt");

-- CreateIndex
CREATE INDEX "LeaderCommissionSettlement_groupId_settledAt_idx" ON "LeaderCommissionSettlement"("groupId", "settledAt");

-- CreateIndex
CREATE INDEX "LeaderCommissionSettlement_taskId_idx" ON "LeaderCommissionSettlement"("taskId");

-- CreateIndex
CREATE INDEX "LeaderCommissionSettlement_testBatchId_idx" ON "LeaderCommissionSettlement"("testBatchId");

-- CreateIndex
CREATE INDEX "DistributionTaskAccountHomepageRecognition_ocrStatus_update_idx" ON "DistributionTaskAccountHomepageRecognition"("ocrStatus", "updatedAt");

-- CreateIndex
CREATE INDEX "DistributionTaskAccountHomepageRecognition_homepageProofFil_idx" ON "DistributionTaskAccountHomepageRecognition"("homepageProofFileId");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionTaskAccountHomepageRecognition_taskAccountId_ex_key" ON "DistributionTaskAccountHomepageRecognition"("taskAccountId", "expectedPlatform");

-- CreateIndex
CREATE INDEX "GroupCollaboration_tenantId_status_idx" ON "GroupCollaboration"("tenantId", "status");

-- CreateIndex
CREATE INDEX "GroupCollaboration_sourceGroupId_targetGroupId_status_idx" ON "GroupCollaboration"("sourceGroupId", "targetGroupId", "status");

-- CreateIndex
CREATE INDEX "GroupCollaboration_targetGroupId_status_idx" ON "GroupCollaboration"("targetGroupId", "status");

-- CreateIndex
CREATE INDEX "GroupCollaboration_endAt_idx" ON "GroupCollaboration"("endAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Permission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DictItem" ADD CONSTRAINT "DictItem_typeCode_fkey" FOREIGN KEY ("typeCode") REFERENCES "DictType"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAccount" ADD CONSTRAINT "MediaAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTenantMembership" ADD CONSTRAINT "UserTenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTenantMembership" ADD CONSTRAINT "UserTenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadFile" ADD CONSTRAINT "UploadFile_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileUsage" ADD CONSTRAINT "FileUsage_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "UploadFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_mediaAccountId_fkey" FOREIGN KEY ("mediaAccountId") REFERENCES "MediaAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_testBatchId_fkey" FOREIGN KEY ("testBatchId") REFERENCES "TestDataBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTaskVideoLink" ADD CONSTRAINT "DailyTaskVideoLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DailyTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DailyTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "TaskParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskParticipant" ADD CONSTRAINT "TaskParticipant_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DailyTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskParticipant" ADD CONSTRAINT "TaskParticipant_settledById_fkey" FOREIGN KEY ("settledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskParticipant" ADD CONSTRAINT "TaskParticipant_appUserId_fkey" FOREIGN KEY ("appUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskParticipant" ADD CONSTRAINT "TaskParticipant_testBatchId_fkey" FOREIGN KEY ("testBatchId") REFERENCES "TestDataBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDispatch" ADD CONSTRAINT "TaskDispatch_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DailyTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppUserMediaAccount" ADD CONSTRAINT "AppUserMediaAccount_appUserId_fkey" FOREIGN KEY ("appUserId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppUserRestriction" ADD CONSTRAINT "AppUserRestriction_appUserId_fkey" FOREIGN KEY ("appUserId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppUserRestriction" ADD CONSTRAINT "AppUserRestriction_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAbandonLog" ADD CONSTRAINT "TaskAbandonLog_appUserId_fkey" FOREIGN KEY ("appUserId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAbandonLog" ADD CONSTRAINT "TaskAbandonLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DailyTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAbandonLog" ADD CONSTRAINT "TaskAbandonLog_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "TaskParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppUserWalletLedger" ADD CONSTRAINT "AppUserWalletLedger_appUserId_fkey" FOREIGN KEY ("appUserId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppUserWalletLedger" ADD CONSTRAINT "AppUserWalletLedger_testBatchId_fkey" FOREIGN KEY ("testBatchId") REFERENCES "TestDataBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppUserWithdrawal" ADD CONSTRAINT "AppUserWithdrawal_appUserId_fkey" FOREIGN KEY ("appUserId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppUserWithdrawal" ADD CONSTRAINT "AppUserWithdrawal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppUserWithdrawal" ADD CONSTRAINT "AppUserWithdrawal_testBatchId_fkey" FOREIGN KEY ("testBatchId") REFERENCES "TestDataBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestDataBatch" ADD CONSTRAINT "TestDataBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestDataBatchUser" ADD CONSTRAINT "TestDataBatchUser_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TestDataBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestDataBatchUser" ADD CONSTRAINT "TestDataBatchUser_appUserId_fkey" FOREIGN KEY ("appUserId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestDataBatchGroup" ADD CONSTRAINT "TestDataBatchGroup_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TestDataBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderCommissionSettlement" ADD CONSTRAINT "LeaderCommissionSettlement_testBatchId_fkey" FOREIGN KEY ("testBatchId") REFERENCES "TestDataBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionTaskAccountHomepageRecognition" ADD CONSTRAINT "DistributionTaskAccountHomepageRecognition_taskAccountId_fkey" FOREIGN KEY ("taskAccountId") REFERENCES "DistributionTaskAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

