import { describe, expect, it, vi } from 'vitest';
import {
    runMessageFetchRequestApplication,
    type MessageFetchRequestApplicationParams,
} from './messageFetchRequestApplication';

type Request = { signal: AbortSignal; assertCurrent: () => void };

function baseParams(): MessageFetchRequestApplicationParams<Request> {
    return {
        sessionId: 'session-1',
        request: { signal: new AbortController().signal, assertCurrent: vi.fn() },
        getSessionEncryption: () => ({}),
        getLastSeq: () => 10,
        hasLocalMessages: () => true,
        pages: {} as MessageFetchRequestApplicationParams<Request>['pages'],
        onMissingEncryption: vi.fn(),
        onCompleted: vi.fn(),
        runPages: vi.fn(async () => 3),
    };
}

describe('runMessageFetchRequestApplication', () => {
    it('fails closed and reports a retryable missing encryption state', async () => {
        const params = baseParams();
        params.getSessionEncryption = () => null;

        await expect(runMessageFetchRequestApplication(params)).rejects.toThrow('Session encryption not ready for session-1');
        expect(params.onMissingEncryption).toHaveBeenCalledWith('Session encryption not ready for session-1');
        expect(params.runPages).not.toHaveBeenCalled();
    });

    it('selects catch-up mode and reports the processed count after the page runner succeeds', async () => {
        const params = baseParams();

        await expect(runMessageFetchRequestApplication(params)).resolves.toBeUndefined();
        expect(params.runPages).toHaveBeenCalledWith(expect.objectContaining({
            mode: 'catchup',
            sessionId: 'session-1',
            initialAfterSeq: 10,
            request: params.request,
        }));
        expect(params.onCompleted).toHaveBeenCalledWith('catchup', 3);
    });
});
