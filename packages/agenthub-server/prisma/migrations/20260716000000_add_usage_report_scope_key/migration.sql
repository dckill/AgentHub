ALTER TABLE "UsageReport" ADD COLUMN "scopeKey" TEXT;

UPDATE "UsageReport"
SET "scopeKey" = CASE
    WHEN "sessionId" IS NULL THEN 'account'
    ELSE 'session:' || "sessionId"
END;

ALTER TABLE "UsageReport" ALTER COLUMN "scopeKey" SET NOT NULL;

DROP INDEX IF EXISTS "UsageReport_accountId_sessionId_key_key";

CREATE UNIQUE INDEX "UsageReport_accountId_scopeKey_key_key"
ON "UsageReport"("accountId", "scopeKey", "key");
