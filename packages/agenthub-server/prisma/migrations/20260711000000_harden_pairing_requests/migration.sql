DELETE FROM "TerminalAuthRequest";
DELETE FROM "AccountAuthRequest";

ALTER TABLE "TerminalAuthRequest"
ADD COLUMN "pollingSecretHash" TEXT NOT NULL,
ADD COLUMN "expiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN "consumedAt" TIMESTAMP(3);

ALTER TABLE "AccountAuthRequest"
ADD COLUMN "pollingSecretHash" TEXT NOT NULL,
ADD COLUMN "expiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN "consumedAt" TIMESTAMP(3);

CREATE INDEX "TerminalAuthRequest_expiresAt_idx" ON "TerminalAuthRequest"("expiresAt");
CREATE INDEX "AccountAuthRequest_expiresAt_idx" ON "AccountAuthRequest"("expiresAt");
