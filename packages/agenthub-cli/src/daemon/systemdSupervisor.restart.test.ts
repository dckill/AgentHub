import { describe, expect, it, vi } from 'vitest';

const execFileSync = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ execFileSync }));
vi.mock('./linux/install', () => ({
    AGENTHUB_DAEMON_SERVICE_NAME: 'agenthub-daemon',
    getLinuxSystemdServiceFile: vi.fn(),
}));

import { restartSystemdDaemon } from './systemdSupervisor';

describe('restartSystemdDaemon', () => {
    it('delegates replacement to the user systemd unit', () => {
        restartSystemdDaemon();

        expect(execFileSync).toHaveBeenCalledWith(
            'systemctl',
            ['--user', 'restart', 'agenthub-daemon.service'],
            { stdio: 'ignore' },
        );
    });
});
