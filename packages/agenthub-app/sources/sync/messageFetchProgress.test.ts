import { describe, expect, it } from 'vitest';
import { getMessageFetchProgress } from './messageFetchProgress';

describe('getMessageFetchProgress', () => {
    it('continues when the server has more pages and seq advances', () => {
        expect(getMessageFetchProgress({ hasMore: true, previousSeq: 10, nextSeq: 12 }))
            .toEqual({ continue: true, afterSeq: 12 });
    });

    it('stops when hasMore is false', () => {
        expect(getMessageFetchProgress({ hasMore: false, previousSeq: 10, nextSeq: 12 }))
            .toEqual({ continue: false, afterSeq: 12 });
    });

    it('stops when a page does not advance the sequence', () => {
        expect(getMessageFetchProgress({ hasMore: true, previousSeq: 10, nextSeq: 10 }))
            .toEqual({ continue: false, afterSeq: 10 });
    });

    it('stops when a malformed page regresses the sequence', () => {
        expect(getMessageFetchProgress({ hasMore: true, previousSeq: 10, nextSeq: 9 }))
            .toEqual({ continue: false, afterSeq: 9 });
    });
});
