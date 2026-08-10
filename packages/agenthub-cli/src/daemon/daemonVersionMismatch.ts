export type DaemonVersionMismatchResolution = 'systemd' | 'self-spawn' | 'not-running';

export async function resolveDaemonVersionMismatch(options: {
    daemonRunning?: boolean;
    systemdInstalled: boolean;
    restartSystemdDaemon: () => void | Promise<void>;
    stopDaemon: () => void | Promise<void>;
}): Promise<DaemonVersionMismatchResolution> {
    if (options.daemonRunning === false) {
        return 'not-running';
    }
    if (options.systemdInstalled) {
        await options.restartSystemdDaemon();
        return 'systemd';
    }

    await options.stopDaemon();
    return 'self-spawn';
}
