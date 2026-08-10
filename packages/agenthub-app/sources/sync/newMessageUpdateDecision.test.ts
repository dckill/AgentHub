import { describe, expect, it } from 'vitest';
import { buildNewMessageUpdateDecision } from './newMessageUpdateDecision';

describe('buildNewMessageUpdateDecision', () => {
    it('ignores updates when decryption did not produce a message', () => {
        expect(buildNewMessageUpdateDecision({
            hasDecryptedMessage: false,
            hasNormalizedMessage: false,
            currentLastSeq: 9,
            incomingSeq: 10,
        })).toEqual({ action: 'ignore' });
    });

    it('refreshes when decryption succeeds but normalization rejects the message', () => {
        expect(buildNewMessageUpdateDecision({
            hasDecryptedMessage: true,
            hasNormalizedMessage: false,
            currentLastSeq: 9,
            incomingSeq: 10,
        })).toEqual({ action: 'refresh' });
    });

    it('enqueues a normalized message when its sequence is consecutive', () => {
        expect(buildNewMessageUpdateDecision({
            hasDecryptedMessage: true,
            hasNormalizedMessage: true,
            currentLastSeq: 9,
            incomingSeq: 10,
        })).toEqual({ action: 'enqueue' });
    });

    it('refreshes when a normalized message has a sequence gap', () => {
        expect(buildNewMessageUpdateDecision({
            hasDecryptedMessage: true,
            hasNormalizedMessage: true,
            currentLastSeq: 9,
            incomingSeq: 11,
        })).toEqual({ action: 'refresh' });
    });

    it('refreshes when there is no local sequence baseline', () => {
        expect(buildNewMessageUpdateDecision({
            hasDecryptedMessage: true,
            hasNormalizedMessage: true,
            currentLastSeq: undefined,
            incomingSeq: 1,
        })).toEqual({ action: 'refresh' });
    });
});
