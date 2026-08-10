import { describe, expect, it } from 'vitest';
import {
    applyCatchupMessagesChunk,
    applyLatestMessagesPage,
} from './messagePaginationApplication';

describe('message pagination application', () => {
    it('keeps the existing bounds for an empty latest page while applying hasMore', () => {
        expect(applyLatestMessagesPage({
            currentFirstSeq: 10,
            currentLastSeq: 20,
            processedMinSeq: null,
            processedMaxSeq: null,
            hasMore: false,
        })).toEqual({
            firstSeq: 10,
            lastSeq: 20,
            hasMoreBefore: false,
            isLoadingBefore: false,
        });
    });

    it('does not regress the first bound when an older page is out of order', () => {
        expect(applyCatchupMessagesChunk({
            currentFirstSeq: 10,
            currentLastSeq: 20,
            processedMinSeq: 15,
            processedMaxSeq: 18,
        })).toEqual({ firstSeq: 10, lastSeq: 18 });
    });

    it('adopts the first page bounds when no local cursor exists', () => {
        expect(applyCatchupMessagesChunk({
            currentFirstSeq: undefined,
            currentLastSeq: undefined,
            processedMinSeq: 3,
            processedMaxSeq: 7,
        })).toEqual({ firstSeq: 3, lastSeq: 7 });
    });
});
