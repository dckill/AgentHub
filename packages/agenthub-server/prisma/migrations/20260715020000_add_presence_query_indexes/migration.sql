-- Keep account-scoped machine ordering and global timeout sweeps bounded as
-- these tables grow. Partial indexes avoid indexing inactive history.
CREATE INDEX IF NOT EXISTS "Machine_accountId_lastActiveAt_idx"
ON "Machine"("accountId", "lastActiveAt" DESC);

CREATE INDEX IF NOT EXISTS "Session_active_lastActiveAt_idx"
ON "Session"("lastActiveAt")
WHERE "active" = true;

CREATE INDEX IF NOT EXISTS "Machine_active_lastActiveAt_idx"
ON "Machine"("lastActiveAt")
WHERE "active" = true;
