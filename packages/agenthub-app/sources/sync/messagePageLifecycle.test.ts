import { describe, expect, it, vi } from 'vitest';
import type { ApiMessage } from './apiTypes';
import { runMessagePageLifecycle } from './messagePageLifecycle';

const request = () => ({
    signal: new AbortController().signal,
    assertCurrent: vi.fn(),
});

const messages = [] as ApiMessage[];

describe('runMessagePageLifecycle', () => {
    it('fails closed with AbortError when the account encryption is stale', async () => {
        const pageRequest = request();

        await expect(runMessagePageLifecycle({
            sessionId: 'session-1',
            messages,
            request: pageRequest,
            accountEncryption: null,
            processPage: vi.fn(),
        })).rejects.toMatchObject({ name: 'AbortError' });

        expect(pageRequest.assertCurrent).toHaveBeenCalledOnce();
    });

    it('does not process a page after the account generation becomes stale', async () => {
        const pageRequest = request();
        pageRequest.assertCurrent.mockImplementation(() => {
            throw new DOMException('stale', 'AbortError');
        });
        const processPage = vi.fn();

        await expect(runMessagePageLifecycle({
            sessionId: 'session-1',
            messages,
            request: pageRequest,
            accountEncryption: { getSessionEncryption: vi.fn() },
            processPage,
        })).rejects.toMatchObject({ name: 'AbortError' });

        expect(processPage).not.toHaveBeenCalled();
    });

    it('binds the session encryption and current-account assertion to page processing', async () => {
        const pageRequest = request();
        const sessionEncryption = { decryptMessages: vi.fn() };
        const getSessionEncryption = vi.fn(() => sessionEncryption);
        const processed = {
            normalizedMessages: [],
            minSeq: null,
            maxSeq: null,
            lifecycleThinkingState: null,
        };
        const processPage = vi.fn(async () => processed);

        await expect(runMessagePageLifecycle({
            sessionId: 'session-1',
            messages,
            request: pageRequest,
            accountEncryption: { getSessionEncryption },
            processPage,
        })).resolves.toBe(processed);

        expect(getSessionEncryption).toHaveBeenCalledWith('session-1');
        expect(processPage).toHaveBeenCalledWith({
            sessionId: 'session-1',
            messages,
            encryption: sessionEncryption,
            assertCurrent: pageRequest.assertCurrent,
        });
    });
});
