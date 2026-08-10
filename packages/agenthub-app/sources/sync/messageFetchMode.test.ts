import { describe, expect, it } from 'vitest';
import { getMessageFetchMode } from './messageFetchMode';

describe('getMessageFetchMode', () => {
    it('loads the latest page when there is no sequence or local history', () => {
        expect(getMessageFetchMode({ afterSeq: 0, hasLocalMessages: false })).toBe('latest');
    });

    it('catches up incrementally when a sequence baseline exists', () => {
        expect(getMessageFetchMode({ afterSeq: 12, hasLocalMessages: false })).toBe('catchup');
    });

    it('catches up when local messages exist even without a sequence baseline', () => {
        expect(getMessageFetchMode({ afterSeq: 0, hasLocalMessages: true })).toBe('catchup');
    });

    it('treats an absent sequence as the initial zero baseline', () => {
        expect(getMessageFetchMode({ afterSeq: undefined, hasLocalMessages: false })).toBe('latest');
    });
});
