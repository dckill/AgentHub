import type { ChildProcess } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';

import { spawnCodexAppServerProcess } from './codexProcessSpawn';

describe('spawnCodexAppServerProcess', () => {
    it('keeps the stdio and cross-platform spawn contract in one boundary', () => {
        const process = { pid: 123 } as ChildProcess;
        const spawnProcess = vi.fn(() => process);
        const env = { PATH: '/usr/bin', AGENTHUB_TEST: '1' };

        const result = spawnCodexAppServerProcess({
            command: 'codex',
            args: ['app-server', '--listen', 'stdio://'],
            env,
            cwd: '/tmp/project',
            spawnProcess,
        });

        expect(result).toBe(process);
        expect(spawnProcess).toHaveBeenCalledWith(
            'codex',
            ['app-server', '--listen', 'stdio://'],
            {
                stdio: ['pipe', 'pipe', 'pipe'],
                env,
                cwd: '/tmp/project',
                windowsHide: true,
            },
        );
    });
});
