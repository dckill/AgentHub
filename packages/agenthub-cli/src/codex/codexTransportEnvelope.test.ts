import { describe, expect, it } from 'vitest';
import {
    buildCodexRequest,
    buildCodexNotification,
    buildCodexResponse,
} from './codexTransportEnvelope';

describe('Codex transport envelope builders', () => {
    it('builds requests with numeric ids and optional params', () => {
        expect(buildCodexRequest(4, 'thread/read')).toEqual({
            jsonrpc: '2.0',
            id: 4,
            method: 'thread/read',
        });
        expect(buildCodexRequest(5, 'turn/start', { threadId: 'thread-1' })).toEqual({
            jsonrpc: '2.0',
            id: 5,
            method: 'turn/start',
            params: { threadId: 'thread-1' },
        });
    });

    it('builds notifications without an id and preserves optional params', () => {
        expect(buildCodexNotification('initialized')).toEqual({
            jsonrpc: '2.0',
            method: 'initialized',
        });
        expect(buildCodexNotification('thread/start', { model: 'codex' })).toEqual({
            jsonrpc: '2.0',
            method: 'thread/start',
            params: { model: 'codex' },
        });
    });

    it('builds responses with a stable JSON-RPC version and result', () => {
        expect(buildCodexResponse(12, { ok: true })).toEqual({
            jsonrpc: '2.0',
            id: 12,
            result: { ok: true },
        });
    });
});
