import { describe, expect, it, vi } from 'vitest';
import { terminateCodexProcess } from './codexProcessTermination';

describe('terminateCodexProcess', () => {
    it('closes the stream, requests SIGTERM and installs a SIGKILL fallback', () => {
        const close = vi.fn();
        const end = vi.fn();
        const kill = vi.fn();
        const killProcess = vi.fn();
        let forceKill: (() => void) | undefined;
        const timer = { unref: vi.fn() } as unknown as ReturnType<typeof setTimeout>;

        terminateCodexProcess({
            readline: { close },
            proc: { stdin: { end }, kill },
            pid: 123,
            schedule: (callback) => {
                forceKill = callback;
                return timer;
            },
            killProcess,
        });

        expect(close).toHaveBeenCalledOnce();
        expect(end).toHaveBeenCalledOnce();
        expect(kill).toHaveBeenCalledWith('SIGTERM');
        expect(timer.unref).toHaveBeenCalledOnce();

        forceKill?.();
        expect(killProcess).toHaveBeenNthCalledWith(1, 123, 0);
        expect(killProcess).toHaveBeenNthCalledWith(2, 123, 'SIGKILL');
    });

    it('fails closed when process termination itself throws', () => {
        const kill = vi.fn(() => { throw new Error('already exited'); });
        expect(() => terminateCodexProcess({
            proc: { kill, stdin: { end: vi.fn(() => { throw new Error('closed'); }) } },
            pid: 456,
            schedule: () => ({ unref: vi.fn() } as unknown as ReturnType<typeof setTimeout>),
            killProcess: vi.fn(() => { throw new Error('gone'); }),
        })).not.toThrow();
    });
});
