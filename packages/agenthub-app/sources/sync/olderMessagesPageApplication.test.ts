import { describe, expect, it } from 'vitest';
import { applyOlderMessagesPage } from './olderMessagesPageApplication';

describe('applyOlderMessagesPage', () => {
    it('prepends the older page and preserves the furthest last sequence', () => {
        expect(applyOlderMessagesPage({
            currentFirstSeq: 50,
            currentLastSeq: 100,
            processedMinSeq: 12,
            processedMaxSeq: 40,
            hasMore: true,
        })).toEqual({
            firstSeq: 12,
            lastSeq: 100,
            hasMoreBefore: true,
            isLoadingBefore: false,
        });
    });

    it('keeps existing bounds when a page has no sequence bounds', () => {
        expect(applyOlderMessagesPage({
            currentFirstSeq: 50,
            currentLastSeq: 100,
            processedMinSeq: null,
            processedMaxSeq: null,
            hasMore: false,
        })).toEqual({
            firstSeq: 50,
            lastSeq: 100,
            hasMoreBefore: false,
            isLoadingBefore: false,
        });
    });

    it('uses the page maximum when no local last sequence exists', () => {
        expect(applyOlderMessagesPage({
            currentFirstSeq: undefined,
            currentLastSeq: undefined,
            processedMinSeq: 1,
            processedMaxSeq: 9,
            hasMore: false,
        })).toEqual({
            firstSeq: 1,
            lastSeq: 9,
            hasMoreBefore: false,
            isLoadingBefore: false,
        });
    });
});
