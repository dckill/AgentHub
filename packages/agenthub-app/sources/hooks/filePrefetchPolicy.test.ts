import { describe, expect, it, vi } from 'vitest';
import { runFilePrefetchQueue, selectFilePrefetchWindow } from './filePrefetchPolicy';

function file(index: number) {
    return { fullPath: `/src/file-${index}.ts` };
}

describe('file prefetch window policy', () => {
    it('limits a 10k-file list to the visible range plus lookahead', () => {
        const files = Array.from({ length: 10_000 }, (_, index) => file(index));
        const selected = selectFilePrefetchWindow(files, { start: 100, end: 110, lookahead: 4 });

        expect(selected).toHaveLength(18);
        expect(selected[0].fullPath).toBe('/src/file-96.ts');
        expect(selected.at(-1)?.fullPath).toBe('/src/file-113.ts');
    });

    it('deduplicates staged and unstaged paths before applying the window', () => {
        const selected = selectFilePrefetchWindow(
            [file(0), file(0), file(1), file(2)],
            { start: 0, end: 2, lookahead: 0 },
        );

        expect(selected.map((value) => value.fullPath)).toEqual(['/src/file-0.ts', '/src/file-1.ts']);
    });

    it('clamps ranges at both list boundaries', () => {
        const files = [file(0), file(1), file(2)];
        expect(selectFilePrefetchWindow(files, { start: 0, end: 1, lookahead: 5 })).toEqual(files);
        expect(selectFilePrefetchWindow(files, { start: 50, end: 60, lookahead: 2 })).toEqual([]);
    });

    it('does not start more work after cancellation and respects concurrency', async () => {
        const controller = new AbortController();
        const started: number[] = [];
        let release!: () => void;
        const blocked = new Promise<void>((resolve) => { release = resolve; });

        const running = runFilePrefetchQueue(
            Array.from({ length: 20 }, (_, index) => index),
            async (value) => {
                started.push(value);
                await blocked;
            },
            { concurrency: 3, signal: controller.signal },
        );
        await vi.waitFor(() => expect(started).toHaveLength(3));
        controller.abort();
        release();
        await running;

        expect(started).toEqual([0, 1, 2]);
    });
});
