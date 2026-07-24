import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { MessageCatchupBuffer } from './messageCatchupBuffer';

type TestMessage = { id: string };

describe('MessageCatchupBuffer', () => {
    it('coalesces pages until the bounded commit threshold is reached', () => {
        const commit = vi.fn();
        const buffer = new MessageCatchupBuffer<TestMessage>(3, commit);

        buffer.push([{ id: 'm1' }], { minSeq: 1, maxSeq: 1 });
        buffer.push([{ id: 'm2' }, { id: 'm3' }], { minSeq: 2, maxSeq: 3 });

        expect(commit).toHaveBeenCalledTimes(1);
        expect(commit).toHaveBeenCalledWith({
            messages: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }],
            minSeq: 1,
            maxSeq: 3,
        });
    });

    it('flushes a final partial batch exactly once', () => {
        const commit = vi.fn();
        const buffer = new MessageCatchupBuffer<TestMessage>(3, commit);

        buffer.push([{ id: 'm1' }], { minSeq: 10, maxSeq: 10 });
        buffer.flush();
        buffer.flush();

        expect(commit).toHaveBeenCalledTimes(1);
        expect(commit).toHaveBeenCalledWith({
            messages: [{ id: 'm1' }],
            minSeq: 10,
            maxSeq: 10,
        });
    });

    it('does not commit or advance a partial checkpoint when catch-up is abandoned before flush', () => {
        const commit = vi.fn();
        const buffer = new MessageCatchupBuffer<TestMessage>(3, commit);

        buffer.push([{ id: 'm1' }], { minSeq: 10, maxSeq: 10 });

        expect(commit).not.toHaveBeenCalled();
    });

    it('commits an empty normalized page checkpoint so encrypted or unsupported records do not stall pagination', () => {
        const commit = vi.fn();
        const buffer = new MessageCatchupBuffer<TestMessage>(3, commit);

        buffer.push([], { minSeq: 20, maxSeq: 21 });
        expect(commit).not.toHaveBeenCalled();

        buffer.flush();

        expect(commit).toHaveBeenCalledWith({
            messages: [],
            minSeq: 20,
            maxSeq: 21,
        });
    });

    it('reduces a 100-page 10k catch-up to ten ordered store commits', () => {
        const commits: Array<{ messages: TestMessage[]; minSeq: number | null; maxSeq: number | null }> = [];
        const buffer = new MessageCatchupBuffer<TestMessage>(1_000, batch => commits.push(batch));

        for (let page = 0; page < 100; page += 1) {
            const firstSeq = page * 100 + 1;
            buffer.push(
                Array.from({ length: 100 }, (_, index) => ({ id: `m-${firstSeq + index}` })),
                { minSeq: firstSeq, maxSeq: firstSeq + 99 },
            );
        }
        buffer.flush();

        expect(commits).toHaveLength(10);
        expect(commits.every(commit => commit.messages.length === 1_000)).toBe(true);
        expect(commits[0]).toMatchObject({ minSeq: 1, maxSeq: 1_000 });
        expect(commits[9]).toMatchObject({ minSeq: 9_001, maxSeq: 10_000 });
        expect(commits.flatMap(commit => commit.messages).map(message => message.id)).toEqual(
            Array.from({ length: 10_000 }, (_, index) => `m-${index + 1}`),
        );
    });

    it('is wired into multi-page catch-up instead of committing every 100-message page directly', () => {
        const source = readFileSync(new URL('./sync.ts', import.meta.url), 'utf8');

        expect(source).toContain('new MessageCatchupBuffer<NormalizedMessage>');
        expect(source).toContain('catchup.push(processed.normalizedMessages');
        expect(source).toContain('catchup.flush()');
        expect(source.match(/this\.applyMessages\(sessionId, processed\.normalizedMessages\);/g)).toHaveLength(2);
    });
});
