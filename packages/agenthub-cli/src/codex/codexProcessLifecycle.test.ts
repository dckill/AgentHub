import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { attachCodexProcessLifecycle } from './codexProcessLifecycle';

function stream(): EventEmitter {
    return new EventEmitter();
}

describe('attachCodexProcessLifecycle', () => {
    it('routes current stdout/stderr events and ignores stale generations', () => {
        const proc = Object.assign(new EventEmitter(), {
            stdout: stream(),
            stderr: stream(),
        });
        const readline = new EventEmitter();
        const onLine = vi.fn();
        const onStderr = vi.fn();
        const onStaleExit = vi.fn();
        let current = true;

        attachCodexProcessLifecycle({
            proc,
            epoch: 3,
            isCurrent: () => current,
            createReadline: () => readline,
            onProcessError: vi.fn(),
            onProcessExit: vi.fn(),
            onStaleExit,
            onStderr,
            onLine,
        });

        proc.stderr.emit('data', Buffer.from(' warning\n'));
        readline.emit('line', '{"id":1}');
        expect(onStderr).toHaveBeenCalledWith('warning');
        expect(onLine).toHaveBeenCalledWith('{"id":1}', 3);

        current = false;
        proc.stderr.emit('data', Buffer.from('stale\n'));
        readline.emit('line', '{"id":2}');
        proc.emit('exit', 0, null);
        expect(onStderr).toHaveBeenCalledTimes(1);
        expect(onLine).toHaveBeenCalledTimes(1);
        expect(onStaleExit).toHaveBeenCalledTimes(1);
    });

    it('forwards process errors and current exits without changing payloads', () => {
        const proc = Object.assign(new EventEmitter(), {
            stdout: stream(),
            stderr: stream(),
        });
        const onProcessError = vi.fn();
        const onProcessExit = vi.fn();

        attachCodexProcessLifecycle({
            proc,
            epoch: 7,
            isCurrent: () => true,
            createReadline: () => new EventEmitter(),
            onProcessError,
            onProcessExit,
            onStderr: vi.fn(),
            onLine: vi.fn(),
        });

        const error = new Error('spawn failed');
        proc.emit('error', error);
        proc.emit('exit', 137, 'SIGKILL');

        expect(onProcessError).toHaveBeenCalledWith(error);
        expect(onProcessExit).toHaveBeenCalledWith(137, 'SIGKILL');
    });
});
