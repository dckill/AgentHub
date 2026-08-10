-- Add the durable owner for the session-level Active Device contract.
ALTER TABLE "Session" ADD COLUMN "activeDeviceId" TEXT;
ALTER TABLE "Session" ADD COLUMN "activeDeviceAt" TIMESTAMP(3);

CREATE INDEX "Session_accountId_activeDeviceId_idx"
    ON "Session"("accountId", "activeDeviceId");
