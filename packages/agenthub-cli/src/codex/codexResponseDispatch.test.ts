import { describe, expect, it, vi } from 'vitest';
import { dispatchCodexResponse } from './codexResponseDispatch';

describe('dispatchCodexResponse', () => {
    it('writes a response and reports its id when stdin is writable', () => {
        const stdin = { writable: true, write: vi.fn() };
        const onWrite = vi.fn();

        expect(dispatchCodexResponse({
            stdin,
            id: 17,
            result: { decision: 'approved' },
            onWrite,
        })).toBe(true);

        expect(stdin.write).toHaveBeenCalledWith(expect.stringContaining('"id":17'));
        expect(onWrite).toHaveBeenCalledWith(17);
    });

    it('fails closed without writing when stdin is unavailable', () => {
        const stdin = { writable: false, write: vi.fn() };
        const onWrite = vi.fn();

        expect(dispatchCodexResponse({ stdin, id: 17, result: {}, onWrite })).toBe(false);
        expect(stdin.write).not.toHaveBeenCalled();
        expect(onWrite).not.toHaveBeenCalled();
    });
});
