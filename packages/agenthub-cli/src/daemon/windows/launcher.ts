import { win32 } from 'node:path';

const WINDOWS_DAEMON_LAUNCHER = 'daemon-start.ps1';

function quotePowerShellLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

export function getWindowsDaemonLauncherPath(agentHubHomeDir: string): string {
    return win32.join(agentHubHomeDir, WINDOWS_DAEMON_LAUNCHER);
}

export function buildWindowsDaemonLauncherScript(nodeExec: string, entrypoint: string): string {
    return [
        "$ErrorActionPreference = 'Stop'",
        `& ${quotePowerShellLiteral(nodeExec)} --no-warnings --no-deprecation ${quotePowerShellLiteral(entrypoint)} daemon start-sync`,
        'exit $LASTEXITCODE',
        '',
    ].join('\r\n');
}

export function buildWindowsDaemonTaskAction(launcherPath: string): string {
    return `powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File \"${launcherPath}\"`;
}
