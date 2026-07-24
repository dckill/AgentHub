export type DaemonBundleReplacementRestartMode = 'systemd' | 'self-spawn';

export function getDaemonBundleReplacementRestartMode(
    env: Partial<Pick<NodeJS.ProcessEnv, 'INVOCATION_ID' | 'SYSTEMD_EXEC_PID'>>,
): DaemonBundleReplacementRestartMode {
    if (env.INVOCATION_ID || env.SYSTEMD_EXEC_PID) {
        return 'systemd';
    }
    return 'self-spawn';
}
