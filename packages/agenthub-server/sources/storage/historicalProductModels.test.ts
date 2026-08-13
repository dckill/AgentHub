import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schemaPath = resolve(__dirname, '../../prisma/schema.prisma');
const migrationPath = resolve(
    __dirname,
    '../../prisma/migrations/20260812000000_remove_historical_product_models/migration.sql',
);

async function createLegacyShape(pg: PGlite): Promise<void> {
    await pg.exec(`
        CREATE TYPE "RelationshipStatus" AS ENUM ('none', 'requested', 'pending', 'friend', 'rejected');
        CREATE TABLE "Account" (
            "id" TEXT PRIMARY KEY,
            "feedSeq" BIGINT NOT NULL DEFAULT 0
        );
        CREATE TABLE "UserRelationship" (
            "fromUserId" TEXT NOT NULL,
            "toUserId" TEXT NOT NULL,
            "status" "RelationshipStatus" NOT NULL DEFAULT 'pending'
        );
        CREATE TABLE "UserFeedItem" (
            "id" TEXT PRIMARY KEY,
            "userId" TEXT NOT NULL
        );
        CREATE TABLE "VoiceConversation" (
            "id" TEXT PRIMARY KEY,
            "accountId" TEXT NOT NULL
        );
    `);
}

describe('historical product model retirement', () => {
    it('removes the retired Prisma client surface and account feed counter', () => {
        const schema = readFileSync(schemaPath, 'utf8');
        for (const retiredName of [
            'RelationshipStatus',
            'UserRelationship',
            'UserFeedItem',
            'VoiceConversation',
            'feedSeq',
        ]) {
            expect(schema).not.toContain(retiredName);
        }
    });

    it('drops empty legacy tables, enum, and feed counter', async () => {
        const pg = new PGlite();
        try {
            await createLegacyShape(pg);
            await pg.exec(readFileSync(migrationPath, 'utf8'));
            const relations = await pg.query<{ relationship: string | null; feed: string | null; voice: string | null }>(
                `SELECT to_regclass('"UserRelationship"')::text AS relationship,
                        to_regclass('"UserFeedItem"')::text AS feed,
                        to_regclass('"VoiceConversation"')::text AS voice`,
            );
            expect(relations.rows[0]).toEqual({ relationship: null, feed: null, voice: null });
            const columns = await pg.query<{ column_name: string }>(
                `SELECT column_name FROM information_schema.columns
                 WHERE table_name = 'Account' AND column_name = 'feedSeq'`,
            );
            expect(columns.rows).toHaveLength(0);
        } finally {
            await pg.close();
        }
    });

    it('fails closed before deleting any populated legacy table', async () => {
        const pg = new PGlite();
        try {
            await createLegacyShape(pg);
            await pg.exec(`INSERT INTO "UserFeedItem" ("id", "userId") VALUES ('feed-1', 'account-1')`);
            await expect(pg.exec(readFileSync(migrationPath, 'utf8'))).rejects.toThrow(/UserFeedItem contains data/);
            const count = await pg.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM "UserFeedItem"');
            expect(count.rows[0]?.count).toBe(1);
        } finally {
            await pg.close();
        }
    });
});
