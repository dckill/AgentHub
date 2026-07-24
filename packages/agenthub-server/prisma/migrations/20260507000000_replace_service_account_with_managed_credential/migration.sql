-- DropTable
DROP TABLE "ServiceAccountToken";

-- CreateTable
CREATE TABLE "ManagedCredential" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "apiKey" BYTEA NOT NULL,
    "baseUrl" BYTEA,
    "modelOverrides" JSONB,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagedCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManagedCredential_accountId_idx" ON "ManagedCredential"("accountId");

-- CreateIndex
CREATE INDEX "ManagedCredential_accountId_agent_idx" ON "ManagedCredential"("accountId", "agent");

-- AddForeignKey
ALTER TABLE "ManagedCredential" ADD CONSTRAINT "ManagedCredential_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
