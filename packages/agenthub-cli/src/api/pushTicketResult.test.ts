import { describe, expect, it } from 'vitest';
import { classifyPushTicketChunk } from './pushTicketResult';

describe('classifyPushTicketChunk', () => {
    it('fails closed without retrying when the provider returns no tickets', () => {
        expect(classifyPushTicketChunk([])).toEqual({
            delivered: false,
            shouldRetry: false,
            errorCount: 0,
        });
    });

    it('retries when every provider ticket is an error', () => {
        expect(classifyPushTicketChunk([
            { status: 'error' },
            { status: 'error' },
        ])).toEqual({
            delivered: false,
            shouldRetry: true,
            errorCount: 2,
        });
    });

    it('reports delivery when at least one ticket succeeds', () => {
        expect(classifyPushTicketChunk([
            { status: 'error' },
            { status: 'ok' },
        ])).toEqual({
            delivered: true,
            shouldRetry: false,
            errorCount: 1,
        });
    });
});
