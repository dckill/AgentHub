ALTER TABLE "AccountPushToken" ADD COLUMN "deviceId" TEXT;

CREATE INDEX "AccountPushToken_accountId_deviceId_idx" ON "AccountPushToken"("accountId", "deviceId");
