import { describe, expect, it } from 'vitest';
import {
    createRpcFailure,
    parseRpcRequest,
    parseRpcResponse,
    rpcMethodNames,
} from '@artsum/agenthub-wire';

describe('workspace Wire RPC package contract', () => {
    it('exports every built-in RPC family through the package entrypoint', () => {
        expect(rpcMethodNames).toEqual(expect.arrayContaining([
            'abort',
            'permission',
            'killSession',
            'readFile',
            'spawn-agenthub-session',
            'resume-agenthub-session',
            'claude-list-rewind-points',
            'codex-list-official-threads',
        ]));
    });

    it('shares validation and encrypted failure envelope semantics with the App', () => {
        expect(() => parseRpcRequest('readFile', { path: 42 })).toThrow();
        expect(parseRpcResponse('abort', null)).toBeNull();
        expect(createRpcFailure('INVALID_RESPONSE', 'bad daemon payload')).toEqual({
            __rpcError: { code: 'INVALID_RESPONSE', message: 'bad daemon payload' },
        });
    });
});
