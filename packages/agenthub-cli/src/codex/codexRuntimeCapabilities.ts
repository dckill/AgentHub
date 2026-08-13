import { execSync } from 'node:child_process';
import { isCodexAppServerAvailable, isCodexGoalActionsAvailable } from './codexCapabilities';

function readCodexVersion(): string | null {
    try {
        return execSync('codex --version', { encoding: 'utf8', windowsHide: true }).trim();
    } catch {
        return null;
    }
}

export function isAppServerAvailable(): boolean {
    const version = readCodexVersion();
    return version !== null && isCodexAppServerAvailable(version);
}

export function isGoalActionsAvailable(): boolean {
    const version = readCodexVersion();
    return version !== null && isCodexGoalActionsAvailable(version);
}
