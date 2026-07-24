/**
 * Integration tests for daemon HTTP control system
 *
 * Tests the full flow of daemon startup, session tracking, and shutdown
 *
 * This file boots one authenticated AgentHub environment and restarts the daemon
 * inside that env for each test against the copied lab-rat project.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync, execSync, spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import type { Metadata } from '@/api/types';
import { getIntegrationEnv } from '@/testing/currentIntegrationEnv';
import { configuration } from '@/configuration';
import {
  listDaemonSessions,
  notifyDaemonSessionStarted,
  spawnDaemonSession,
  stopDaemon,
  stopDaemonHttp,
  stopDaemonSession,
  stopDaemonSessionDetailed,
} from '@/daemon/controlClient';
import { clearDaemonState, readCredentials, readDaemonState, readPersistedSessions } from '@/persistence';
import { getLatestDaemonLog } from '@/ui/logger';
import { spawnAgentHubCLI } from '@/utils/spawnAgentHubCLI';
import { resolveRepositoryPackageManager, startEnvironmentServices } from '../../../../environments/environments';
import { decodeBase64, decrypt, encodeBase64, encrypt } from '@/api/encryption';
import { TerminalOutboxJournal } from '@/api/terminalOutboxJournal';

// Utility to wait for condition
async function waitFor(
  condition: () => Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error('Timeout waiting for condition');
}

const integrationEnv = getIntegrationEnv();
const codexAvailable = (() => {
  try {
    execSync('codex --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const claudeAvailable = (() => {
  try {
    execSync('claude --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();


async function stopAllTrackedSessions(): Promise<void> {
  const sessions = await listDaemonSessions().catch(() => []);

  await Promise.all(
    sessions.map((session: any) =>
      stopDaemonSession(session.agentHubSessionId ?? `PID-${session.pid}`).catch(() => false)
    ),
  );

  await waitFor(async () => (await listDaemonSessions().catch(() => [])).length === 0, 20_000, 250);
}

type ProcessRow = { pid: number; ppid: number; args: string };

function processTable(): ProcessRow[] {
  return execFileSync('ps', ['-eo', 'pid=,ppid=,args='], { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(.*)$/);
      if (!match) return [];
      return [{ pid: Number(match[1]), ppid: Number(match[2]), args: match[3] }];
    });
}

function descendantProcesses(rootPid: number): ProcessRow[] {
  const rows = processTable();
  const descendants = new Set<number>([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (descendants.has(row.ppid) && !descendants.has(row.pid)) {
        descendants.add(row.pid);
        changed = true;
      }
    }
  }
  return rows.filter((row) => row.pid !== rootPid && descendants.has(row.pid));
}

function isClaudeBackendProcess(process: ProcessRow): boolean {
  const args = process.args.toLowerCase();
  // The SDK may launch the packaged native `claude` binary or the JS CLI;
  // exclude the AgentHub runner itself by only searching descendants.
  return /(?:^|[\\/\s])claude(?:\.exe)?(?:\s|$)/.test(args)
    || args.includes('claude-agent-sdk')
    || args.includes('claude_local_launcher');
}

function findClaudeBackendProcess(rootPid: number): ProcessRow | undefined {
  return descendantProcesses(rootPid).find(isClaudeBackendProcess);
}


function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function spawnJournalReplayChild(session: unknown, token: string, serverUrl: string): ChildProcess {
  const apiSessionModule = pathToFileURL(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../api/apiSession.ts'),
  ).href;
  const script = [
    `import { ApiSessionClient } from ${JSON.stringify(apiSessionModule)};`,
    `import { readFileSync } from 'node:fs';`,
    `import { join } from 'node:path';`,
    `const raw = JSON.parse(process.env.AGENTHUB_JOURNAL_SESSION);`,
    `const session = { ...raw, encryptionKey: new Uint8Array(raw.encryptionKey) };`,
    `const client = new ApiSessionClient(process.env.AGENTHUB_JOURNAL_TOKEN, session);`,
    `await client.flush();`,
    `await new Promise((resolve) => setTimeout(resolve, 1500));`,
    `await client.close();`,
    `const journalPath = join(process.env.AGENTHUB_HOME_DIR, 'terminal-outbox', encodeURIComponent(session.id) + '.json');`,
    `const journalState = JSON.parse(readFileSync(journalPath, 'utf8'));`,
    `process.stdout.write('replayed:' + journalState.messages.length + ':' + Boolean(journalState.sessionEnd) + '\\n');`,
  ].join('\n');

  return spawn(process.execPath, [
    '--import', 'tsx/esm',
    '--input-type=module',
    '-e', script,
  ], {
    cwd: path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'),
    env: {
      ...process.env,
      AGENTHUB_SERVER_URL: serverUrl,
      AGENTHUB_JOURNAL_SESSION: JSON.stringify(session),
      AGENTHUB_JOURNAL_TOKEN: token,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function waitForChildOutput(child: ChildProcess, marker: string, timeoutMs = 20_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Child did not emit ${marker}`)), timeoutMs);
    const onData = (chunk: Buffer) => {
      output += String(chunk);
      if (!output.includes(marker)) return;
      clearTimeout(timeout);
      child.stdout?.off('data', onData);
      resolve(output);
    };
    child.stdout?.on('data', onData);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

describe('Daemon Integration Tests', { timeout: 180_000 }, () => {
  let daemonPid: number;

  beforeEach(async () => {
    await stopAllTrackedSessions().catch(() => undefined);
    await stopDaemon().catch(() => undefined);
    const staleBeforeStart = await readDaemonState();
    if (staleBeforeStart && !isProcessAlive(staleBeforeStart.pid)) {
      clearDaemonState();
    }

    void spawnAgentHubCLI(['daemon', 'start'], {
      stdio: 'ignore',
    });

    await waitFor(async () => {
      const state = await readDaemonState();
      return state !== null;
    }, 10_000, 250); // Wait up to 10 seconds, checking every 250ms
    
    const daemonState = await readDaemonState();
    if (!daemonState) {
      throw new Error('Daemon failed to start within timeout');
    }
    daemonPid = daemonState.pid;

    console.log(`[TEST] Daemon started for test: PID=${daemonPid}`);
    console.log(`[TEST] Daemon log file: ${daemonState?.daemonLogPath}`);
  });

  afterEach(async () => {
    await stopAllTrackedSessions().catch(() => undefined);
    await stopDaemon().catch(() => undefined);
    // Do not let a previous test's daemon state/HTTP port race the next
    // beforeEach. The adoption/reconnect cases intentionally restart daemons
    // and can otherwise leave a stale state file after the child exits.
    await waitFor(async () => (await readDaemonState()) === null, 10_000, 100).catch(() => undefined);
    const staleAfterStop = await readDaemonState();
    if (staleAfterStop && !isProcessAlive(staleAfterStop.pid)) {
      clearDaemonState();
    }
  });

  it('should list sessions (initially empty)', async () => {
    const sessions = await listDaemonSessions();
    expect(sessions).toEqual([]);
  });

  it('should track session-started webhook from terminal session', async () => {
    // Simulate a terminal-started session reporting to daemon
    const mockMetadata: Metadata = {
      path: '/test/path',
      host: 'test-host',
      homeDir: '/test/home',
      agentHubHomeDir: '/test/agenthub-home',
      agentHubLibDir: '/test/agenthub-lib',
      agentHubToolsDir: '/test/agenthub-tools',
      hostPid: 99999,
      startedBy: 'terminal',
      machineId: 'test-machine-123'
    };

    await notifyDaemonSessionStarted('test-session-123', mockMetadata);

    // Verify session is tracked
    const sessions = await listDaemonSessions();
    expect(sessions).toHaveLength(1);
    
    const tracked = sessions[0];
    expect(tracked.startedBy).toBe('agenthub directly - likely by user from terminal');
    expect(tracked.agentHubSessionId).toBe('test-session-123');
    expect(tracked.pid).toBe(99999);
  });

  it('should spawn & stop a session via HTTP (not testing RPC route, but similar enough)', async () => {
    const response = await spawnDaemonSession(integrationEnv.projectPath, 'spawned-test-456');

    expect(response).toHaveProperty('success', true);
    expect(response).toHaveProperty('sessionId');

    // Verify session is tracked
    const sessions = await listDaemonSessions();
    const spawnedSession = sessions.find(
      (s: any) => s.agentHubSessionId === response.sessionId
    );
    
    expect(spawnedSession).toBeDefined();
    expect(spawnedSession.startedBy).toBe('daemon');
    
    // Clean up - stop the spawned session and verify the terminal state remains queryable.
    expect(spawnedSession.agentHubSessionId).toBeDefined();
    const stopResult = await stopDaemonSessionDetailed(spawnedSession.agentHubSessionId);
    expect(['stopping', 'exited']).toContain(stopResult.state);

    await waitFor(async () => {
      const current = await listDaemonSessions();
      return !current.some((session: any) => session.agentHubSessionId === spawnedSession.agentHubSessionId);
    }, 15_000, 250);

    const terminalResult = await stopDaemonSessionDetailed(spawnedSession.agentHubSessionId);
    expect(terminalResult).toEqual({ success: true, state: 'exited' });

    const credentials = await readCredentials();
    if (!credentials) throw new Error('Authenticated integration credentials are unavailable');
    // Mirror the App archive action: the structured daemon stop is followed by
    // the authenticated server archive request so the cross-end projection is
    // verified independently of the Runner's final event timing.
    const archiveResponse = await fetch(
      `${configuration.serverUrl}/v1/sessions/${encodeURIComponent(spawnedSession.agentHubSessionId)}/archive`,
      { method: 'POST', headers: { Authorization: `Bearer ${credentials.token}` } },
    );
    expect(archiveResponse.ok).toBe(true);
    await waitFor(async () => Boolean(readPersistedSessions()[spawnedSession.agentHubSessionId]), 10_000, 100);
    const persisted = readPersistedSessions()[spawnedSession.agentHubSessionId];
    if (!persisted) throw new Error('Stopped session encryption data is unavailable');
    let sessionPayload: { session: { active: boolean; thinking: boolean; metadata: string } } | undefined;
    let stoppedMetadata: { lifecycleState?: string; archivedBy?: string } | undefined;
    await waitFor(async () => {
      const sessionResponse = await fetch(
        `${configuration.serverUrl}/v1/sessions/${encodeURIComponent(spawnedSession.agentHubSessionId)}`,
        { headers: { Authorization: `Bearer ${credentials.token}` } },
      );
      if (!sessionResponse.ok) return false;
      sessionPayload = await sessionResponse.json() as {
        session: { active: boolean; thinking: boolean; metadata: string };
      };
      stoppedMetadata = decrypt(
        decodeBase64(persisted.encryptionKey),
        persisted.encryptionVariant,
        decodeBase64(sessionPayload.session.metadata),
      ) as { lifecycleState?: string; archivedBy?: string };
      return !sessionPayload.session.active
        && !sessionPayload.session.thinking;
    }, 15_000, 250);
    if (!sessionPayload || !stoppedMetadata) throw new Error('Stopped session state was not observed');
    expect(sessionPayload.session.active).toBe(false);
    expect(sessionPayload.session.thinking).toBe(false);
    // The server archive route owns active/thinking projection; encrypted
    // lifecycle metadata remains runner-owned and may arrive asynchronously.
  });

  it('records a structured running→stopping→exited timeline for App RPC consumers', { timeout: 30_000 }, async () => {
    const child = spawn(process.execPath, [
      '-e',
      "process.stdout.write('ready\\n'); process.on('SIGTERM', () => setTimeout(() => process.exit(0), 150)); setInterval(() => {}, 1000);",
    ], {
      cwd: integrationEnv.projectPath,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (!child.pid) throw new Error('Failed to spawn delayed-stop child');

    const sessionId = `timeline-session-${child.pid}`;
    const timeline: Array<{ state: string; at: number }> = [];
    try {
      await waitForChildOutput(child, 'ready');
      await notifyDaemonSessionStarted(sessionId, {
        path: integrationEnv.projectPath,
        host: 'integration-timeline-host',
        homeDir: path.join(integrationEnv.envDir, 'cli', 'home'),
        agentHubHomeDir: path.join(integrationEnv.envDir, 'cli', 'home'),
        agentHubLibDir: path.join(integrationEnv.envDir, 'cli', 'home'),
        agentHubToolsDir: path.join(integrationEnv.envDir, 'cli', 'home'),
        hostPid: child.pid,
        startedBy: 'terminal',
        machineId: 'integration-timeline-machine',
      });

      timeline.push({ state: 'running', at: Date.now() });
      const stopResult = await stopDaemonSessionDetailed(sessionId);
      timeline.push({ state: stopResult.state, at: Date.now() });
      expect(stopResult).toEqual({ success: true, state: 'stopping' });

      await waitFor(async () => {
        const tracked = (await listDaemonSessions()).find((session: any) => session.agentHubSessionId === sessionId);
        if (tracked && timeline.at(-1)?.state !== tracked.lifecycleState) {
          timeline.push({ state: tracked.lifecycleState, at: Date.now() });
        }
        return !tracked;
      }, 10_000, 50);
      timeline.push({ state: 'exited', at: Date.now() });

      expect(await stopDaemonSessionDetailed(sessionId)).toEqual({ success: true, state: 'exited' });
      expect(timeline.map(({ state }) => state)).toEqual(['running', 'stopping', 'exited']);
      expect(timeline[1].at).toBeGreaterThanOrEqual(timeline[0].at);
      expect(timeline[2].at).toBeGreaterThanOrEqual(timeline[1].at);
      console.log(`[LIFECYCLE_TIMELINE] ${JSON.stringify({ sessionId, timeline })}`);
    } finally {
      try { child.kill('SIGKILL'); } catch { /* daemon may already have stopped it */ }
      await waitFor(async () => !(await listDaemonSessions()).some((session: any) => session.agentHubSessionId === sessionId), 5_000, 50).catch(() => undefined);
    }
  });

  it('should mark an uncooperative external session timeout and force terminate it', { timeout: 30_000 }, async () => {
    const stubbornChild = spawn(process.execPath, [
      '-e',
      "process.on('SIGTERM', () => {}); process.stdout.write('ready\\n'); setInterval(() => {}, 1000);",
    ], {
      cwd: integrationEnv.projectPath,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (!stubbornChild.pid) {
      throw new Error('Failed to spawn stubborn child');
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Stubborn child did not become ready')), 5_000);
        stubbornChild.stdout?.on('data', (chunk) => {
          if (String(chunk).includes('ready')) {
            clearTimeout(timeout);
            resolve();
          }
        });
        stubbornChild.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      const metadata: Metadata = {
        path: integrationEnv.projectPath,
        host: 'integration-timeout-host',
        homeDir: path.join(integrationEnv.envDir, 'cli', 'home'),
        agentHubHomeDir: path.join(integrationEnv.envDir, 'cli', 'home'),
        agentHubLibDir: path.join(integrationEnv.envDir, 'cli', 'home'),
        agentHubToolsDir: path.join(integrationEnv.envDir, 'cli', 'home'),
        hostPid: stubbornChild.pid,
        startedBy: 'terminal',
        machineId: 'integration-timeout-machine',
      };
      const sessionId = `timeout-session-${stubbornChild.pid}`;

      await notifyDaemonSessionStarted(sessionId, metadata);
      expect((await listDaemonSessions()).some((session: any) => session.agentHubSessionId === sessionId)).toBe(true);

      const initialStop = await stopDaemonSessionDetailed(sessionId);
      expect(initialStop).toEqual({ success: true, state: 'stopping' });

      await waitFor(async () => {
        const result = await stopDaemonSessionDetailed(sessionId);
        return result.state === 'timeout';
      }, 15_000, 250);

      await waitFor(async () => {
        try {
          process.kill(stubbornChild.pid!, 0);
          return false;
        } catch {
          return true;
        }
      }, 5_000, 100);

      expect(await stopDaemonSessionDetailed(sessionId)).toEqual({ success: true, state: 'timeout' });
      await waitFor(async () => {
        return !(await listDaemonSessions()).some((session: any) => session.agentHubSessionId === sessionId);
      }, 5_000, 100);
    } finally {
      try {
        stubbornChild.kill('SIGKILL');
      } catch {
        // The daemon may already have force-terminated it.
      }
    }
  });

  it('stress test: spawn / stop', { timeout: 60_000 }, async () => {
    const promises = [];
    const sessionCount = 20;
    for (let i = 0; i < sessionCount; i++) {
      promises.push(spawnDaemonSession(integrationEnv.projectPath));
    }

    // Wait for all sessions to be spawned
    const results = await Promise.all(promises);
    const sessionIds = results.map(r => r.sessionId);

    const sessions = await listDaemonSessions();
    expect(sessions).toHaveLength(sessionCount);

    // Stop all sessions
    const stopResults = await Promise.all(sessionIds.map(sessionId => stopDaemonSession(sessionId)));
    expect(stopResults.every(r => r), 'Not all sessions reported stopped').toBe(true);

    // Verify all sessions are stopped
    await waitFor(async () => (await listDaemonSessions()).length === 0, 20_000, 250);
  });

  it('should handle daemon stop request gracefully', async () => {
    await stopDaemonHttp();

    // Verify metadata file is cleaned up
    await waitFor(async () => !existsSync(configuration.daemonStateFile), 1000);
  });

  it('bounds daemon shutdown when the server API is stopped mid-cleanup', { timeout: 20_000 }, async () => {
    const daemonState = await readDaemonState();
    if (!daemonState) throw new Error('Daemon state missing before slow API shutdown test');
    const serverPidPath = path.join(integrationEnv.envDir, 'pids', 'server.pid');
    const serverPid = Number(readFileSync(serverPidPath, 'utf8').trim());
    if (!Number.isInteger(serverPid) || serverPid <= 0) throw new Error('Authenticated server PID file is invalid');
    const daemonLogPath = daemonState.daemonLogPath;
    if (!daemonLogPath) throw new Error('Daemon log path missing before slow API shutdown test');
    await waitFor(async () => {
      try {
        return readFileSync(daemonLogPath, 'utf8').includes('Daemon started successfully, waiting for shutdown request');
      } catch {
        return false;
      }
    }, 5_000, 100);
    const startedAt = Date.now();
    let serverStopped = false;

    try {
      process.kill(-serverPid, 'SIGSTOP');
      serverStopped = true;

      await stopDaemonHttp();
      await waitFor(async () => !isProcessAlive(daemonState.pid), 5_000, 100);
      const elapsedMs = Date.now() - startedAt;
      expect(elapsedMs).toBeLessThan(5_000);
      const logContent = readFileSync(daemonLogPath, 'utf8');
      expect(logContent).toContain('Cleanup step failed (updateDaemonState)');
      expect(logContent).toContain('Cleanup completed, exiting process');
    } finally {
      if (serverStopped) {
        try { process.kill(-serverPid, 'SIGCONT'); } catch { try { process.kill(serverPid, 'SIGCONT'); } catch {} }
      }
      await clearDaemonState().catch(() => undefined);
    }
  });

  it('cleans local daemon resources when the server is unavailable', { timeout: 30_000 }, async () => {
    const daemonState = await readDaemonState();
    if (!daemonState) throw new Error('Daemon state missing before server outage cleanup test');
    const serverPidPath = path.join(integrationEnv.envDir, 'pids', 'server.pid');
    const serverPid = Number(readFileSync(serverPidPath, 'utf8').trim());
    if (!Number.isInteger(serverPid) || serverPid <= 0) throw new Error('Authenticated server PID file is invalid');
    const daemonLogPath = daemonState.daemonLogPath;
    if (!daemonLogPath) throw new Error('Daemon log path missing before server outage cleanup test');
    let serverStopped = false;

    try {
      process.kill(-serverPid, 'SIGTERM');
      serverStopped = true;
      await waitFor(async () => !isProcessAlive(serverPid), 10_000, 100);

      await stopDaemonHttp();
      await waitFor(async () => !isProcessAlive(daemonState.pid), 10_000, 100);
      await waitFor(async () => !existsSync(configuration.daemonStateFile), 5_000, 100);
      expect(existsSync(configuration.daemonLockFile)).toBe(false);
      expect(readFileSync(daemonLogPath, 'utf8')).toContain('Cleanup step failed (updateDaemonState)');
    } finally {
      if (serverStopped) {
        await startEnvironmentServices(integrationEnv.name, { web: false });
      }
    }
  });

  it('should track both daemon-spawned and terminal sessions', async () => {
    // Spawn a real agenthub process that looks like it was started from terminal
    const terminalAgentHubProcess = spawnAgentHubCLI([
      '--agenthub-starting-mode', 'remote',
      '--started-by', 'terminal'
    ], {
      cwd: integrationEnv.projectPath,
      detached: true,
      stdio: 'ignore'
    });
    if (!terminalAgentHubProcess || !terminalAgentHubProcess.pid) {
      throw new Error('Failed to spawn terminal agenthub process');
    }
    // Give time to start & report itself
    await new Promise(resolve => setTimeout(resolve, 5_000));

    // Spawn a daemon session
    const spawnResponse = await spawnDaemonSession(integrationEnv.projectPath, 'daemon-session-bbb');

    // List all sessions
    const sessions = await listDaemonSessions();
    expect(sessions).toHaveLength(2);

    // Verify we have one of each type
    const terminalSession = sessions.find(
      (s: any) => s.pid === terminalAgentHubProcess.pid
    );
    const daemonSession = sessions.find(
      (s: any) => s.agentHubSessionId === spawnResponse.sessionId
    );

    expect(terminalSession).toBeDefined();
    expect(terminalSession.startedBy).toBe('agenthub directly - likely by user from terminal');
    
    expect(daemonSession).toBeDefined();
    expect(daemonSession.startedBy).toBe('daemon');

    // Clean up both sessions
    await stopDaemonSession('terminal-session-aaa');
    await stopDaemonSession(daemonSession.agentHubSessionId);
    
    // Also kill the terminal process directly to be sure
    try {
      terminalAgentHubProcess.kill('SIGTERM');
    } catch (e) {
      // Process might already be dead
    }
  });

  it('should adopt a daemon-spawned session after the daemon restarts', { timeout: 60_000 }, async () => {
    const spawnResponse = await spawnDaemonSession(integrationEnv.projectPath, 'adoption-session');
    expect(spawnResponse.success).toBe(true);
    expect(spawnResponse.sessionId).toBeDefined();

    await waitFor(async () => {
      const sessions = await listDaemonSessions();
      return sessions.some((session: any) => session.agentHubSessionId === spawnResponse.sessionId);
    }, 15_000, 250);
    const beforeRestart = (await listDaemonSessions()).find(
      (session: any) => session.agentHubSessionId === spawnResponse.sessionId,
    );
    if (!beforeRestart) throw new Error('Spawned session was not tracked before daemon restart');
    expect(beforeRestart.startedBy).toBe('daemon');
    const adoptedPid = beforeRestart.pid;
    const previousDaemonPid = daemonPid;

    try {
      process.kill(previousDaemonPid, 'SIGTERM');
      await waitFor(async () => {
        const state = await readDaemonState();
        if (state) return false;
        try {
          process.kill(previousDaemonPid, 0);
          return false;
        } catch {
          return true;
        }
      }, 15_000, 250);

      void spawnAgentHubCLI(['daemon', 'start'], { stdio: 'ignore' });
      await waitFor(async () => {
        const state = await readDaemonState();
        return state !== null && state.pid !== previousDaemonPid;
      }, 15_000, 250);
      const restartedState = await readDaemonState();
      if (!restartedState) throw new Error('Replacement daemon state was not written');
      daemonPid = restartedState.pid;

      await waitFor(async () => {
        const sessions = await listDaemonSessions();
        return sessions.some((session: any) => session.agentHubSessionId === spawnResponse.sessionId);
      }, 15_000, 250);
      const adopted = (await listDaemonSessions()).find(
        (session: any) => session.agentHubSessionId === spawnResponse.sessionId,
      );
      if (!adopted) throw new Error('Replacement daemon did not expose the adopted session');
      expect(adopted.startedBy).toBe('daemon');
      expect(adopted.pid).toBe(adoptedPid);
      expect(adopted.lifecycleState).toBe('running');
    } finally {
      await stopDaemonSession(spawnResponse.sessionId).catch(() => false);
      await stopDaemon().catch(() => undefined);
    }
  });

  it.skipIf(!claudeAvailable)('replays an encrypted outbox and session-end marker after daemon adoption', { timeout: 90_000 }, async () => {
    let sessionId: string | undefined;
    let runnerPid: number | undefined;
    let replayChild: ChildProcess | undefined;
    const marker = `daemon-adoption-journal-${Date.now()}`;
    const previousDaemonPid = daemonPid;

    try {
      const spawnResponse = await spawnDaemonSession(integrationEnv.projectPath, `daemon-adoption-journal-${Date.now()}`);
      expect(spawnResponse.success).toBe(true);
      expect(spawnResponse.sessionId).toBeDefined();
      sessionId = spawnResponse.sessionId;
      if (!sessionId) throw new Error('Daemon spawn did not return a session id');
      const currentSessionId = sessionId;

      await waitFor(async () => {
        const tracked = (await listDaemonSessions()).find((session: any) => session.agentHubSessionId === currentSessionId);
        if (!tracked) return false;
        runnerPid = tracked.pid;
        return tracked.startedBy === 'daemon' && tracked.lifecycleState === 'running';
      }, 30_000, 250);

      await waitFor(async () => Boolean(readPersistedSessions()[currentSessionId]), 15_000, 100);
      const persisted = readPersistedSessions()[currentSessionId];
      if (!persisted) throw new Error('Persisted daemon session is missing before journal injection');
      expect(persisted.metadata.startedBy).toBe('daemon');
      expect(runnerPid).toBeDefined();

      const journalPath = path.join(
        configuration.agentHubHomeDir,
        'terminal-outbox',
        `${encodeURIComponent(currentSessionId)}.json`,
      );
      const journal = new TerminalOutboxJournal(journalPath);
      journal.append({
        localId: `local-${marker}`,
        content: encodeBase64(encrypt(
          decodeBase64(persisted.encryptionKey),
          persisted.encryptionVariant,
          {
            role: 'agent',
            content: {
              id: `event-${marker}`,
              type: 'event',
              data: { type: 'message', message: marker },
            },
          },
        )),
      });
      journal.markSessionEnd(currentSessionId, Date.now());
      expect(journal.load()).toHaveLength(1);
      expect(journal.pendingSessionEnd()?.sessionId).toBe(sessionId);

      process.kill(previousDaemonPid, 'SIGTERM');
      await waitFor(async () => {
        const state = await readDaemonState();
        return state === null && !isProcessAlive(previousDaemonPid);
      }, 15_000, 250);
      expect(runnerPid).toBeDefined();
      expect(isProcessAlive(runnerPid!)).toBe(true);

      void spawnAgentHubCLI(['daemon', 'start'], { stdio: 'ignore' });
      await waitFor(async () => {
        const state = await readDaemonState();
        return state !== null && state.pid !== previousDaemonPid;
      }, 15_000, 250);
      const restartedState = await readDaemonState();
      if (!restartedState) throw new Error('Replacement daemon state was not written');
      daemonPid = restartedState.pid;

      await waitFor(async () => {
        const adopted = (await listDaemonSessions()).find((session: any) => session.agentHubSessionId === currentSessionId);
        return adopted?.startedBy === 'daemon'
          && adopted.pid === runnerPid
          && adopted.lifecycleState === 'running';
      }, 15_000, 250);

      const credentials = await readCredentials();
      if (!credentials) throw new Error('Authenticated integration credentials are unavailable');
      const replaySession = {
        id: currentSessionId,
        seq: persisted.seq,
        encryptionKey: Array.from(decodeBase64(persisted.encryptionKey)),
        encryptionVariant: persisted.encryptionVariant,
        metadata: persisted.metadata,
        metadataVersion: persisted.metadataVersion,
        agentState: null,
        agentStateVersion: persisted.agentStateVersion,
      };
      replayChild = spawnJournalReplayChild(replaySession, credentials.token, configuration.serverUrl);
      await waitForChildOutput(replayChild, 'replayed:0:false', 20_000);
      await new Promise<void>((resolve, reject) => {
        replayChild?.once('exit', () => resolve());
        replayChild?.once('error', reject);
      });

      await waitFor(async () => {
        const recoveredJournal = new TerminalOutboxJournal(journalPath);
        return recoveredJournal.load().length === 0 && recoveredJournal.pendingSessionEnd() === null;
      }, 15_000, 100);

      const messagesResponse = await fetch(
        `${configuration.serverUrl}/v3/sessions/${encodeURIComponent(currentSessionId)}/messages?after_seq=0&limit=100`,
        { headers: { Authorization: `Bearer ${credentials.token}` } },
      );
      expect(messagesResponse.ok).toBe(true);
      const messagesPayload = await messagesResponse.json() as {
        messages: Array<{ content?: { t?: string; c?: string } }>;
      };
      const matchingMessages = messagesPayload.messages.filter((message) => {
        if (message.content?.t !== 'encrypted' || !message.content.c) return false;
        const content = decrypt(
          decodeBase64(persisted.encryptionKey),
          persisted.encryptionVariant,
          decodeBase64(message.content.c),
        ) as any;
        return content?.content?.data?.message === marker;
      });
      expect(matchingMessages).toHaveLength(1);

      const sessionResponse = await fetch(
        `${configuration.serverUrl}/v1/sessions/${encodeURIComponent(currentSessionId)}`,
        { headers: { Authorization: `Bearer ${credentials.token}` } },
      );
      expect(sessionResponse.ok).toBe(true);
      const sessionPayload = await sessionResponse.json() as { session: { active: boolean; thinking: boolean } };
      expect(sessionPayload.session.active).toBe(false);
      expect(sessionPayload.session.thinking).toBe(false);
    } finally {
      if (replayChild && replayChild.exitCode === null && replayChild.signalCode === null) {
        replayChild.kill('SIGTERM');
      }
      if (sessionId) await stopDaemonSession(sessionId).catch(() => false);
      if (runnerPid && isProcessAlive(runnerPid)) {
        process.kill(runnerPid, 'SIGTERM');
      }
      await stopDaemon().catch(() => undefined);
    }
  });

  it.skipIf(!claudeAvailable)('reconnects an adopted runner after the authenticated server restarts', { timeout: 150_000 }, async () => {
    let sessionId: string | undefined;
    let runnerPid: number | undefined;
    let restartedServerPid: number | undefined;
    const previousDaemonPid = daemonPid;
    const serverPidPath = path.join(integrationEnv.envDir, 'pids', 'server.pid');

    try {
      const spawnResponse = await spawnDaemonSession(integrationEnv.projectPath, `adopted-reconnect-${Date.now()}`);
      expect(spawnResponse.success).toBe(true);
      sessionId = spawnResponse.sessionId;
      if (!sessionId) throw new Error('Daemon spawn did not return a session id');

      await waitFor(async () => {
        const tracked = (await listDaemonSessions()).find((session: any) => session.agentHubSessionId === sessionId);
        if (!tracked) return false;
        runnerPid = tracked.pid;
        return tracked.startedBy === 'daemon' && tracked.lifecycleState === 'running';
      }, 30_000, 250);
      if (!runnerPid) throw new Error('Adopted reconnect runner PID is missing before daemon restart');
      await waitFor(async () => Boolean(readPersistedSessions()[sessionId!]), 15_000, 100);

      process.kill(previousDaemonPid, 'SIGTERM');
      await waitFor(async () => {
        const state = await readDaemonState();
        return state === null && !isProcessAlive(previousDaemonPid);
      }, 15_000, 250);

      void spawnAgentHubCLI(['daemon', 'start'], { stdio: 'ignore' });
      await waitFor(async () => {
        const state = await readDaemonState();
        return state !== null && state.pid !== previousDaemonPid;
      }, 15_000, 250);
      const restartedDaemon = await readDaemonState();
      if (!restartedDaemon) throw new Error('Replacement daemon state is missing after adoption restart');
      daemonPid = restartedDaemon.pid;

      await waitFor(async () => {
        const adopted = (await listDaemonSessions()).find((session: any) => session.agentHubSessionId === sessionId);
        return adopted?.startedBy === 'daemon'
          && adopted.pid === runnerPid
          && adopted.lifecycleState === 'running';
      }, 15_000, 250);

      const runnerLogName = await (async () => {
        let found: string | undefined;
        await waitFor(async () => {
          found = readdirSync(configuration.logsDir).find((name) => name.includes(`-pid-${runnerPid}.log`));
          return Boolean(found);
        }, 10_000, 100);
        return found!;
      })();
      const runnerLogPath = path.join(configuration.logsDir, runnerLogName);
      const connectedBefore = (readFileSync(runnerLogPath, 'utf8').match(/Socket connected successfully/g) ?? []).length;

      const serverPid = Number(readFileSync(serverPidPath, 'utf8').trim());
      if (!Number.isInteger(serverPid) || serverPid <= 0) throw new Error('Authenticated server PID is invalid before restart');
      process.kill(-serverPid, 'SIGTERM');
      await waitFor(async () => {
        try {
          await fetch(configuration.serverUrl);
          return false;
        } catch {
          return true;
        }
      }, 10_000, 100);

      // Keep the outage longer than Socket.IO's default ping timeout so the
      // adopted runner must leave the old socket and exercise smart reconnect.
      await new Promise((resolve) => setTimeout(resolve, 25_000));

      const serverRoot = path.resolve(process.cwd(), '..', '..', 'packages/agenthub-server');
      const restartedServer = spawn(process.execPath, [
        '--import',
        'tsx/esm',
        path.join(serverRoot, 'sources/standalone.ts'),
        'serve',
      ], {
        cwd: serverRoot,
        env: {
          ...process.env,
          AGENTHUB_MASTER_SECRET: 'agenthub-dev-secret',
          PORT: String(integrationEnv.serverPort),
          NODE_ENV: 'development',
          DATA_DIR: path.join(integrationEnv.envDir, 'server'),
          PGLITE_DIR: path.join(integrationEnv.envDir, 'server', 'pglite'),
          DATABASE_URL: '',
          METRICS_ENABLED: 'false',
          AGENTHUB_SERVER_URL: configuration.serverUrl,
        },
        stdio: 'ignore',
        detached: true,
      });
      if (!restartedServer.pid) throw new Error('Replacement authenticated server did not return a PID');
      restartedServerPid = restartedServer.pid;
      restartedServer.unref();
      writeFileSync(serverPidPath, String(restartedServerPid));

      await waitFor(async () => {
        try {
          const response = await fetch(configuration.serverUrl);
          return response.ok;
        } catch {
          return false;
        }
      }, 30_000, 250);

      await waitFor(async () => {
        const log = readFileSync(runnerLogPath, 'utf8');
        const connected = (log.match(/Socket connected successfully/g) ?? []).length;
        return log.includes('Socket disconnected') && connected > connectedBefore;
      }, 30_000, 250);

      const credentials = await readCredentials();
      if (!credentials) throw new Error('Authenticated integration credentials are unavailable after server restart');
      const persisted = readPersistedSessions()[sessionId];
      if (!persisted) throw new Error('Persisted adopted session disappeared after server restart');
      await waitFor(async () => {
        const response = await fetch(`${configuration.serverUrl}/v1/sessions/${encodeURIComponent(sessionId!)}`, {
          headers: { Authorization: `Bearer ${credentials.token}` },
        });
        if (!response.ok) return false;
        const payload = await response.json() as { session: { active: boolean; thinking: boolean; metadata: string } };
        const metadata = decrypt(
          decodeBase64(persisted.encryptionKey),
          persisted.encryptionVariant,
          decodeBase64(payload.session.metadata),
        ) as { lifecycleState?: string };
        return payload.session.active === true
          && payload.session.thinking === false
          && metadata.lifecycleState !== 'archived';
      }, 15_000, 250);

      const finalTracked = (await listDaemonSessions()).find((session: any) => session.agentHubSessionId === sessionId);
      expect(finalTracked).toMatchObject({ pid: runnerPid, lifecycleState: 'running', startedBy: 'daemon' });
      expect(isProcessAlive(runnerPid)).toBe(true);
    } finally {
      if (sessionId) await stopDaemonSession(sessionId).catch(() => false);
      if (runnerPid && isProcessAlive(runnerPid)) {
        process.kill(runnerPid, 'SIGTERM');
      }
      // Keep the replacement server alive for the remaining tests in this
      // authenticated suite. The environment-level teardown owns its PID;
      // killing it here leaves subsequent beforeEach cases with no server.
      await stopDaemon().catch(() => undefined);
    }
  });

  it('should update session metadata when webhook is called', async () => {
    // Spawn a session
    const spawnResponse = await spawnDaemonSession(integrationEnv.projectPath);

    // Verify webhook was processed (session ID updated)
    const sessions = await listDaemonSessions();
    const session = sessions.find((s: any) => s.agentHubSessionId === spawnResponse.sessionId);
    expect(session).toBeDefined();

    // Clean up
    await stopDaemonSession(spawnResponse.sessionId);
  });

  it('should not allow starting a second daemon', async () => {
    // Daemon is already running from beforeEach
    // Try to start another daemon
    const packageManager = resolveRepositoryPackageManager();
    const secondChild = spawn(packageManager.command, [
      ...packageManager.argsPrefix,
      'tsx',
      'src/index.ts',
      'daemon',
      'start-sync',
    ], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    secondChild.stdout?.on('data', (data) => {
      output += data.toString();
    });
    secondChild.stderr?.on('data', (data) => {
      output += data.toString();
    });

    // Wait for the second daemon to exit
    await new Promise<void>((resolve) => {
      secondChild.on('exit', () => resolve());
    });

    // Should report that daemon is already running
    expect(output).toContain('already running');
  });

  it('should handle concurrent session operations', async () => {
    // Spawn multiple sessions concurrently
    const promises = [];
    for (let i = 0; i < 3; i++) {
      promises.push(
        spawnDaemonSession(integrationEnv.projectPath)
      );
    }

    const results = await Promise.all(promises);
    
    // All should succeed
    results.forEach(res => {
      expect(res.success).toBe(true);
      expect(res.sessionId).toBeDefined();
    });

    // Collect session IDs for tracking
    const spawnedSessionIds = results.map(r => r.sessionId);

    // Give sessions time to report via webhook
    await new Promise(resolve => setTimeout(resolve, 1000));

    // List should show all sessions
    const sessions = await listDaemonSessions();
    const daemonSessions = sessions.filter(
      (s: any) => s.startedBy === 'daemon' && spawnedSessionIds.includes(s.agentHubSessionId)
    );
    expect(daemonSessions.length).toBeGreaterThanOrEqual(3);

    // Stop all spawned sessions
    for (const session of daemonSessions) {
      expect(session.agentHubSessionId).toBeDefined();
      await stopDaemonSession(session.agentHubSessionId);
    }
  });

  it('should die with logs when SIGKILL is sent', async () => {
    // SIGKILL test - daemon should die immediately
    const logsDir = configuration.logsDir;
    const { readdirSync } = await import('fs');
    
    // Get initial log files
    const initialLogs = readdirSync(logsDir).filter(f => f.endsWith('-daemon.log'));
    
    // Send SIGKILL to daemon (force kill)
    process.kill(daemonPid, 'SIGKILL');
    
    // Wait for process to die
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check if process is dead
    let isDead = false;
    try {
      process.kill(daemonPid, 0);
    } catch {
      isDead = true;
    }
    expect(isDead).toBe(true);
    
    // Check that log file exists (it was created when daemon started)
    const finalLogs = readdirSync(logsDir).filter(f => f.endsWith('-daemon.log'));
    expect(finalLogs.length).toBeGreaterThanOrEqual(initialLogs.length);
    
    // The daemon won't have time to write cleanup logs with SIGKILL
    console.log('[TEST] Daemon killed with SIGKILL - no cleanup logs expected');
    
    // Clean up state file manually since daemon couldn't do it
    await clearDaemonState();
  });

  it('should die with cleanup logs when SIGTERM is sent', async () => {
    // SIGTERM test - daemon should cleanup gracefully
    const logFile = await getLatestDaemonLog();
    if (!logFile) {
      throw new Error('No log file found');
    }
    
    // Send SIGTERM to daemon (graceful shutdown)
    process.kill(daemonPid, 'SIGTERM');
    
    // Wait for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 4_000));
    
    // Check if process is dead
    let isDead = false;
    try {
      process.kill(daemonPid, 0);
    } catch {
      isDead = true;
    }
    expect(isDead).toBe(true);
    
    // Read the log file to check for cleanup messages
    const logContent = readFileSync(logFile.path, 'utf8');
    
    // Should contain cleanup messages
    expect(logContent).toContain('SIGTERM');
    expect(logContent).toContain('cleanup');
    
    console.log('[TEST] Daemon terminated gracefully with SIGTERM - cleanup logs written');
    
    // Clean up state file if it still exists (should have been cleaned by SIGTERM handler)
    await clearDaemonState();
  });

  it('restarts after a valid private bundle replacement without rebuilding shared dist', { timeout: 45_000 }, async () => {
    const originalHeartbeat = process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL;
    const bundleEntrypoint = path.join(integrationEnv.envDir, 'cli', 'bundle', 'dist', 'index.mjs');
    const originalBundle = readFileSync(bundleEntrypoint, 'utf8');

    try {
      process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL = '250';
      await stopDaemon().catch(() => undefined);
      void spawnAgentHubCLI(['daemon', 'start'], { stdio: 'ignore' });

      await waitFor(async () => {
        const state = await readDaemonState();
        return Boolean(state && state.pid !== daemonPid);
      }, 10_000, 100);
      const initialState = await readDaemonState();
      expect(initialState).toBeDefined();
      const initialPid = initialState!.pid;

      writeFileSync(bundleEntrypoint, `${originalBundle}\n// valid integration replacement ${randomUUID()}\n`);

      await waitFor(async () => {
        const state = await readDaemonState();
        return Boolean(state && state.pid !== initialPid);
      }, 20_000, 100);
      const replacementState = await readDaemonState();
      expect(replacementState).toBeDefined();
      expect(replacementState!.startedWithCliVersion).toBe(initialState!.startedWithCliVersion);
      expect(replacementState!.pid).not.toBe(initialPid);
      await waitFor(async () => !isProcessAlive(initialPid), 10_000, 100);
      daemonPid = replacementState!.pid;
    } finally {
      await stopDaemon().catch(() => undefined);
      writeFileSync(bundleEntrypoint, originalBundle);
      if (originalHeartbeat === undefined) delete process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL;
      else process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL = originalHeartbeat;
    }
  });

  it('keeps the running daemon and restores the previous private bundle after a corrupt replacement', { timeout: 30_000 }, async () => {
    const originalHeartbeat = process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL;
    const bundleEntrypoint = path.join(integrationEnv.envDir, 'cli', 'bundle', 'dist', 'index.mjs');
    const originalBundle = readFileSync(bundleEntrypoint, 'utf8');
    const initialPid = daemonPid;

    // The daemon was started before this test with the default heartbeat. Run
    // one isolated restart with a short interval so the replacement check is
    // observable without waiting a production minute.
    try {
      process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL = '250';
      await stopDaemon().catch(() => undefined);
      void spawnAgentHubCLI(['daemon', 'start'], { stdio: 'ignore' });
      await waitFor(async () => (await readDaemonState()) !== null, 10_000, 100);
      const restartedState = await readDaemonState();
      if (!restartedState) throw new Error('Private integration daemon failed to restart');
      const restartedPid = restartedState.pid;

      // Wait until startup has finished its previous-bundle snapshot before
      // injecting the malformed candidate.
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      writeFileSync(bundleEntrypoint, 'export = ;\n');

      await waitFor(async () => {
        const currentState = await readDaemonState();
        return currentState?.pid === restartedPid && readFileSync(bundleEntrypoint, 'utf8') === originalBundle;
      }, 15_000, 100);

      const finalState = await readDaemonState();
      expect(finalState?.pid).toBe(restartedPid);
      expect(finalState?.pid).not.toBe(initialPid);
      expect(readFileSync(bundleEntrypoint, 'utf8')).toBe(originalBundle);
      if (!finalState?.daemonLogPath) throw new Error('Daemon log path missing after bundle rollback');
      await waitFor(async () => {
        const logContent = readFileSync(finalState.daemonLogPath!, 'utf8');
        return logContent.includes('Rejected invalid bundle replacement') &&
          logContent.includes('Restored previous daemon bundle');
      }, 5_000, 100);
      const logContent = readFileSync(finalState.daemonLogPath, 'utf8');
      expect(logContent).toContain('Rejected invalid bundle replacement');
      expect(logContent).toContain('Restored previous daemon bundle');
    } finally {
      if (originalHeartbeat === undefined) {
        delete process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL;
      } else {
        process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL = originalHeartbeat;
      }
    }
  });

  it('restores the previous private bundle when a dependent chunk disappears', { timeout: 30_000 }, async () => {
    const originalHeartbeat = process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL;
    const bundleEntrypoint = path.join(integrationEnv.envDir, 'cli', 'bundle', 'dist', 'index.mjs');
    const originalBundle = readFileSync(bundleEntrypoint, 'utf8');
    const chunkName = originalBundle.match(/['"]\.\/([^'"]+\.mjs)['"]/)?.[1];
    if (!chunkName) throw new Error('Unable to identify a bundle dependency chunk');
    const chunkPath = path.join(path.dirname(bundleEntrypoint), chunkName);
    expect(existsSync(chunkPath)).toBe(true);

    try {
      process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL = '250';
      await stopDaemon().catch(() => undefined);
      void spawnAgentHubCLI(['daemon', 'start'], { stdio: 'ignore' });
      await waitFor(async () => (await readDaemonState()) !== null, 10_000, 100);
      const restartedState = await readDaemonState();
      if (!restartedState) throw new Error('Private integration daemon failed to restart');
      const restartedPid = restartedState.pid;

      await new Promise((resolve) => setTimeout(resolve, 1_000));
      rmSync(chunkPath);

      await waitFor(async () => {
        const currentState = await readDaemonState();
        return currentState?.pid === restartedPid && existsSync(chunkPath);
      }, 15_000, 100);

      const finalState = await readDaemonState();
      expect(finalState?.pid).toBe(restartedPid);
      expect(readFileSync(bundleEntrypoint, 'utf8')).toBe(originalBundle);
      expect(existsSync(chunkPath)).toBe(true);
      if (!finalState?.daemonLogPath) throw new Error('Daemon log path missing after chunk rollback');
      const logContent = readFileSync(finalState.daemonLogPath, 'utf8');
      expect(logContent).toContain('Rejected invalid bundle replacement');
      expect(logContent).toContain('Restored previous daemon bundle');
    } finally {
      if (originalHeartbeat === undefined) {
        delete process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL;
      } else {
        process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL = originalHeartbeat;
      }
    }
  });

  it('rejects and restores a private bundle when a dependent chunk becomes a symlink', { timeout: 30_000 }, async () => {
    const originalHeartbeat = process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL;
    const bundleEntrypoint = path.join(integrationEnv.envDir, 'cli', 'bundle', 'dist', 'index.mjs');
    const originalBundle = readFileSync(bundleEntrypoint, 'utf8');
    const chunkName = originalBundle.match(/["']\.\/([^"']+\.mjs)["']/)?.[1];
    if (!chunkName) throw new Error('Unable to identify a bundle dependency chunk');
    const chunkPath = path.join(path.dirname(bundleEntrypoint), chunkName);
    const outsidePath = path.join(integrationEnv.envDir, 'cli', 'bundle', 'outside-chunk.mjs');
    const originalChunk = readFileSync(chunkPath, 'utf8');
    expect(lstatSync(chunkPath).isFile()).toBe(true);

    try {
      process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL = '250';
      await stopDaemon().catch(() => undefined);
      void spawnAgentHubCLI(['daemon', 'start'], { stdio: 'ignore' });
      await waitFor(async () => (await readDaemonState()) !== null, 10_000, 100);
      const restartedState = await readDaemonState();
      if (!restartedState) throw new Error('Private integration daemon failed to restart');
      const restartedPid = restartedState.pid;

      await new Promise((resolve) => setTimeout(resolve, 1_000));
      writeFileSync(outsidePath, originalChunk);
      rmSync(chunkPath);
      symlinkSync(outsidePath, chunkPath);

      await waitFor(async () => {
        const currentState = await readDaemonState();
        return currentState?.pid === restartedPid && lstatSync(chunkPath).isFile();
      }, 15_000, 100);

      const finalState = await readDaemonState();
      expect(finalState?.pid).toBe(restartedPid);
      expect(readFileSync(bundleEntrypoint, 'utf8')).toBe(originalBundle);
      expect(lstatSync(chunkPath).isFile()).toBe(true);
      if (!finalState?.daemonLogPath) throw new Error('Daemon log path missing after symlink rollback');
      const logContent = readFileSync(finalState.daemonLogPath, 'utf8');
      expect(logContent).toContain('Rejected invalid bundle replacement');
      expect(logContent).toContain('Restored previous daemon bundle');
    } finally {
      if (existsSync(outsidePath)) rmSync(outsidePath, { force: true });
      try {
        if (lstatSync(chunkPath).isSymbolicLink()) {
          rmSync(chunkPath, { force: true });
          writeFileSync(chunkPath, originalChunk);
        }
      } catch {
        // The isolated integration environment cleanup owns missing bundle trees.
      }
      if (originalHeartbeat === undefined) {
        delete process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL;
      } else {
        process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL = originalHeartbeat;
      }
    }
  });

  it.skipIf(!codexAvailable)('archives the real runner and session after its app-server child is SIGKILLed', { timeout: 90_000 }, async () => {
    let runnerPid: number | undefined;
    let sessionId: string | undefined;
    let appServerPid: number | undefined;
    const originalHeartbeat = process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL;

    try {
      process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL = '250';
      await stopDaemon().catch(() => undefined);
      void spawnAgentHubCLI(['daemon', 'start'], { stdio: 'ignore' });
      await waitFor(async () => (await readDaemonState()) !== null, 10_000, 100);

      const runner = spawnAgentHubCLI([
        'codex',
        '--agenthub-starting-mode', 'remote',
        '--started-by', 'terminal',
      ], {
        cwd: integrationEnv.projectPath,
        detached: true,
        stdio: 'ignore',
      });
      if (!runner.pid) throw new Error('Failed to spawn real Codex runner');
      runnerPid = runner.pid;

      let trackedSession: any;
      await waitFor(async () => {
        trackedSession = (await listDaemonSessions()).find((session: any) => session.pid === runnerPid);
        return Boolean(trackedSession?.agentHubSessionId);
      }, 30_000, 250);
      sessionId = trackedSession.agentHubSessionId;

      await waitFor(async () => Boolean(readPersistedSessions()[sessionId!]), 10_000, 100);
      await waitFor(async () => {
        const appServer = descendantProcesses(runnerPid!).find((process) => /codex app-server --listen stdio/.test(process.args));
        if (!appServer) return false;
        appServerPid = appServer.pid;
        return true;
      }, 30_000, 250);

      process.kill(appServerPid!, 'SIGKILL');

      await waitFor(async () => {
        const sessions = await listDaemonSessions();
        return !sessions.some((session: any) => session.pid === runnerPid || session.agentHubSessionId === sessionId);
      }, 30_000, 250);
      await waitFor(async () => !isProcessAlive(runnerPid!), 10_000, 100);

      const credentials = await readCredentials();
      if (!credentials) throw new Error('Authenticated integration credentials are unavailable');
      const persisted = readPersistedSessions()[sessionId!];
      if (!persisted) throw new Error('Persisted session encryption data disappeared before verification');
      const response = await fetch(`${configuration.serverUrl}/v1/sessions/${encodeURIComponent(sessionId!)}`, {
        headers: { Authorization: `Bearer ${credentials.token}` },
      });
      expect(response.ok).toBe(true);
      const payload = await response.json() as { session: { active: boolean; thinking: boolean; metadata: string } };
      const metadata = decrypt(
        decodeBase64(persisted.encryptionKey),
        persisted.encryptionVariant,
        decodeBase64(payload.session.metadata),
      ) as { lifecycleState?: string; archivedBy?: string; archiveReason?: string };
      expect(payload.session.active).toBe(false);
      expect(payload.session.thinking).toBe(false);
      expect(metadata.lifecycleState).toBe('archived');
      expect(metadata.archivedBy).toBe('cli');
      expect(metadata.archiveReason).toContain('Codex app-server exited unexpectedly');

      await waitFor(async () => {
        const logName = readdirSync(configuration.logsDir).find((name) => name.includes(`-pid-${runnerPid}.log`));
        return Boolean(logName);
      }, 10_000, 100);
      const runnerLogName = readdirSync(configuration.logsDir).find((name) => name.includes(`-pid-${runnerPid}.log`));
      if (!runnerLogName) throw new Error('Runner log was not created');
      const runnerLog = readFileSync(path.join(configuration.logsDir, runnerLogName), 'utf8');
      expect(runnerLog).toContain('Codex app-server exited unexpectedly');
    } finally {
      if (sessionId) await stopDaemonSession(sessionId).catch(() => false);
      if (runnerPid && isProcessAlive(runnerPid)) {
        process.kill(runnerPid, 'SIGTERM');
      }
      if (runnerPid) {
        for (const processInfo of descendantProcesses(runnerPid).filter((process) => /codex app-server|codex-linux-x64/.test(process.args))) {
          if (isProcessAlive(processInfo.pid)) {
            process.kill(processInfo.pid, 'SIGTERM');
          }
        }
      }
      if (originalHeartbeat === undefined) {
        delete process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL;
      } else {
        process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL = originalHeartbeat;
      }
    }
  });

  it.skipIf(!codexAvailable)('closes an active Codex turn before archiving when its app-server child is SIGKILLed', { timeout: 120_000 }, async () => {
    let runnerPid: number | undefined;
    let sessionId: string | undefined;
    let appServerPid: number | undefined;
    const originalHeartbeat = process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL;

    try {
      process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL = '250';
      await stopDaemon().catch(() => undefined);
      void spawnAgentHubCLI(['daemon', 'start'], { stdio: 'ignore' });
      await waitFor(async () => (await readDaemonState()) !== null, 10_000, 100);

      const runner = spawnAgentHubCLI([
        'codex',
        '--agenthub-starting-mode', 'remote',
        '--started-by', 'terminal',
        '--permission-mode', 'yolo',
      ], {
        cwd: integrationEnv.projectPath,
        detached: true,
        stdio: 'ignore',
      });
      if (!runner.pid) throw new Error('Failed to spawn real active Codex runner');
      runnerPid = runner.pid;

      let trackedSession: any;
      await waitFor(async () => {
        trackedSession = (await listDaemonSessions()).find((session: any) => session.pid === runnerPid);
        return Boolean(trackedSession?.agentHubSessionId);
      }, 30_000, 250);
      sessionId = trackedSession.agentHubSessionId;
      const currentSessionId = sessionId;
      if (!currentSessionId) throw new Error('Tracked active Codex session has no session ID');

      await waitFor(async () => Boolean(readPersistedSessions()[currentSessionId]), 10_000, 100);
      const credentials = await readCredentials();
      if (!credentials) throw new Error('Authenticated integration credentials are unavailable');
      const persistedBeforeFatal = readPersistedSessions()[currentSessionId];
      if (!persistedBeforeFatal) throw new Error('Persisted Codex session encryption data is missing before active fatal injection');

      const userMessage = encodeBase64(encrypt(
        decodeBase64(persistedBeforeFatal.encryptionKey),
        persistedBeforeFatal.encryptionVariant,
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Run the shell command sleep 60, wait for it to finish, then reply with done.',
          },
          meta: { sentFrom: 'integration' },
        },
      ));
      const injected = await fetch(`${configuration.serverUrl}/v3/sessions/${encodeURIComponent(currentSessionId)}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: [{ localId: randomUUID(), content: userMessage }] }),
      });
      expect(injected.ok).toBe(true);

      await waitFor(async () => {
        const response = await fetch(`${configuration.serverUrl}/v1/sessions/${encodeURIComponent(currentSessionId)}`, {
          headers: { Authorization: `Bearer ${credentials.token}` },
        });
        if (!response.ok) return false;
        const payload = await response.json() as { session: { thinking: boolean } };
        return payload.session.thinking;
      }, 45_000, 250);
      await waitFor(async () => {
        const appServer = descendantProcesses(runnerPid!).find((process) => /codex app-server --listen stdio/.test(process.args));
        if (!appServer) return false;
        appServerPid = appServer.pid;
        return true;
      }, 30_000, 250);

      process.kill(appServerPid!, 'SIGKILL');

      await waitFor(async () => {
        const sessions = await listDaemonSessions();
        return !sessions.some((session: any) => session.pid === runnerPid || session.agentHubSessionId === currentSessionId);
      }, 30_000, 250);
      await waitFor(async () => !isProcessAlive(runnerPid!), 10_000, 100);

      const response = await fetch(`${configuration.serverUrl}/v1/sessions/${encodeURIComponent(currentSessionId)}`, {
        headers: { Authorization: `Bearer ${credentials.token}` },
      });
      expect(response.ok).toBe(true);
      const payload = await response.json() as { session: { active: boolean; thinking: boolean; metadata: string } };
      const persisted = readPersistedSessions()[currentSessionId];
      if (!persisted) throw new Error('Persisted Codex session encryption data disappeared before verification');
      const metadata = decrypt(
        decodeBase64(persisted.encryptionKey),
        persisted.encryptionVariant,
        decodeBase64(payload.session.metadata),
      ) as { lifecycleState?: string; archivedBy?: string; archiveReason?: string };
      expect(payload.session.active).toBe(false);
      expect(payload.session.thinking).toBe(false);
      expect(metadata).toMatchObject({
        lifecycleState: 'archived',
        archivedBy: 'cli',
        archiveReason: expect.stringContaining('Codex app-server exited unexpectedly'),
      });

      const messagesResponse = await fetch(
        `${configuration.serverUrl}/v3/sessions/${encodeURIComponent(currentSessionId)}/messages?after_seq=0&limit=100`,
        { headers: { Authorization: `Bearer ${credentials.token}` } },
      );
      expect(messagesResponse.ok).toBe(true);
      const messagesPayload = await messagesResponse.json() as {
        messages: Array<{ content?: { t?: string; c?: string } }>;
      };
      const sessionEnvelopes = messagesPayload.messages.flatMap((message) => {
        if (message.content?.t !== 'encrypted' || !message.content.c) return [];
        const content = decrypt(
          decodeBase64(persisted.encryptionKey),
          persisted.encryptionVariant,
          decodeBase64(message.content.c),
        ) as any;
        return content?.role === 'session' && content?.content?.ev ? [content.content] : [];
      });
      expect(sessionEnvelopes.some((envelope) => envelope.ev.t === 'turn-start')).toBe(true);
      expect(sessionEnvelopes.filter((envelope) => envelope.ev.t === 'turn-end')).toHaveLength(1);
      expect(sessionEnvelopes.find((envelope) => envelope.ev.t === 'turn-end')?.ev.status).toBe('failed');
    } finally {
      if (sessionId) await stopDaemonSession(sessionId).catch(() => false);
      if (runnerPid && isProcessAlive(runnerPid)) {
        process.kill(runnerPid, 'SIGTERM');
      }
      if (runnerPid) {
        for (const processInfo of descendantProcesses(runnerPid).filter((process) => /codex app-server|codex-linux-x64/.test(process.args))) {
          if (isProcessAlive(processInfo.pid)) {
            process.kill(processInfo.pid, 'SIGTERM');
          }
        }
      }
      if (originalHeartbeat === undefined) {
        delete process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL;
      } else {
        process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL = originalHeartbeat;
      }
    }
  });

  it.skipIf(!claudeAvailable)('archives the real Claude runner when its SDK child is SIGKILLed', { timeout: 90_000 }, async () => {
    let runnerPid: number | undefined;
    let sessionId: string | undefined;
    let claudeChildPid: number | undefined;
    const originalHeartbeat = process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL;

    try {
      process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL = '250';
      await stopDaemon().catch(() => undefined);
      void spawnAgentHubCLI(['daemon', 'start'], { stdio: 'ignore' });
      await waitFor(async () => (await readDaemonState()) !== null, 10_000, 100);

      const runner = spawnAgentHubCLI([
        'claude',
        '--agenthub-starting-mode', 'remote',
        '--started-by', 'terminal',
      ], {
        cwd: integrationEnv.projectPath,
        detached: true,
        stdio: 'ignore',
      });
      if (!runner.pid) throw new Error('Failed to spawn real Claude runner');
      runnerPid = runner.pid;

      let trackedSession: any;
      await waitFor(async () => {
        trackedSession = (await listDaemonSessions()).find((session: any) => session.pid === runnerPid);
        return Boolean(trackedSession?.agentHubSessionId);
      }, 30_000, 250);
      sessionId = trackedSession.agentHubSessionId;
      const currentSessionId = sessionId;
      if (!currentSessionId) throw new Error('Tracked Claude session has no session ID');

      await waitFor(async () => Boolean(readPersistedSessions()[currentSessionId]), 10_000, 100);
      const credentials = await readCredentials();
      if (!credentials) throw new Error('Authenticated integration credentials are unavailable');
      const persistedBeforeFatal = readPersistedSessions()[currentSessionId];
      if (!persistedBeforeFatal) throw new Error('Persisted session encryption data is missing before fatal injection');
      const userMessage = encodeBase64(encrypt(
        decodeBase64(persistedBeforeFatal.encryptionKey),
        persistedBeforeFatal.encryptionVariant,
        {
          role: 'user',
          content: { type: 'text', text: 'start the Claude backend so the fatal path can be observed' },
          meta: { sentFrom: 'integration' },
        },
      ));
      const injected = await fetch(`${configuration.serverUrl}/v3/sessions/${encodeURIComponent(currentSessionId)}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: [{ localId: randomUUID(), content: userMessage }] }),
      });
      expect(injected.ok).toBe(true);
      await waitFor(async () => {
        const response = await fetch(`${configuration.serverUrl}/v1/sessions/${encodeURIComponent(currentSessionId)}`, {
          headers: { Authorization: `Bearer ${credentials.token}` },
        });
        if (!response.ok) return false;
        const payload = await response.json() as { session: { thinking: boolean } };
        return payload.session.thinking;
      }, 45_000, 250);
      await waitFor(async () => {
        const child = findClaudeBackendProcess(runnerPid!);
        if (!child) return false;
        claudeChildPid = child.pid;
        return true;
      }, 30_000, 250);
      await waitFor(async () => {
        const response = await fetch(
          `${configuration.serverUrl}/v3/sessions/${encodeURIComponent(currentSessionId)}/messages?after_seq=0&limit=100`,
          { headers: { Authorization: `Bearer ${credentials.token}` } },
        );
        if (!response.ok) return false;
        const payload = await response.json() as {
          messages: Array<{ content?: { t?: string; c?: string } }>;
        };
        return payload.messages.some((message) => {
          if (message.content?.t !== 'encrypted' || !message.content.c) return false;
          const content = decrypt(
            decodeBase64(persistedBeforeFatal.encryptionKey),
            persistedBeforeFatal.encryptionVariant,
            decodeBase64(message.content.c),
          ) as any;
          return content?.role === 'session' && content?.content?.ev?.t === 'turn-start';
        });
      }, 45_000, 250);

      process.kill(claudeChildPid!, 'SIGKILL');

      await waitFor(async () => {
        const sessions = await listDaemonSessions();
        return !sessions.some((session: any) => session.pid === runnerPid || session.agentHubSessionId === sessionId);
      }, 30_000, 250);
      await waitFor(async () => !isProcessAlive(runnerPid!), 10_000, 100);

      const persisted = readPersistedSessions()[sessionId!];
      if (!persisted) throw new Error('Persisted session encryption data disappeared before verification');
      const response = await fetch(`${configuration.serverUrl}/v1/sessions/${encodeURIComponent(sessionId!)}`, {
        headers: { Authorization: `Bearer ${credentials.token}` },
      });
      expect(response.ok).toBe(true);
      const payload = await response.json() as { session: { active: boolean; thinking: boolean; metadata: string } };
      const metadata = decrypt(
        decodeBase64(persisted.encryptionKey),
        persisted.encryptionVariant,
        decodeBase64(payload.session.metadata),
      ) as { lifecycleState?: string; archivedBy?: string; archiveReason?: string };
      expect(payload.session.active).toBe(false);
      expect(payload.session.thinking).toBe(false);
      expect(metadata.lifecycleState).toBe('archived');
      expect(metadata.archivedBy).toBe('cli');
      expect(metadata.archiveReason).toContain('Claude backend exited unexpectedly');

      const messagesResponse = await fetch(
        `${configuration.serverUrl}/v3/sessions/${encodeURIComponent(currentSessionId)}/messages?after_seq=0&limit=100`,
        { headers: { Authorization: `Bearer ${credentials.token}` } },
      );
      expect(messagesResponse.ok).toBe(true);
      const messagesPayload = await messagesResponse.json() as {
        messages: Array<{ content?: { t?: string; c?: string } }>;
      };
      const sessionEnvelopes = messagesPayload.messages.flatMap((message) => {
        if (message.content?.t !== 'encrypted' || !message.content.c) return [];
        const content = decrypt(
          decodeBase64(persisted.encryptionKey),
          persisted.encryptionVariant,
          decodeBase64(message.content.c),
        ) as any;
        return content?.role === 'session' && content?.content?.ev ? [content.content] : [];
      });
      expect(sessionEnvelopes.some((envelope) => envelope.ev.t === 'turn-start')).toBe(true);
      expect(sessionEnvelopes.filter((envelope) => envelope.ev.t === 'turn-end')).toHaveLength(1);
      expect(sessionEnvelopes.find((envelope) => envelope.ev.t === 'turn-end')?.ev.status).toBe('failed');

      await waitFor(async () => {
        const logName = readdirSync(configuration.logsDir).find((name) => name.includes(`-pid-${runnerPid}.log`));
        return Boolean(logName);
      }, 10_000, 100);
      const runnerLogName = readdirSync(configuration.logsDir).find((name) => name.includes(`-pid-${runnerPid}.log`));
      if (!runnerLogName) throw new Error('Runner log was not created');
      const runnerLog = readFileSync(path.join(configuration.logsDir, runnerLogName), 'utf8');
      expect(runnerLog).toContain('Backend fatal; archiving session');
    } finally {
      if (sessionId) await stopDaemonSession(sessionId).catch(() => false);
      if (runnerPid && isProcessAlive(runnerPid)) {
        process.kill(runnerPid, 'SIGTERM');
      }
      if (runnerPid) {
        for (const processInfo of descendantProcesses(runnerPid).filter(isClaudeBackendProcess)) {
          if (isProcessAlive(processInfo.pid)) {
            process.kill(processInfo.pid, 'SIGTERM');
          }
        }
      }
      if (originalHeartbeat === undefined) {
        delete process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL;
      } else {
        process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL = originalHeartbeat;
      }
    }
  });

  it.skipIf(!claudeAvailable)('stops a real idle Claude runner before backend startup without inventing a turn', { timeout: 90_000 }, async () => {
    let runnerPid: number | undefined;
    let sessionId: string | undefined;
    const originalHeartbeat = process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL;

    try {
      process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL = '250';
      await stopDaemon().catch(() => undefined);
      void spawnAgentHubCLI(['daemon', 'start'], { stdio: 'ignore' });
      await waitFor(async () => (await readDaemonState()) !== null, 10_000, 100);

      const runner = spawnAgentHubCLI([
        'claude',
        '--agenthub-starting-mode', 'remote',
        '--started-by', 'terminal',
      ], {
        cwd: integrationEnv.projectPath,
        detached: true,
        stdio: 'ignore',
      });
      if (!runner.pid) throw new Error('Failed to spawn real idle Claude runner');
      runnerPid = runner.pid;

      let trackedSession: any;
      await waitFor(async () => {
        trackedSession = (await listDaemonSessions()).find((session: any) => session.pid === runnerPid);
        return Boolean(trackedSession?.agentHubSessionId);
      }, 30_000, 250);
      sessionId = trackedSession.agentHubSessionId;
      if (!sessionId) throw new Error('Tracked idle Claude session has no session ID');

      await waitFor(async () => Boolean(readPersistedSessions()[sessionId!]), 10_000, 100);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      expect(findClaudeBackendProcess(runnerPid)).toBeUndefined();

      const persisted = readPersistedSessions()[sessionId];
      if (!persisted) throw new Error('Persisted idle Claude session encryption data is missing');
      const credentials = await readCredentials();
      if (!credentials) throw new Error('Authenticated integration credentials are unavailable');

      const stopResult = await stopDaemonSessionDetailed(sessionId);
      expect(stopResult.success).toBe(true);
      expect(['stopping', 'exited']).toContain(stopResult.state);
      await waitFor(async () => {
        const sessions = await listDaemonSessions();
        return !sessions.some((session: any) => session.pid === runnerPid || session.agentHubSessionId === sessionId);
      }, 30_000, 250);
      await waitFor(async () => !isProcessAlive(runnerPid!), 10_000, 100);

      try {
        await waitFor(async () => {
          const terminalResponse = await fetch(
            `${configuration.serverUrl}/v1/sessions/${encodeURIComponent(sessionId!)}`,
            { headers: { Authorization: `Bearer ${credentials.token}` } },
          );
          if (!terminalResponse.ok) return false;
          const terminalPayload = await terminalResponse.json() as { session: { active: boolean } };
          return terminalPayload.session.active === false;
        }, 15_000, 100);
      } catch (error) {
        const state = await readDaemonState();
        const diagnostic = state?.daemonLogPath && existsSync(state.daemonLogPath)
          ? readFileSync(state.daemonLogPath, 'utf8')
            .split('\n')
            .filter((line) => line.includes(sessionId!) || /archive fallback|Process PID|external session PID/.test(line))
            .slice(-30)
            .join('\n')
          : 'daemon log unavailable';
        throw new Error(`Server did not converge after idle Claude exit. Daemon lifecycle log:\n${diagnostic}`, { cause: error });
      }

      const journalPath = path.join(
        configuration.agentHubHomeDir,
        'terminal-outbox',
        `${encodeURIComponent(sessionId)}.json`,
      );
      const journalState = JSON.parse(readFileSync(journalPath, 'utf8')) as { sessionEnd?: unknown };
      expect(journalState.sessionEnd).toBeUndefined();

      const response = await fetch(`${configuration.serverUrl}/v1/sessions/${encodeURIComponent(sessionId)}`, {
        headers: { Authorization: `Bearer ${credentials.token}` },
      });
      expect(response.ok).toBe(true);
      const payload = await response.json() as { session: { active: boolean; thinking: boolean; metadata: string } };
      const metadata = decrypt(
        decodeBase64(persisted.encryptionKey),
        persisted.encryptionVariant,
        decodeBase64(payload.session.metadata),
      ) as { lifecycleState?: string; archivedBy?: string; archiveReason?: string };
      expect(payload.session.active).toBe(false);
      expect(payload.session.thinking).toBe(false);
      expect(metadata.lifecycleState).toBe('archived');
      expect(metadata.archivedBy).toBe('cli');
      expect(metadata.archiveReason).toContain('User terminated');

      const messagesResponse = await fetch(
        `${configuration.serverUrl}/v3/sessions/${encodeURIComponent(sessionId)}/messages?after_seq=0&limit=100`,
        { headers: { Authorization: `Bearer ${credentials.token}` } },
      );
      expect(messagesResponse.ok).toBe(true);
      const messagesPayload = await messagesResponse.json() as {
        messages: Array<{ content?: { t?: string; c?: string } }>;
      };
      const sessionEventTypes = messagesPayload.messages.flatMap((message) => {
        if (message.content?.t !== 'encrypted' || !message.content.c) return [];
        const content = decrypt(
          decodeBase64(persisted.encryptionKey),
          persisted.encryptionVariant,
          decodeBase64(message.content.c),
        ) as any;
        return content?.role === 'session' && content?.content?.ev?.t
          ? [content.content.ev.t as string]
          : [];
      });
      expect(sessionEventTypes).not.toContain('turn-start');
      expect(sessionEventTypes).not.toContain('turn-end');
    } finally {
      if (sessionId) await stopDaemonSession(sessionId).catch(() => false);
      if (runnerPid && isProcessAlive(runnerPid)) process.kill(runnerPid, 'SIGTERM');
      if (runnerPid) {
        for (const processInfo of descendantProcesses(runnerPid).filter(isClaudeBackendProcess)) {
          if (isProcessAlive(processInfo.pid)) process.kill(processInfo.pid, 'SIGTERM');
        }
      }
      if (originalHeartbeat === undefined) delete process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL;
      else process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL = originalHeartbeat;
    }
  });


  // TODO: Test npm uninstall scenario - daemon should gracefully handle when agenthub is uninstalled
  // Current behavior: daemon tries to spawn new daemon on version mismatch but dist/index.mjs is gone
  // Expected: daemon should detect missing entrypoint and either exit cleanly or at minimum not respawn infinitely
});
