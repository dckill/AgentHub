import { describe, expect, it } from 'vitest';
import { parseCodexTransportLine } from './codexTransportMessage';

describe('parseCodexTransportLine', () => {
    it('ignores blank lines and invalid JSON without throwing', () => {
        expect(parseCodexTransportLine('   ')).toEqual({ kind: 'empty' });
        expect(parseCodexTransportLine('{not-json')).toEqual({ kind: 'invalid-json' });
    });

    it('classifies successful and failed JSON-RPC responses', () => {
        expect(parseCodexTransportLine('{"jsonrpc":"2.0","id":7,"result":{"ok":true}}')).toEqual({
            kind: 'response',
            id: 7,
            result: { ok: true },
        });
        expect(parseCodexTransportLine('{"jsonrpc":"2.0","id":8,"error":{"code":-32000,"message":"nope"}}')).toEqual({
            kind: 'response',
            id: 8,
            error: { code: -32000, message: 'nope' },
        });
    });

    it('classifies server requests and notifications while preserving params', () => {
        expect(parseCodexTransportLine('{"id":9,"method":"exec/request","params":{"command":["pwd"]}}')).toEqual({
            kind: 'server-request',
            id: 9,
            method: 'exec/request',
            params: { command: ['pwd'] },
        });
        expect(parseCodexTransportLine('{"method":"turn/started","params":{"turn":{"id":"turn-1"}}}')).toEqual({
            kind: 'notification',
            method: 'turn/started',
            params: { turn: { id: 'turn-1' } },
        });
    });

    it('rejects objects that do not represent a JSON-RPC message', () => {
        expect(parseCodexTransportLine('[]')).toEqual({ kind: 'ignored' });
        expect(parseCodexTransportLine('{"id":"wrong","result":true}')).toEqual({ kind: 'ignored' });
        expect(parseCodexTransportLine('{"method":123}')).toEqual({ kind: 'ignored' });
    });
});
