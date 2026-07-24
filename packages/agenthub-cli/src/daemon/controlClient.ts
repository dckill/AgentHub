/**
 * HTTP client helpers for daemon communication
 * Used by CLI commands to interact with running daemon
 */

import { logger } from '@/ui/logger';
import type { StopSessionResult } from './sessionStopState';
import { clearDaemonState, readDaemonState } from '@/persistence';
import { Metadata } from '@/api/types';
import { configuration } from '@/configuration';
import { readProcessIdentity } from './processIdentity';
import { assessDaemonOwnership } from './daemonOwnership';

async function ownershipOf(state: NonNullable<Awaited<ReturnType<typeof readDaemonState>>>) {
  return assessDaemonOwnership(state, await readProcessIdentity(state.pid));
}

async function daemonPost(path: string, body?: any): Promise<{ error?: string } | any> {
  const state = await readDaemonState();
  if (!state?.httpPort || !state.controlToken) {
    const errorMessage = 'No daemon running, no state file found';
    logger.debug(`[CONTROL CLIENT] ${errorMessage}`);
    return {
      error: errorMessage
    };
  }

  const ownership = await ownershipOf(state);
  if (ownership === 'mismatch' || ownership === 'missing') {
    return { error: `Daemon process identity is ${ownership}` };
  }

  try {
    process.kill(state.pid, 0);
  } catch (error) {
    const errorMessage = 'Daemon is not running, file is stale';
    logger.debug(`[CONTROL CLIENT] ${errorMessage}`);
    return {
      error: errorMessage
    };
  }

  try {
    const timeout = process.env.AGENTHUB_DAEMON_HTTP_TIMEOUT ? parseInt(process.env.AGENTHUB_DAEMON_HTTP_TIMEOUT) : 10_000;
    const response = await fetch(`http://127.0.0.1:${state.httpPort}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.controlToken}` },
      body: JSON.stringify(body || {}),
      // Mostly increased for stress test
      signal: AbortSignal.timeout(timeout)
    });
    
    if (!response.ok) {
      const errorMessage = `Request failed: ${path}, HTTP ${response.status}`;
      logger.debug(`[CONTROL CLIENT] ${errorMessage}`);
      return {
        error: errorMessage
      };
    }
    if (state.ownerNonce && response.headers.get('x-agenthub-owner-nonce') !== state.ownerNonce) {
      return { error: 'Daemon owner nonce mismatch' };
    }
    
    return await response.json();
  } catch (error) {
    const errorMessage = `Request failed: ${path}, ${error instanceof Error ? error.message : 'Unknown error'}`;
    logger.debug(`[CONTROL CLIENT] ${errorMessage}`);
    return {
      error: errorMessage
    }
  }
}

const SESSION_STARTED_RETRY_TIMEOUT_MS = 3000;
const SESSION_STARTED_RETRY_INTERVAL_MS = 100;

export async function notifyDaemonSessionStarted(
  sessionId: string,
  metadata: Metadata,
  encryption?: {
    encryptionKey: string;
    encryptionVariant: 'legacy' | 'dataKey';
    seq: number;
    metadataVersion: number;
    agentStateVersion: number;
  }
): Promise<{ error?: string } | any> {
  // Retry briefly — ensureDaemonRunning already waits for readiness, but we may
  // race a daemon that is mid-restart (version upgrade, crash recovery). Without
  // this, the session's encryption data never reaches the daemon and the mobile
  // app's resume-agenthub-session RPC fails with "not tracked by this daemon".
  const payload = { sessionId, metadata, encryption };
  const deadline = Date.now() + SESSION_STARTED_RETRY_TIMEOUT_MS;
  let result: { error?: string } | any;

  while (true) {
    result = await daemonPost('/session-started', payload);
    if (!result?.error) {
      return result;
    }
    if (Date.now() >= deadline) {
      return result;
    }
    await new Promise(resolve => setTimeout(resolve, SESSION_STARTED_RETRY_INTERVAL_MS));
  }
}

export async function listDaemonSessions(): Promise<any[]> {
  const result = await daemonPost('/list');
  return result.children || [];
}

export async function stopDaemonSessionDetailed(sessionId: string): Promise<StopSessionResult> {
  const result = await daemonPost('/stop-session', { sessionId });
  return {
    success: result?.success === true,
    state: ['stopping', 'exited', 'timeout', 'not-found'].includes(result?.state)
      ? result.state
      : result?.success === true ? 'stopping' : 'not-found',
  } as StopSessionResult;
}

export async function stopDaemonSession(sessionId: string): Promise<boolean> {
  return (await stopDaemonSessionDetailed(sessionId)).success;
}

export async function spawnDaemonSession(directory: string, sessionId?: string): Promise<any> {
  const result = await daemonPost('/spawn-session', { directory, sessionId });
  return result;
}

export async function stopDaemonHttp(): Promise<void> {
  const result = await daemonPost('/stop');
  if (result?.error) throw new Error(result.error);
}

/**
 * The version check is still quite naive.
 * For instance we are not handling the case where we upgraded agenthub,
 * the daemon is still running, and it recieves a new message to spawn a new session.
 * This is a tough case - we need to somehow figure out to restart ourselves,
 * yet still handle the original request.
 * 
 * Options:
 * 1. Periodically check during the health checks whether our version is the same as CLIs version. If not - restart.
 * 2. Wait for a command from the machine session, or any other signal to
 * check for version & restart.
 *   a. Handle the request first
 *   b. Let the request fail, restart and rely on the client retrying the request
 * 
 * I like option 1 a little better.
 * Maybe we can ... wait for it ... have another daemon to make sure 
 * our daemon is always alive and running the latest version.
 * 
 * That seems like an overkill and yet another process to manage - lets not do this :D
 * 
 * TODO: This function should return a state object with
 * clear state - if it is running / or errored out or something else.
 * Not just a boolean.
 * 
 * We can destructure the response on the caller for richer output.
 * For instance when running `agenthub daemon status` we can show more information.
 */
export async function checkIfDaemonRunningAndCleanupStaleState(): Promise<boolean> {
  const state = await readDaemonState();
  if (!state) {
    return false;
  }

  const ownership = await ownershipOf(state);
  if (ownership === 'missing' || ownership === 'mismatch') {
    logger.debug(`[DAEMON RUN] Daemon ownership ${ownership}, cleaning confirmed stale state`);
    await cleanupDaemonState();
    return false;
  }

  // PID is alive, but on Windows PIDs get reused after reboot.
  // Verify it's actually our daemon by HTTP pinging its control server.
  if (state.httpPort && state.controlToken) {
    try {
      const response = await fetch(`http://127.0.0.1:${state.httpPort}/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.controlToken}` },
        body: '{}',
        signal: AbortSignal.timeout(2000)
      });
      const nonceMatches = !state.ownerNonce || response.headers.get('x-agenthub-owner-nonce') === state.ownerNonce;
      if (response.ok && nonceMatches) {
        return true;
      }
    } catch (error) {
      logger.debug(`[DAEMON RUN] Control health check failed for PID ${state.pid}`, error);
    }
  }
  // A matching PID/start/exe/cmdline identity remains the owner even if its
  // control endpoint is temporarily unhealthy. Never start a duplicate.
  return ownership === 'confirmed';
}

/**
 * Check if the running daemon version matches the current CLI version.
 * This should work from both the daemon itself & a new CLI process.
 * Works via the daemon.state.json file.
 * 
 * @returns true if versions match, false if versions differ or no daemon running
 */
export async function isDaemonRunningCurrentlyInstalledAgentHubVersion(): Promise<boolean> {
  logger.debug('[DAEMON CONTROL] Checking if daemon is running same version');
  const runningDaemon = await checkIfDaemonRunningAndCleanupStaleState();
  if (!runningDaemon) {
    logger.debug('[DAEMON CONTROL] No daemon running, returning false');
    return false;
  }

  const state = await readDaemonState();
  if (!state) {
    logger.debug('[DAEMON CONTROL] No daemon state found, returning false');
    return false;
  }
  
  // Compare the running daemon's recorded version against THIS CLI invocation's
  // bundled version. Both are read from the same source of truth: the `version`
  // field baked into `dist/` at build time via `import packageJson from '../package.json'`.
  //
  // Previously we read `package.json` fresh from disk on every check, but that
  // produced infinite restart loops (#1107) when `package.json.version` diverged
  // from the bundled version — e.g. when `agenthub-coder@0.13.1` was published as
  // a deprecation stub that bumped the manifest without rebuilding `dist/`.
  // The daemon would write its bundled version (0.13.0), read 0.13.1 from disk,
  // detect a mismatch, self-restart, and the new daemon would repeat the cycle.
  //
  // Using `configuration.currentCliVersion` instead guarantees the writer and
  // reader agree whenever they're executing the same `dist/` bundle, and still
  // correctly detects real npm upgrades (the new bundle has a new baked version).
  const currentCliVersion = configuration.currentCliVersion;
  logger.debug(`[DAEMON CONTROL] Current CLI version: ${currentCliVersion}, Daemon started with version: ${state.startedWithCliVersion}`);
  return currentCliVersion === state.startedWithCliVersion;
}

export async function cleanupDaemonState(expectedOwnerNonce?: string): Promise<void> {
  try {
    if (expectedOwnerNonce) {
      const state = await readDaemonState();
      if (!state || state.ownerNonce !== expectedOwnerNonce) {
        logger.debug('[DAEMON RUN] Refusing to remove daemon state owned by another or unknown daemon');
        return;
      }
    }
    await clearDaemonState();
    logger.debug('[DAEMON RUN] Daemon state file removed');
  } catch (error) {
    logger.debug('[DAEMON RUN] Error cleaning up daemon metadata', error);
  }
}

export async function stopDaemon() {
  try {
    const state = await readDaemonState();
    if (!state) {
      logger.debug('No daemon state found');
      return;
    }

    logger.debug(`Stopping daemon with PID ${state.pid}`);
    const initialOwnership = await ownershipOf(state);
    if (initialOwnership === 'missing' || initialOwnership === 'mismatch') {
      logger.debug(`Refusing to signal PID ${state.pid}: daemon ownership is ${initialOwnership}`);
      await cleanupDaemonState();
      return;
    }

    // Try HTTP graceful stop
    try {
      await stopDaemonHttp();

      // Wait for daemon to die
      await waitForProcessDeath(state.pid, 2000);
      logger.debug('Daemon stopped gracefully via HTTP');
      return;
    } catch (error) {
      logger.debug('HTTP stop failed; considering identity-checked SIGTERM', error);
    }

    // Legacy state has no start/exe marker, so PID reuse cannot be excluded.
    if (initialOwnership !== 'confirmed') {
      logger.debug('Refusing signal fallback for legacy daemon state without process identity');
      return;
    }
    const currentOwnership = await ownershipOf(state);
    if (currentOwnership !== 'confirmed') {
      logger.debug(`Refusing signal fallback after ownership changed to ${currentOwnership}`);
      return;
    }
    try {
      process.kill(state.pid, 'SIGTERM');
      await waitForProcessDeath(state.pid, 5000);
      logger.debug('Daemon stopped via identity-checked SIGTERM');
    } catch (error) {
      logger.debug('Daemon did not stop after identity-checked SIGTERM; leaving it for system service supervision', error);
    }
  } catch (error) {
    logger.debug('Error stopping daemon', error);
  }
}

async function waitForProcessDeath(pid: number, timeout: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      process.kill(pid, 0);
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch {
      return; // Process is dead
    }
  }
  throw new Error('Process did not die within timeout');
}
