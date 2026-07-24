CREATE TABLE "AccountSyncEvent" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountSyncEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountSyncEvent_accountId_seq_key" ON "AccountSyncEvent"("accountId", "seq");
CREATE INDEX "AccountSyncEvent_accountId_seq_idx" ON "AccountSyncEvent"("accountId", "seq");

ALTER TABLE "AccountSyncEvent" ADD CONSTRAINT "AccountSyncEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
