import { describe, expect, it, vi } from 'vitest';
import { resolveDaemonVersionMismatch } from './daemonVersionMismatch';

describe('resolveDaemonVersionMismatch', () => {
    it('does not restart or stop anything when no daemon is running', async () => {
        const restartSystemdDaemon = vi.fn();
        const stopDaemon = vi.fn();

        await expect(resolveDaemonVersionMismatch({
            daemonRunning: false,
            systemdInstalled: true,
            restartSystemdDaemon,
            stopDaemon,
        })).resolves.toBe('not-running');

        expect(restartSystemdDaemon).not.toHaveBeenCalled();
        expect(stopDaemon).not.toHaveBeenCalled();
    });

    it('delegates replacement to systemd when the user unit is installed', async () => {
        const restartSystemdDaemon = vi.fn();
        const stopDaemon = vi.fn();

        await expect(resolveDaemonVersionMismatch({
            systemdInstalled: true,
            restartSystemdDaemon,
            stopDaemon,
        })).resolves.toBe('systemd');

        expect(restartSystemdDaemon).toHaveBeenCalledTimes(1);
        expect(stopDaemon).not.toHaveBeenCalled();
    });

    it('keeps the self-replacement path when systemd is not installed', async () => {
        const restartSystemdDaemon = vi.fn();
        const stopDaemon = vi.fn();

        await expect(resolveDaemonVersionMismatch({
            systemdInstalled: false,
            restartSystemdDaemon,
            stopDaemon,
        })).resolves.toBe('self-spawn');

        expect(stopDaemon).toHaveBeenCalledTimes(1);
        expect(restartSystemdDaemon).not.toHaveBeenCalled();
    });
});
