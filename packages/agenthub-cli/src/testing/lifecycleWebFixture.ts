import type { Metadata } from '@/api/types';

export type LifecycleFixtureMode = 'cooperative' | 'stubborn';

export function createLifecycleFixtureChildScript(mode: LifecycleFixtureMode): string {
  const signalHandler = mode === 'cooperative'
    ? "process.on('SIGTERM', () => setTimeout(() => process.exit(0), 900));"
    : "process.on('SIGTERM', () => {});";
  return `${signalHandler} process.stdout.write('ready\\n'); setInterval(() => {}, 1000);`;
}

export interface LifecycleFixtureMetadataOptions {
  cwd: string;
  homeDir: string;
  machineId: string;
  hostPid: number;
  host: string;
}

export function createLifecycleFixtureMetadata(options: LifecycleFixtureMetadataOptions): Metadata {
  return {
    path: options.cwd,
    host: options.host,
    name: 'Lifecycle timeout fixture',
    machineId: options.machineId,
    homeDir: options.homeDir,
    agentHubHomeDir: options.homeDir,
    agentHubLibDir: options.homeDir,
    agentHubToolsDir: options.homeDir,
    hostPid: options.hostPid,
    startedBy: 'terminal',
    lifecycleState: 'running',
    lifecycleStateSince: Date.now(),
    flavor: 'codex',
  };
}

interface PrivateLifecycleFixtureReport {
  sessionId: string;
  machineId: string;
  childPid: number;
  token: string;
  encryptionKey: string;
}

export function publicLifecycleFixtureReport(report: PrivateLifecycleFixtureReport) {
  return {
    sessionId: report.sessionId,
    machineId: report.machineId,
    childPid: report.childPid,
  };
}
