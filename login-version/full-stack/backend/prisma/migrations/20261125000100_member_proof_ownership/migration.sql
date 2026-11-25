-- AlterTable
ALTER TABLE "UploadFile" ADD COLUMN     "memberId" TEXT,
ALTER COLUMN "uploaderId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "UploadFile_memberId_createdAt_idx" ON "UploadFile"("memberId", "createdAt");

-- AddForeignKey
ALTER TABLE "UploadFile" ADD CONSTRAINT "UploadFile_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Preserve unambiguous member ownership for evidence already associated with an order or profile.
WITH claims AS (
  SELECT f."fileId", p."appUserId" AS member FROM "FileUsage" f
    JOIN "TaskParticipant" p ON p.id = f."bizId"
    WHERE f."bizType"='TASK_PARTICIPANT' AND f."fieldName"='confirmProof' AND p."appUserId" IS NOT NULL
  UNION
  SELECT f."fileId", a.id AS member FROM "FileUsage" f
    JOIN "AppUser" a ON a.id = split_part(f."bizId", ':', 1)
    WHERE f."bizType"='APP_USER_HOMEPAGE_PROOF' AND f."fieldName"='homepageProof'
), unique_owner AS (
  SELECT "fileId", min(member) AS member FROM claims GROUP BY "fileId" HAVING count(DISTINCT member)=1
)
UPDATE "UploadFile" AS u SET "memberId"=o.member, "uploaderId"=NULL FROM unique_owner o
WHERE u.id=o."fileId" AND u.scene='TASK_CLAIM_PROOF';
