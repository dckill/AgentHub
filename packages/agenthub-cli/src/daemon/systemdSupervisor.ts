import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { AGENTHUB_DAEMON_SERVICE_NAME, getLinuxSystemdServiceFile } from './linux/install';

export function isSystemdDaemonInstalled(options?: {
  platform?: NodeJS.Platform;
  homeDir?: string;
  exists?: (path: string) => boolean;
}): boolean {
  if ((options?.platform ?? process.platform) !== 'linux') return false;
  const serviceFile = getLinuxSystemdServiceFile(options?.homeDir ?? homedir());
  return (options?.exists ?? existsSync)(serviceFile);
}

export function startSystemdDaemon(): void {
  execFileSync(
    'systemctl',
    ['--user', 'start', `${AGENTHUB_DAEMON_SERVICE_NAME}.service`],
    { stdio: 'ignore' },
  );
}
