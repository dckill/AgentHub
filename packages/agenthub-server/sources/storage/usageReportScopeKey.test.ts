import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('UsageReport idempotency schema', () => {
    it('uses a non-null scope key for account and session reports', () => {
        const schema = readFileSync(resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
        const migration = readFileSync(
            resolve(__dirname, '../../prisma/migrations/20260716000000_add_usage_report_scope_key/migration.sql'),
            'utf8',
        );

        expect(schema).toMatch(/model UsageReport[\s\S]*?scopeKey\s+String/);
        expect(schema).toContain('@@unique([accountId, scopeKey, key])');
        expect(schema).not.toContain('@@unique([accountId, sessionId, key])');
        expect(migration).toContain('ADD COLUMN "scopeKey" TEXT');
        expect(migration).toContain("WHEN \"sessionId\" IS NULL THEN 'account'");
        expect(migration).toContain('ALTER COLUMN "scopeKey" SET NOT NULL');
        expect(migration).toMatch(/CREATE UNIQUE INDEX[\s\S]*ON "UsageReport"\("accountId", "scopeKey", "key"\)/);
    });
});
