import { describe, expect, it } from 'vitest';
import {
    applyBoundedFilePreviewCache,
    estimateFilePreviewCacheEntryBytes,
    isFilePreviewCacheEntryFresh,
    touchFilePreviewCache,
    type FilePreviewCache,
} from './filePreviewCachePolicy';

function entry(content: string, cachedAt: number, diff: string | null = null) {
    return { content, diff, isBinary: false, cachedAt };
}

describe('file preview cache policy', () => {
    it('evicts the globally least-recently-used entry when the entry budget is exceeded', () => {
        const cache: FilePreviewCache = {
            sessionA: {
                '/old.ts': entry('old', 1),
                '/recent.ts': entry('recent', 3),
            },
            sessionB: {
                '/middle.ts': entry('middle', 2),
            },
        };

        const next = applyBoundedFilePreviewCache(cache, 'sessionB', '/new.ts', entry('new', 4), {
            maxEntries: 3,
            maxBytes: 1_000,
        });

        expect(next.sessionA['/old.ts']).toBeUndefined();
        expect(next.sessionA['/recent.ts']).toBeDefined();
        expect(next.sessionB['/middle.ts']).toBeDefined();
        expect(next.sessionB['/new.ts']).toBeDefined();
    });

    it('evicts old entries until the estimated byte budget is satisfied', () => {
        const first = entry('a'.repeat(40), 1);
        const second = entry('b'.repeat(40), 2, 'diff');
        const budget = estimateFilePreviewCacheEntryBytes(second) + 1;

        const next = applyBoundedFilePreviewCache(
            { sessionA: { '/first': first } },
            'sessionA',
            '/second',
            second,
            { maxEntries: 10, maxBytes: budget },
        );

        expect(next.sessionA['/first']).toBeUndefined();
        expect(next.sessionA['/second']).toEqual(second);
    });

    it('keeps a newly refreshed path instead of evicting it as stale', () => {
        const next = applyBoundedFilePreviewCache(
            { sessionA: { '/same': entry('stale', 1), '/other': entry('other', 2) } },
            'sessionA',
            '/same',
            entry('fresh', 3),
            { maxEntries: 2, maxBytes: 1_000 },
        );

        expect(Object.keys(next.sessionA)).toHaveLength(2);
        expect(next.sessionA['/same'].content).toBe('fresh');
    });

    it('updates recency without changing the cached payload', () => {
        const original = entry('content', 1, 'diff');
        const next = touchFilePreviewCache({ sessionA: { '/file': original } }, 'sessionA', '/file', 10);

        expect(next.sessionA['/file']).toEqual({ ...original, cachedAt: 10 });
        expect(original.cachedAt).toBe(1);
    });

    it('keeps a 10k-entry fixture within both budgets', () => {
        let cache: FilePreviewCache = {};
        for (let index = 0; index < 10_000; index += 1) {
            cache = applyBoundedFilePreviewCache(
                cache,
                `session-${index % 8}`,
                `/file-${index}.ts`,
                entry('x'.repeat(256), index),
                { maxEntries: 128, maxBytes: 96_000 },
            );
        }

        const entries = Object.values(cache).flatMap((session) => Object.values(session));
        expect(entries.length).toBeLessThanOrEqual(128);
        expect(entries.reduce((sum, value) => sum + estimateFilePreviewCacheEntryBytes(value), 0)).toBeLessThanOrEqual(96_000);
    });

    it('invalidates entries after the TTL or when the file version changes', () => {
        const cached = { ...entry('content', 1_000), version: 'oid-a' };
        expect(isFilePreviewCacheEntryFresh(cached, 1_500, { ttlMs: 1_000, version: 'oid-a' })).toBe(true);
        expect(isFilePreviewCacheEntryFresh(cached, 2_001, { ttlMs: 1_000, version: 'oid-a' })).toBe(false);
        expect(isFilePreviewCacheEntryFresh(cached, 1_500, { ttlMs: 1_000, version: 'oid-b' })).toBe(false);
    });
});
