import { describe, expect, it, vi } from 'vitest';
import { runMessageFetchPages } from './messageFetchPageApplication';

function createParams(mode: 'latest' | 'catchup') {
    const request = {
        signal: new AbortController().signal,
        assertCurrent: vi.fn(),
    };
    const fetchPage = vi.fn(async (path: string) => ({
        path,
        messages: [],
        hasMore: false,
    }));
    const processPage = vi.fn(async () => ({
        normalizedMessages: [],
        minSeq: null,
        maxSeq: null,
        lifecycleThinkingState: null as boolean | null,
    }));

    return {
        mode,
        sessionId: 'session-1',
        initialAfterSeq: 0,
        request,
        fetchPage,
        processPage,
        currentFirstSeq: () => undefined,
        currentLastSeq: () => undefined,
        applyMessages: vi.fn(),
        setFirstSeq: vi.fn(),
        setLastSeq: vi.fn(),
        setHasMoreBefore: vi.fn(),
        recordSuccess: vi.fn(),
        applyHistoryState: vi.fn(),
        applyLifecycleThinkingState: vi.fn(),
        markLoaded: vi.fn(),
        logStalled: vi.fn(),
    };
}

describe('runMessageFetchPages', () => {
    it('runs the latest page and closes the loaded/history lifecycle', async () => {
        const params = createParams('latest');

        await expect(runMessageFetchPages(params)).resolves.toBe(0);

        expect(params.fetchPage).toHaveBeenCalledWith(
            '/v3/sessions/session-1/messages?direction=backward&limit=100',
            params.request,
        );
        expect(params.applyHistoryState).toHaveBeenCalledWith({ hasMoreBefore: false, isLoadingBefore: false });
        expect(params.applyLifecycleThinkingState).toHaveBeenCalledWith(null);
        expect(params.markLoaded).toHaveBeenCalledTimes(1);
    });

    it('runs catch-up pages and applies the final thinking state before marking loaded', async () => {
        const params = createParams('catchup');

        await expect(runMessageFetchPages(params)).resolves.toBe(0);

        expect(params.fetchPage).toHaveBeenCalledWith(
            '/v3/sessions/session-1/messages?after_seq=0&limit=100',
            params.request,
        );
        expect(params.applyLifecycleThinkingState).toHaveBeenCalledWith(null);
        expect(params.markLoaded).toHaveBeenCalledTimes(1);
        expect(params.applyHistoryState).not.toHaveBeenCalled();
    });

    it('rechecks account generation before committing catch-up thinking and loaded state', async () => {
        const params = createParams('catchup');
        params.processPage.mockResolvedValue({
            normalizedMessages: [],
            minSeq: null,
            maxSeq: null,
            lifecycleThinkingState: true,
        });

        let assertionCount = 0;
        params.request.assertCurrent.mockImplementation(() => {
            assertionCount += 1;
            // The catch-up worker has already completed its own final check;
            // model an account switch before the outer lifecycle commits the
            // derived thinking/loaded state.
            if (assertionCount === 3) {
                throw new DOMException('stale account', 'AbortError');
            }
        });

        await expect(runMessageFetchPages(params)).rejects.toMatchObject({ name: 'AbortError' });
        expect(params.applyLifecycleThinkingState).not.toHaveBeenCalled();
        expect(params.markLoaded).not.toHaveBeenCalled();
    });
});
