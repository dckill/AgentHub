CREATE TABLE "ExternalShare" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "scope" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalShare_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExternalShare_accountId_createdAt_idx" ON "ExternalShare"("accountId", "createdAt" DESC);
CREATE INDEX "ExternalShare_expiresAt_idx" ON "ExternalShare"("expiresAt");
CREATE INDEX "ExternalShare_revokedAt_idx" ON "ExternalShare"("revokedAt");

ALTER TABLE "ExternalShare"
ADD CONSTRAINT "ExternalShare_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
