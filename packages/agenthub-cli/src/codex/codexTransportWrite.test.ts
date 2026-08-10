import { describe, expect, it, vi } from 'vitest';
import { writeCodexTransportMessage } from './codexTransportWrite';

describe('writeCodexTransportMessage', () => {
    it('serializes one JSON-RPC message per line', () => {
        const write = vi.fn();
        expect(writeCodexTransportMessage({
            stdin: { writable: true, write },
            message: { jsonrpc: '2.0', method: 'turn/interrupt' },
        })).toBe(true);
        expect(write).toHaveBeenCalledWith('{"jsonrpc":"2.0","method":"turn/interrupt"}\n');
    });

    it('fails closed when stdin is absent or not writable', () => {
        const write = vi.fn();
        expect(writeCodexTransportMessage({ stdin: null, message: {} })).toBe(false);
        expect(writeCodexTransportMessage({ stdin: { writable: false, write }, message: {} })).toBe(false);
        expect(write).not.toHaveBeenCalled();
    });
});
