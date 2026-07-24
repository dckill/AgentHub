import { describe, expect, it } from 'vitest';
import {
  buildWindowsDaemonLauncherScript,
  buildWindowsDaemonTaskAction,
  getWindowsDaemonLauncherPath,
} from './launcher';

describe('Windows daemon hidden launcher', () => {
  it('runs start-sync through a hidden PowerShell task host', () => {
    const launcherPath = getWindowsDaemonLauncherPath("C:\\Users\\O'Shadow\\.agenthub");
    const script = buildWindowsDaemonLauncherScript(
      'C:\\Program Files\\nodejs\\node.exe',
      "C:\\Users\\O'Shadow\\agenthub\\dist\\index.mjs",
    );
    const action = buildWindowsDaemonTaskAction(launcherPath);

    expect(launcherPath).toBe("C:\\Users\\O'Shadow\\.agenthub\\daemon-start.ps1");
    expect(script).toContain("& 'C:\\Program Files\\nodejs\\node.exe'");
    expect(script).toContain("'C:\\Users\\O''Shadow\\agenthub\\dist\\index.mjs' daemon start-sync");
    expect(script).toContain('exit $LASTEXITCODE');
    expect(action).toContain('-WindowStyle Hidden');
    expect(action).toContain('-NonInteractive');
    expect(action).toContain(`-File \"${launcherPath}\"`);
    expect(action.length).toBeLessThanOrEqual(262);
  });
});
