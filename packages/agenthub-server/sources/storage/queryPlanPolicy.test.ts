import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migrationsDirectory = resolve(__dirname, '../../prisma/migrations');
const expectedIndexes = [
    'Session_active_lastActiveAt_idx',
    'Machine_active_lastActiveAt_idx',
    'Machine_accountId_lastActiveAt_idx',
] as const;

function migrationSql(): string[] {
    return readdirSync(migrationsDirectory)
        .filter((entry) => statSync(resolve(migrationsDirectory, entry)).isDirectory())
        .sort()
        .map((entry) => readFileSync(resolve(migrationsDirectory, entry, 'migration.sql'), 'utf8'));
}

function collectIndexNames(plan: unknown, names = new Set<string>()): Set<string> {
    if (Array.isArray(plan)) {
        for (const child of plan) collectIndexNames(child, names);
        return names;
    }
    if (plan && typeof plan === 'object') {
        for (const [key, value] of Object.entries(plan)) {
            if (key === 'Index Name' && typeof value === 'string') names.add(value);
            collectIndexNames(value, names);
        }
    }
    return names;
}

describe('production database query-plan policy', () => {
    let pg: PGlite;

    beforeAll(async () => {
        pg = new PGlite();
        for (const sql of migrationSql()) await pg.exec(sql);

        await pg.exec(`
            INSERT INTO "Account" ("id", "publicKey", "updatedAt")
            SELECT 'account-' || value, 'public-key-' || value, now()
            FROM generate_series(1, 50) AS value;

            INSERT INTO "Session" ("id", "tag", "accountId", "metadata", "active", "lastActiveAt", "updatedAt")
            SELECT
                'session-' || value,
                'tag-' || value,
                'account-' || (((value - 1) % 50) + 1),
                '{}',
                value % 10 = 0,
                now() - ((value % 20) || ' minutes')::interval,
                now() - (value || ' seconds')::interval
            FROM generate_series(1, 20000) AS value;

            INSERT INTO "Machine" ("id", "accountId", "metadata", "active", "lastActiveAt", "updatedAt")
            SELECT
                'machine-' || value,
                'account-' || (((value - 1) % 50) + 1),
                '{}',
                value % 10 = 0,
                now() - ((value % 20) || ' minutes')::interval,
                now() - (value || ' seconds')::interval
            FROM generate_series(1, 20000) AS value;

            ANALYZE "Session";
            ANALYZE "Machine";
        `);
    }, 30_000);

    afterAll(async () => {
        await pg.close();
    });

    it('ships indexes matching account sorting and active timeout predicates', () => {
        const sql = migrationSql().join('\n');
        for (const index of expectedIndexes) expect(sql).toContain(`"${index}"`);
    });

    it.each([
        {
            name: 'machine account list',
            expected: 'Machine_accountId_lastActiveAt_idx',
            sql: `SELECT "id" FROM "Machine" WHERE "accountId" = 'account-1' ORDER BY "lastActiveAt" DESC`,
        },
        {
            name: 'session timeout sweep',
            expected: 'Session_active_lastActiveAt_idx',
            sql: `SELECT "id" FROM "Session" WHERE "active" = true AND "lastActiveAt" <= now() - interval '10 minutes'`,
        },
        {
            name: 'machine timeout sweep',
            expected: 'Machine_active_lastActiveAt_idx',
            sql: `SELECT "id" FROM "Machine" WHERE "active" = true AND "lastActiveAt" <= now() - interval '10 minutes'`,
        },
    ])('uses the intended index for $name', async ({ expected, sql }) => {
        const result = await pg.query<Record<'QUERY PLAN', unknown>>(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`);
        expect([...collectIndexNames(result.rows[0]?.['QUERY PLAN'])]).toContain(expected);
    });
});
