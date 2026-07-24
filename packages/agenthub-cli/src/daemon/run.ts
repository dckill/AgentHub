import fs from 'fs/promises';
import axios from 'axios';
import psList from 'ps-list';

import { ApiClient } from '@/api/api';
import { TrackedSession, SessionEncryptionData } from './types';
import {
  markSessionExited,
  markSessionTimeout,
  requestSessionStop,
  SessionStopStateRegistry,
  type StopSessionResult,
} from './sessionStopState';
import { DaemonState, Metadata } from '@/api/types';
import { SpawnSessionOptions, SpawnSessionResult } from '@/modules/common/registerCommonHandlers';
import { logger } from '@/ui/logger';
import { authAndSetupMachineIfNeeded } from '@/ui/auth';
import { configuration } from '@/configuration';
import { startCaffeinate, stopCaffeinate } from '@/utils/caffeinate';
import { spawnAgentHubCLI } from '@/utils/spawnAgentHubCLI';
import { writeDaemonState, DaemonLocallyPersistedState, readDaemonState, acquireDaemonLock, releaseDaemonLock, readPersistedSessions, persistSession } from '@/persistence';
import type { PersistedSession } from '@/persistence';

import { cleanupDaemonState, isDaemonRunningCurrentlyInstalledAgentHubVersion, stopDaemon } from './controlClient';
import { startDaemonControlServer } from './controlServer';
import { randomBytes } from 'node:crypto';
import { join } from 'path';
import { projectPath } from '@/projectPath';
import { getTmuxUtilities, isTmuxAvailable, parseTmuxSessionIdentifier, formatTmuxSessionIdentifier } from '@/utils/tmux';
import { expandEnvironmentVariables } from '@/utils/expandEnvVars';
import { buildResumeLaunch } from '@/resume/handleResumeCommand';
import { getEnvironmentInfo, initialMachineMetadata } from './machineMetadata';
import packageJson from '../../package.json';
import { encodeBase64, decodeBase64, decrypt, encrypt } from '@/api/encryption';
import { getDaemonBundleReplacementRestartMode } from './restartPolicy';
import { recoverPersistedDaemonSessions } from './recoverPersistedSessions';
import { createTemporaryCodexAuthHome } from './codexAuthHome';
import { bindSensitiveCleanupToChild } from './sensitiveResource';
import { readProcessIdentity } from './processIdentity';
import { hasDaemonStateOwnerChanged } from './daemonOwnership';
import { createShutdownWatchdog } from './shutdownWatchdog';
import { runDaemonCleanup } from './daemonCleanup';
import {
  readBundleTreeFingerprint,
  restoreBundleBackup,
  validateBundleCandidate,
  writeBundleBackup,
  type BundleFingerprint,
} from './bundleSafety';
import { archiveSessionOnServer } from './sessionArchiveFallback';
import { probeExternalProcessState } from './externalProcessMonitor';
import { TerminalOutboxJournal } from '@/api/terminalOutboxJournal';
import { CliUpdateManager } from '@/update/cliUpdater';
import type { CliUpdateStatus } from '@artsum/agenthub-wire';
export { initialMachineMetadata };

function shellQuoteArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function appendInitialModeArgs(args: string[], options: Pick<SpawnSessionOptions, 'permissionMode' | 'model'>): string[] {
  if (options.permissionMode) {
    args.push('--permission-mode', options.permissionMode);
  }
  if (options.model) {
    args.push('--model', options.model);
  }
  return args;
}

const SESSION_WEBHOOK_TIMEOUT_MS = 75_000;
const SESSION_STOP_TIMEOUT_MS = 10_000;
const SESSION_STOP_STATE_RETENTION_MS = 60_000;
const SESSION_EXTERNAL_EXIT_POLL_INTERVAL_MS = 100;
const SESSION_EXTERNAL_EXIT_POLL_TIMEOUT_MS = 5_000;

export async function startDaemon(): Promise<void> {
  // We don't have cleanup function at the time of server construction
  // Control flow is:
  // 1. Create promise that will resolve when shutdown is requested
  // 2. Setup signal handlers to resolve this promise with the source of the shutdown
  // 3. Once our setup is complete - if all goes well - we await this promise
  // 4. When it resolves we can cleanup and exit
  //
  // In case the setup malfunctions - our signal handlers will not properly
  // shut down. We will force exit the process with code 1.
  let requestShutdown: (source: 'agenthub-app' | 'agenthub-cli' | 'os-signal' | 'exception', errorMessage?: string) => void;
  const shutdownWatchdog = createShutdownWatchdog(async () => {
    logger.debug('[DAEMON RUN] Startup malfunctioned, forcing exit with code 1');

    // Give time for logs to be flushed
    await new Promise(resolve => setTimeout(resolve, 100));

    process.exit(1);
  });
  let resolvesWhenShutdownRequested = new Promise<({ source: 'agenthub-app' | 'agenthub-cli' | 'os-signal' | 'exception', errorMessage?: string })>((resolve) => {
    requestShutdown = (source, errorMessage) => {
      logger.debug(`[DAEMON RUN] Requesting shutdown (source: ${source}, errorMessage: ${errorMessage})`);

      // Fallback - in case startup malfunctions - we will force exit the process with code 1.
      // The timer is cancelled after graceful cleanup so normal shutdown cannot be truncated.
      shutdownWatchdog.request();

      // Start graceful shutdown
      resolve({ source, errorMessage });
    };
  });

  // Setup signal handlers
  process.on('SIGINT', () => {
    logger.debug('[DAEMON RUN] Received SIGINT');
    requestShutdown('os-signal');
  });

  process.on('SIGTERM', () => {
    logger.debug('[DAEMON RUN] Received SIGTERM');
    requestShutdown('os-signal');
  });

  process.on('uncaughtException', (error) => {
    logger.debug('[DAEMON RUN] FATAL: Uncaught exception', error);
    logger.debug(`[DAEMON RUN] Stack trace: ${error.stack}`);
    requestShutdown('exception', error.message);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.debug('[DAEMON RUN] FATAL: Unhandled promise rejection', reason);
    logger.debug(`[DAEMON RUN] Rejected promise:`, promise);
    const error = reason instanceof Error ? reason : new Error(`Unhandled promise rejection: ${reason}`);
    logger.debug(`[DAEMON RUN] Stack trace: ${error.stack}`);
    requestShutdown('exception', error.message);
  });

  process.on('exit', (code) => {
    logger.debug(`[DAEMON RUN] Process exiting with code: ${code}`);
  });

  process.on('beforeExit', (code) => {
    logger.debug(`[DAEMON RUN] Process about to exit with code: ${code}`);
  });

  logger.debug('[DAEMON RUN] Starting daemon process...');
  logger.debugLargeJson('[DAEMON RUN] Environment', getEnvironmentInfo());
  const ownerNonce = randomBytes(32).toString('base64url');
  const processIdentity = await readProcessIdentity(process.pid);
  if (!processIdentity) throw new Error('Unable to establish daemon process identity');

  // Check if already running
  // Check if running daemon version matches current CLI version
  const runningDaemonVersionMatches = await isDaemonRunningCurrentlyInstalledAgentHubVersion();
  if (!runningDaemonVersionMatches) {
    // TODO: This hand-rolled self-restart path is awkward to reason about and awkward to test.
    // We should probably migrate this daemon to native system service management
    // (launchd/systemd), so startup/start-at-login and upgrades
    // are owned by the OS instead of by the daemon trying to replace itself in-process.
    logger.debug('[DAEMON RUN] Daemon version mismatch detected, restarting daemon with current CLI version');
    await stopDaemon();
  } else {
    logger.debug('[DAEMON RUN] Daemon version matches, keeping existing daemon');
    console.log('Daemon already running with matching version');
    process.exit(0);
  }

  // Acquire exclusive lock (proves daemon is running)
  const daemonLockHandle = await acquireDaemonLock(5, 200, { ownerNonce, processIdentity });
  if (!daemonLockHandle) {
    logger.debug('[DAEMON RUN] Daemon lock file already held, another daemon is running');
    process.exit(0);
  }

  // At this point we should be safe to startup the daemon:
  // 1. Not have a stale daemon state
  // 2. Should not have another daemon process running

  try {
    // Start caffeinate
    const caffeinateStarted = startCaffeinate();
    if (caffeinateStarted) {
      logger.debug('[DAEMON RUN] Sleep prevention enabled');
    }

    // Ensure auth and machine registration BEFORE anything else
    const { credentials, machineId } = await authAndSetupMachineIfNeeded();
    logger.debug('[DAEMON RUN] Auth and machine setup complete');

    // Setup state - key by PID
    const pidToTrackedSession = new Map<number, TrackedSession>();
    const stopStateRegistry = new SessionStopStateRegistry({
      retentionMs: SESSION_STOP_STATE_RETENTION_MS,
    });

    // Retain session data after process exits so resume can still find it.
    // Pre-populate from disk so sessions survive daemon restarts.
    const sessionIdToFinishedSession = new Map<string, TrackedSession>();

    const archiveServerSessionAfterProcessExit = async (
      sessionId: string,
      trackedSession: TrackedSession,
    ): Promise<void> => {
      const journal = new TerminalOutboxJournal(join(
        configuration.agentHubHomeDir,
        'terminal-outbox',
        `${encodeURIComponent(sessionId)}.json`,
      ));
      const pendingSessionEnd = journal.pendingSessionEnd();
      const fallbackMetadata = pendingSessionEnd?.sessionId === sessionId
        && trackedSession.encryption
        && trackedSession.agenthubSessionMetadataFromLocalWebhook
        ? {
            value: {
              ...trackedSession.agenthubSessionMetadataFromLocalWebhook,
              lifecycleState: 'archived' as const,
              lifecycleStateSince: Date.now(),
              archivedBy: 'cli' as const,
              archiveReason: trackedSession.stopRequestedAt
                ? 'User terminated'
                : 'Runner process exited before session-end was acknowledged',
            },
            encryption: trackedSession.encryption,
          }
        : undefined;
      const result = await archiveSessionOnServer({
        serverUrl: configuration.serverUrl,
        sessionId,
        token: credentials.token,
        ...(fallbackMetadata ? {
          metadata: encodeBase64(encrypt(
            fallbackMetadata.encryption.encryptionKey,
            fallbackMetadata.encryption.encryptionVariant,
            fallbackMetadata.value,
          )),
          expectedMetadataVersion: fallbackMetadata.encryption.metadataVersion,
        } : {}),
      });
      if (result.ok) {
        try {
          if (pendingSessionEnd?.sessionId === sessionId) {
            journal.consumeSessionEnd();
          }
          if (fallbackMetadata) {
            fallbackMetadata.encryption.metadataVersion += 1;
            trackedSession.agenthubSessionMetadataFromLocalWebhook = fallbackMetadata.value;
            persistSession(sessionId, {
              encryptionKey: encodeBase64(fallbackMetadata.encryption.encryptionKey),
              encryptionVariant: fallbackMetadata.encryption.encryptionVariant,
              seq: fallbackMetadata.encryption.seq,
              metadataVersion: fallbackMetadata.encryption.metadataVersion,
              agentStateVersion: fallbackMetadata.encryption.agentStateVersion,
              metadata: fallbackMetadata.value,
              savedAt: Date.now(),
            });
          }
        } catch (error) {
          logger.debug(`[DAEMON RUN] Failed to consume archived session-end marker for ${sessionId}`, error);
        }
        logger.debug(`[DAEMON RUN] Server archive fallback completed for ${sessionId}`);
      } else {
        logger.debug(`[DAEMON RUN] Server archive fallback failed for ${sessionId}: ${result.reason}${result.status ? ` (${result.status})` : ''}`);
      }
    };
    const persisted = readPersistedSessions();
    for (const [id, s] of Object.entries(persisted)) {
      sessionIdToFinishedSession.set(id, {
        startedBy: 'persisted',
        agentHubSessionId: id,
        agenthubSessionMetadataFromLocalWebhook: s.metadata,
        encryption: {
          encryptionKey: decodeBase64(s.encryptionKey),
          encryptionVariant: s.encryptionVariant,
          seq: s.seq,
          metadataVersion: s.metadataVersion,
          agentStateVersion: s.agentStateVersion,
        },
        pid: 0,
      });
    }
    if (Object.keys(persisted).length > 0) {
      logger.debug(`[DAEMON RUN] Loaded ${Object.keys(persisted).length} persisted sessions from disk`);
    }
    try {
      const processSnapshot = await psList();
      const recoveredSessions = recoverPersistedDaemonSessions(persisted, processSnapshot);
      for (const session of recoveredSessions) {
        pidToTrackedSession.set(session.pid, session);
      }
      if (recoveredSessions.length > 0) {
        logger.debug(`[DAEMON RUN] Recovered ${recoveredSessions.length} running daemon-spawned sessions after daemon restart: ${recoveredSessions.map(s => `${s.agentHubSessionId}@${s.pid}`).join(', ')}`);
      }
    } catch (error) {
      logger.debug('[DAEMON RUN] Failed to recover persisted daemon-spawned sessions', error);
    }

    // Session spawning awaiter system
    const pidToAwaiter = new Map<number, (session: TrackedSession) => void>();

    const awaitSessionWebhook = (
      pid: number,
      resolve: (result: SpawnSessionResult) => void,
      suffix = '',
    ) => {
      const timeout = setTimeout(() => {
        pidToAwaiter.delete(pid);
        const trackedSession = pidToTrackedSession.get(pid);
        const elapsedMs = trackedSession?.spawnStartedAt ? Date.now() - trackedSession.spawnStartedAt : undefined;
        const childError = trackedSession?.error;
        const timeoutMessage = childError
          ? `Session failed before webhook for PID ${pid}${suffix}: ${childError}`
          : `Session webhook timeout for PID ${pid}${suffix}${elapsedMs !== undefined ? ` after ${elapsedMs}ms` : ''}`;
        logger.debug(`[DAEMON RUN] ${timeoutMessage}`);
        resolve({
          type: 'error',
          errorMessage: timeoutMessage,
        });
      }, SESSION_WEBHOOK_TIMEOUT_MS);

      pidToAwaiter.set(pid, (completedSession) => {
        clearTimeout(timeout);
        logger.debug(`[DAEMON RUN] Session ${completedSession.agentHubSessionId} fully spawned with webhook${suffix}`);
        resolve({
          type: 'success',
          sessionId: completedSession.agentHubSessionId!,
        });
      });
    };

    // Helper functions
    const getCurrentChildren = () => Array.from(pidToTrackedSession.values());

    // Handle webhook from agenthub session reporting itself
    const onAgentHubSessionWebhook = (sessionId: string, sessionMetadata: Metadata, encryption?: SessionEncryptionData) => {
      logger.debugLargeJson(`[DAEMON RUN] Session reported`, sessionMetadata);

      const pid = sessionMetadata.hostPid;
      if (!pid) {
        logger.debug(`[DAEMON RUN] Session webhook missing hostPid for sessionId: ${sessionId}`);
        return;
      }

      logger.debug(`[DAEMON RUN] Session webhook: ${sessionId}, PID: ${pid}, started by: ${sessionMetadata.startedBy || 'unknown'}, hasEncryption: ${!!encryption}`);
      logger.debug(`[DAEMON RUN] Current tracked sessions before webhook: ${Array.from(pidToTrackedSession.keys()).join(', ')}`);

      // Persist encryption data to disk so it survives daemon restarts
      if (encryption) {
        persistSession(sessionId, {
          encryptionKey: encodeBase64(encryption.encryptionKey),
          encryptionVariant: encryption.encryptionVariant,
          seq: encryption.seq,
          metadataVersion: encryption.metadataVersion,
          agentStateVersion: encryption.agentStateVersion,
          metadata: sessionMetadata,
          savedAt: Date.now(),
        });
      }

      // Check if we already have this PID (daemon-spawned)
      const existingSession = pidToTrackedSession.get(pid);

      if (existingSession && existingSession.startedBy === 'daemon') {
        // Update daemon-spawned session with reported data
        existingSession.agentHubSessionId = sessionId;
        existingSession.agenthubSessionMetadataFromLocalWebhook = sessionMetadata;
        existingSession.encryption = encryption;
        logger.debug(`[DAEMON RUN] Updated daemon-spawned session ${sessionId} with metadata`);

        // Resolve any awaiter for this PID
        const awaiter = pidToAwaiter.get(pid);
        if (awaiter) {
          pidToAwaiter.delete(pid);
          awaiter(existingSession);
          logger.debug(`[DAEMON RUN] Resolved session awaiter for PID ${pid}`);
        }
      } else if (!existingSession) {
        // New session started externally
        const trackedSession: TrackedSession = {
          startedBy: 'agenthub directly - likely by user from terminal',
          agentHubSessionId: sessionId,
          agenthubSessionMetadataFromLocalWebhook: sessionMetadata,
          encryption,
          pid
        };
        pidToTrackedSession.set(pid, trackedSession);
        logger.debug(`[DAEMON RUN] Registered externally-started session ${sessionId}`);
      }
    };

    // Spawn a new session (sessionId reserved for future --resume functionality)
    const spawnSession = async (options: SpawnSessionOptions): Promise<SpawnSessionResult> => {
      logger.debugLargeJson('[DAEMON RUN] Spawning session', options);

      const { directory, sessionId, machineId, approvedNewDirectoryCreation = true } = options;
      let directoryCreated = false;

      let sensitiveAuthCleanup: (() => void) | undefined;
      try {
        await fs.access(directory);
        logger.debug(`[DAEMON RUN] Directory exists: ${directory}`);
      } catch (error) {
        logger.debug(`[DAEMON RUN] Directory doesn't exist, creating: ${directory}`);

        // Check if directory creation is approved
        if (!approvedNewDirectoryCreation) {
          logger.debug(`[DAEMON RUN] Directory creation not approved for: ${directory}`);
          return {
            type: 'requestToApproveDirectoryCreation',
            directory
          };
        }

        try {
          await fs.mkdir(directory, { recursive: true });
          logger.debug(`[DAEMON RUN] Successfully created directory: ${directory}`);
          directoryCreated = true;
        } catch (mkdirError: any) {
          let errorMessage = `Unable to create directory at '${directory}'. `;

          // Provide more helpful error messages based on the error code
          if (mkdirError.code === 'EACCES') {
            errorMessage += `Permission denied. You don't have write access to create a folder at this location. Try using a different path or check your permissions.`;
          } else if (mkdirError.code === 'ENOTDIR') {
            errorMessage += `A file already exists at this path or in the parent path. Cannot create a directory here. Please choose a different location.`;
          } else if (mkdirError.code === 'ENOSPC') {
            errorMessage += `No space left on device. Your disk is full. Please free up some space and try again.`;
          } else if (mkdirError.code === 'EROFS') {
            errorMessage += `The file system is read-only. Cannot create directories here. Please choose a writable location.`;
          } else {
            errorMessage += `System error: ${mkdirError.message || mkdirError}. Please verify the path is valid and you have the necessary permissions.`;
          }

          logger.debug(`[DAEMON RUN] Directory creation failed: ${errorMessage}`);
          return {
            type: 'error',
            errorMessage
          };
        }
      }

      try {

        // Build environment variables for session spawning
        // Authentication tokens are resolved here

        // Resolve authentication token if provided
        const authEnv: Record<string, string> = {};
        if (options.token) {
          if (options.agent === 'codex') {

            // Create a temporary directory for Codex
            const codexHomeDir = createTemporaryCodexAuthHome(options.token);
            sensitiveAuthCleanup = codexHomeDir.cleanup;

            // Set the environment variable for Codex
            authEnv.CODEX_HOME = codexHomeDir.path;
          } else { // Assuming claude
            authEnv.CLAUDE_CODE_OAUTH_TOKEN = options.token;
          }
        }

        let extraEnv = {
          ...authEnv,
          ...(options.environmentVariables ?? {}),
        };
        if (options.parentSessionId) {
          extraEnv.AGENTHUB_FORKED_FROM_SESSION_ID = options.parentSessionId;
        }
        if (options.forkedFromMessageId) {
          extraEnv.AGENTHUB_FORKED_FROM_MESSAGE_ID = options.forkedFromMessageId;
        }
        if (options.resumeClaudeSessionId) {
          extraEnv.AGENTHUB_FORK_CLAUDE_SESSION_ID = options.resumeClaudeSessionId;
        }
        if (options.resumeCodexThreadId) {
          extraEnv.AGENTHUB_FORK_CODEX_THREAD_ID = options.resumeCodexThreadId;
        }
        if (options.officialMirrorClaudeSessionId) {
          extraEnv.AGENTHUB_MIRROR_CLAUDE_SESSION_ID = options.officialMirrorClaudeSessionId;
        }
        if (options.officialMirrorCodexThreadId) {
          extraEnv.AGENTHUB_MIRROR_CODEX_THREAD_ID = options.officialMirrorCodexThreadId;
        }
        logger.debug(`[DAEMON RUN] Environment variable keys (before expansion) (${Object.keys(extraEnv).length}): ${Object.keys(extraEnv).join(', ')}`);

        // Expand ${VAR} references from daemon's process.env
        // This ensures variable substitution works in both tmux and non-tmux modes
        // Example: ANTHROPIC_AUTH_TOKEN="${Z_AI_AUTH_TOKEN}" → ANTHROPIC_AUTH_TOKEN="sk-real-key"
        extraEnv = expandEnvironmentVariables(extraEnv, process.env);
        logger.debug(`[DAEMON RUN] After variable expansion: ${Object.keys(extraEnv).join(', ')}`);

        // Fail fast if any passed-through environment variable still contains an
        // unresolved ${VAR} reference after expansion.
        const unresolvedEnvEntries = Object.entries(extraEnv).flatMap(([key, value]) => {
          if (typeof value !== 'string' || !value.includes('${')) {
            return [];
          }

          const unresolvedMatch = value.match(/\$\{([^}]+)\}/);
          if (!unresolvedMatch) {
            return [];
          }

          const expression = unresolvedMatch[1];
          const defaultSeparatorIndex = expression.indexOf(':-');
          const missingVar = defaultSeparatorIndex === -1
            ? expression
            : expression.slice(0, defaultSeparatorIndex);

          return [`${key} references \${${missingVar}} which is not defined`];
        });

        if (unresolvedEnvEntries.length > 0) {
          const errorMessage = `Session environment is invalid - environment variables not found in daemon: ${unresolvedEnvEntries.join('; ')}. ` +
            `Ensure these variables are set in the daemon's environment before starting sessions.`;
          logger.warn(`[DAEMON RUN] ${errorMessage}`);
          sensitiveAuthCleanup?.();
          sensitiveAuthCleanup = undefined;
          return {
            type: 'error',
            errorMessage
          };
        }

        // Check if tmux is available and should be used
        const tmuxAvailable = await isTmuxAvailable();
        let useTmux = tmuxAvailable;
        if (sensitiveAuthCleanup) {
          // A detached tmux window has no reliable child exit event for removing
          // the temporary token directory, so token-authenticated Codex sessions
          // use the directly tracked child-process path.
          useTmux = false;
        }

        // Get tmux session name from environment variables (now set by profile system)
        // Empty string means "use current/most recent session" (tmux default behavior)
        let tmuxSessionName: string | undefined = extraEnv.TMUX_SESSION_NAME;

        // If tmux is not available or session name is explicitly undefined, fall back to regular spawning
        // Note: Empty string is valid (means use current/most recent tmux session)
        if (!tmuxAvailable || tmuxSessionName === undefined) {
          useTmux = false;
          if (tmuxSessionName !== undefined) {
            logger.debug(`[DAEMON RUN] tmux session name specified but tmux not available, falling back to regular spawning`);
          }
        }

        if (useTmux && tmuxSessionName !== undefined) {
          // Try to spawn in tmux session
          const sessionDesc = tmuxSessionName || 'current/most recent session';
          logger.debug(`[DAEMON RUN] Attempting to spawn session in tmux: ${sessionDesc}`);

          const tmux = getTmuxUtilities(tmuxSessionName);

          // Construct command for the CLI
          const cliPath = join(projectPath(), 'dist', 'index.mjs');
          const agent = options.agent === 'codex' ? 'codex' : 'claude';
          const commandArgs = appendInitialModeArgs([
            'node',
            '--no-warnings',
            '--no-deprecation',
            cliPath,
            agent,
            '--agenthub-starting-mode',
            'remote',
            '--started-by',
            'daemon',
          ], options);
          const resumeId = agent === 'claude'
            ? options.resumeClaudeSessionId
            : (agent === 'codex' ? options.resumeCodexThreadId : undefined);
          if (resumeId) {
            commandArgs.push('--resume', resumeId);
          }
          const fullCommand = commandArgs.map(shellQuoteArg).join(' ');

          // Spawn in tmux with environment variables
          // IMPORTANT: Pass complete environment (process.env + extraEnv) because:
          // 1. tmux sessions need daemon's expanded auth variables (e.g., ANTHROPIC_AUTH_TOKEN)
          // 2. Regular spawn uses env: { ...process.env, ...extraEnv }
          // 3. tmux needs explicit environment via -e flags to ensure all variables are available
          const windowName = `agenthub-${Date.now()}-${agent}`;
          const tmuxEnv: Record<string, string> = {};

          // Add all daemon environment variables (filtering out undefined)
          for (const [key, value] of Object.entries(process.env)) {
            if (value !== undefined) {
              tmuxEnv[key] = value;
            }
          }

          // Add extra environment variables (these should already be filtered)
          Object.assign(tmuxEnv, extraEnv);

          const tmuxResult = await tmux.spawnInTmux([fullCommand], {
            sessionName: tmuxSessionName,
            windowName: windowName,
            cwd: directory
          }, tmuxEnv);  // Pass complete environment for tmux session

          if (tmuxResult.success) {
            logger.debug(`[DAEMON RUN] Successfully spawned in tmux session: ${tmuxResult.sessionId}, PID: ${tmuxResult.pid}`);

            // Validate we got a PID from tmux
            if (!tmuxResult.pid) {
              throw new Error('Tmux window created but no PID returned');
            }

            // Create a tracked session for tmux windows - now we have the real PID!
            const trackedSession: TrackedSession = {
              startedBy: 'daemon',
              pid: tmuxResult.pid, // Real PID from tmux -P flag
              spawnStartedAt: Date.now(),
              tmuxSessionId: tmuxResult.sessionId,
              directoryCreated,
              message: directoryCreated
                ? `The path '${directory}' did not exist. We created a new folder and spawned a new session in tmux session '${tmuxSessionName}'. Use 'tmux attach -t ${tmuxSessionName}' to view the session.`
                : `Spawned new session in tmux session '${tmuxSessionName}'. Use 'tmux attach -t ${tmuxSessionName}' to view the session.`
            };

            // Add to tracking map so webhook can find it later
            pidToTrackedSession.set(tmuxResult.pid, trackedSession);

            // Wait for webhook to populate session with agentHubSessionId (exact same as regular flow)
            logger.debug(`[DAEMON RUN] Waiting for session webhook for PID ${tmuxResult.pid} (tmux)`);

            return new Promise((resolve) => {
              awaitSessionWebhook(tmuxResult.pid!, resolve, ' (tmux)');
            });
          } else {
            logger.debug(`[DAEMON RUN] Failed to spawn in tmux: ${tmuxResult.error}, falling back to regular spawning`);
            useTmux = false;
          }
        }

        // Regular process spawning (fallback or if tmux not available)
        if (!useTmux) {
          logger.debug(`[DAEMON RUN] Using regular process spawning`);

          // Construct arguments for the supported Claude Code and Codex CLIs.
          let agentCommand: string;
          switch (options.agent) {
            case 'claude':
            case undefined:
              agentCommand = 'claude';
              break;
            case 'codex':
              agentCommand = 'codex';
              break;
            default:
              return {
                type: 'error',
                errorMessage: `Unsupported agent type: '${options.agent}'. Please update your CLI to the latest version.`
              };
          }
          const args = [
            agentCommand,
            '--agenthub-starting-mode', 'remote',
            '--started-by', 'daemon'
          ];
          appendInitialModeArgs(args, options);
          if (options.resumeClaudeSessionId && agentCommand === 'claude') {
            args.push('--resume', options.resumeClaudeSessionId);
          }
          if (options.resumeCodexThreadId && agentCommand === 'codex') {
            args.push('--resume', options.resumeCodexThreadId);
          }

          // TODO: In future, sessionId could be used with --resume to continue existing sessions
          // For now, we ignore it - each spawn creates a new session
          return spawnTrackedAgentHubProcess({
            args,
            cwd: directory,
            env: {
              ...process.env,
              ...extraEnv
            },
            directoryCreated,
            message: directoryCreated ? `The path '${directory}' did not exist. We created a new folder and spawned a new session there.` : undefined,
            cleanup: sensitiveAuthCleanup,
          });
        }

        // This should never be reached, but TypeScript requires a return statement
        return {
          type: 'error',
          errorMessage: 'Unexpected error in session spawning'
        };
      } catch (error) {
        sensitiveAuthCleanup?.();
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.debug('[DAEMON RUN] Failed to spawn session:', error);
        return {
          type: 'error',
          errorMessage: `Failed to spawn session: ${errorMessage}`
        };
      }
    };

    const spawnTrackedAgentHubProcess = ({
      args,
      cwd,
      env,
      directoryCreated = false,
      message,
      cleanup,
    }: {
      args: string[];
      cwd: string;
      env: NodeJS.ProcessEnv;
      directoryCreated?: boolean;
      message?: string;
      cleanup?: () => void;
    }): Promise<SpawnSessionResult> => {
      const agenthubProcess = spawnAgentHubCLI(args, {
        cwd,
        detached: true,
        stdio: 'ignore',
        env,
      });

      if (!agenthubProcess.pid) {
        cleanup?.();
        logger.debug('[DAEMON RUN] Failed to spawn process - no PID returned');
        return Promise.resolve({
          type: 'error',
          errorMessage: 'Failed to spawn AgentHub process - no PID returned'
        });
      }

      logger.debug(`[DAEMON RUN] Spawned process with PID ${agenthubProcess.pid}`);

      const trackedSession: TrackedSession = {
        startedBy: 'daemon',
        pid: agenthubProcess.pid,
        childProcess: agenthubProcess,
        spawnStartedAt: Date.now(),
        directoryCreated,
        message,
      };

      pidToTrackedSession.set(agenthubProcess.pid, trackedSession);

      bindSensitiveCleanupToChild(agenthubProcess, cleanup);

      agenthubProcess.on('exit', (code, signal) => {
        logger.debug(`[DAEMON RUN] Child PID ${agenthubProcess.pid} exited with code ${code}, signal ${signal}`);
        if (agenthubProcess.pid) {
          const tracked = pidToTrackedSession.get(agenthubProcess.pid);
          if (tracked && !tracked.agentHubSessionId) {
            tracked.error = code === null
              ? `process exited with signal ${signal ?? 'unknown'}`
              : `process exited with code ${code}`;
            const awaiter = pidToAwaiter.get(agenthubProcess.pid);
            if (awaiter) {
              pidToAwaiter.delete(agenthubProcess.pid);
              awaiter(tracked);
            }
          }
          onChildExited(agenthubProcess.pid);
        }
      });

      agenthubProcess.on('error', (error) => {
        logger.debug(`[DAEMON RUN] Child process error:`, error);
        if (agenthubProcess.pid) {
          const tracked = pidToTrackedSession.get(agenthubProcess.pid);
          if (tracked && !tracked.agentHubSessionId) {
            tracked.error = error instanceof Error ? error.message : String(error);
            const awaiter = pidToAwaiter.get(agenthubProcess.pid);
            if (awaiter) {
              pidToAwaiter.delete(agenthubProcess.pid);
              awaiter(tracked);
            }
          }
          onChildExited(agenthubProcess.pid);
        }
      });

      logger.debug(`[DAEMON RUN] Waiting for session webhook for PID ${agenthubProcess.pid}`);

      return new Promise((resolve) => {
        awaitSessionWebhook(agenthubProcess.pid!, resolve);
      });
    };

    const findTrackedSessionById = (agentHubSessionId: string): TrackedSession | undefined => {
      for (const session of pidToTrackedSession.values()) {
        if (session.agentHubSessionId === agentHubSessionId) return session;
      }
      return sessionIdToFinishedSession.get(agentHubSessionId);
    };

    const fetchServerSessionMetadata = async (sessionId: string, encryptionKey: Uint8Array, encryptionVariant: 'legacy' | 'dataKey'): Promise<Metadata | null> => {
      try {
        const response = await axios.get(`${configuration.serverUrl}/v1/sessions`, {
          headers: { Authorization: `Bearer ${credentials.token}` },
          timeout: 10_000,
        });
        const sessions = (response.data as { sessions: { id: string; metadata: string }[] }).sessions;
        const matched = sessions.find(s => s.id === sessionId);
        if (!matched) return null;
        const decrypted = decrypt(encryptionKey, encryptionVariant, decodeBase64(matched.metadata));
        return decrypted as Metadata | null;
      } catch (error) {
        logger.debug(`[DAEMON RUN] Failed to fetch session metadata from server: ${error instanceof Error ? error.message : error}`);
        return null;
      }
    };

    const resumeSession = async (agentHubSessionId: string, options?: { model?: string; permissionMode?: string }): Promise<SpawnSessionResult> => {
      try {
        const tracked = findTrackedSessionById(agentHubSessionId);
        if (!tracked) {
          return { type: 'error', errorMessage: `Session ${agentHubSessionId} is not tracked by this daemon. It may have been started before the daemon or on another machine.` };
        }
        if (!tracked.agenthubSessionMetadataFromLocalWebhook) {
          return { type: 'error', errorMessage: `Session ${agentHubSessionId} has no metadata. Cannot resume.` };
        }
        if (!tracked.encryption) {
          return { type: 'error', errorMessage: `Session ${agentHubSessionId} has no stored encryption data. It was likely started before this feature was available. Restart the daemon and start a new session to enable resume.` };
        }

        // Webhook metadata may be stale (missing claudeSessionId/codexThreadId set after startup).
        // Fetch fresh metadata from server if needed.
        let metadata = tracked.agenthubSessionMetadataFromLocalWebhook;
        const needsFetch = (!metadata.claudeSessionId && (!metadata.flavor || metadata.flavor === 'claude'))
          || (!metadata.codexThreadId && metadata.flavor === 'codex');
        if (needsFetch) {
          logger.debug(`[DAEMON RUN] Session ${agentHubSessionId} missing agent session ID in webhook metadata, fetching from server`);
          const serverMetadata = await fetchServerSessionMetadata(agentHubSessionId, tracked.encryption.encryptionKey, tracked.encryption.encryptionVariant);
          if (serverMetadata) {
            metadata = serverMetadata;
            tracked.agenthubSessionMetadataFromLocalWebhook = serverMetadata;
          }
        }

        const launch = buildResumeLaunch(
          { id: agentHubSessionId, active: true, metadata },
          { startedBy: 'daemon', claudeStartingMode: 'remote' },
        );

        if (options?.model) {
          launch.args.push('--model', options.model);
        }
        if (options?.permissionMode) {
          launch.args.push('--permission-mode', options.permissionMode);
        }

        await fs.access(launch.cwd);

        return spawnTrackedAgentHubProcess({
          args: launch.args,
          cwd: launch.cwd,
          env: {
            ...process.env,
            AGENTHUB_RECONNECT_SESSION_ID: agentHubSessionId,
            AGENTHUB_RECONNECT_ENCRYPTION_KEY: encodeBase64(tracked.encryption.encryptionKey),
            AGENTHUB_RECONNECT_ENCRYPTION_VARIANT: tracked.encryption.encryptionVariant,
            AGENTHUB_RECONNECT_SEQ: String(tracked.encryption.seq),
            AGENTHUB_RECONNECT_METADATA_VERSION: String(tracked.encryption.metadataVersion),
            AGENTHUB_RECONNECT_AGENT_STATE_VERSION: String(tracked.encryption.agentStateVersion),
          },
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : (error && typeof error === 'object' ? JSON.stringify(error) : String(error));
        logger.debug(`[DAEMON RUN] Failed to resume session: ${errorMessage}`, error instanceof Error ? error.stack : undefined);
        return {
          type: 'error',
          errorMessage: `Failed to resume session: ${errorMessage}`,
        };
      }
    };

    // Stop a session by sessionId or PID fallback
    const stopSession = (sessionId: string): StopSessionResult => {
      logger.debug(`[DAEMON RUN] Attempting to stop session ${sessionId}`);

      const terminalState = stopStateRegistry.get(sessionId);
      if (terminalState) {
        logger.debug(`[DAEMON RUN] Session ${sessionId} already reached terminal state ${terminalState}`);
        return { success: true, state: terminalState };
      }

      // Try to find by sessionId first
      for (const [pid, session] of pidToTrackedSession.entries()) {
        if (session.agentHubSessionId === sessionId ||
          (sessionId.startsWith('PID-') && pid === parseInt(sessionId.replace('PID-', '')))) {

          const transition = requestSessionStop(session.lifecycleState ?? 'running');
          session.lifecycleState = transition.state;
          if (!transition.shouldSignal) {
            logger.debug(`[DAEMON RUN] Session ${sessionId} is already ${session.lifecycleState}; stop is idempotent`);
            return { success: true, state: session.lifecycleState as StopSessionResult['state'] };
          }
          session.stopRequestedAt = Date.now();

          if (session.startedBy === 'daemon' && session.childProcess) {
            try {
              session.childProcess.kill('SIGTERM');
              logger.debug(`[DAEMON RUN] Sent SIGTERM to daemon-spawned session ${sessionId}`);
            } catch (error) {
              logger.debug(`[DAEMON RUN] Failed to kill session ${sessionId}:`, error);
            }
          } else {
            // For externally started sessions, try to kill by PID
            try {
              process.kill(pid, 'SIGTERM');
              logger.debug(`[DAEMON RUN] Sent SIGTERM to external session PID ${pid}`);
            } catch (error) {
              logger.debug(`[DAEMON RUN] Failed to kill external session PID ${pid}:`, error);
            }
            monitorExternalSessionExit(pid, session);
          }

          const trackedAtRequest = session;
          session.stopTimer = setTimeout(() => {
            if (pidToTrackedSession.get(pid) !== trackedAtRequest || trackedAtRequest.lifecycleState !== 'stopping') {
              return;
            }
            trackedAtRequest.lifecycleState = markSessionTimeout(trackedAtRequest.lifecycleState);
            if (trackedAtRequest.agentHubSessionId) {
              stopStateRegistry.record(trackedAtRequest.agentHubSessionId, 'timeout');
            }
            trackedAtRequest.stopTimer = undefined;
            logger.warn(`[DAEMON RUN] Session ${sessionId} did not exit after ${SESSION_STOP_TIMEOUT_MS}ms; marked timeout and escalating after confirmed SIGTERM timeout`);
            try {
              if (trackedAtRequest.childProcess) {
                trackedAtRequest.childProcess.kill('SIGKILL');
              } else {
                process.kill(pid, 'SIGKILL');
              }
              logger.warn(`[DAEMON RUN] Force-terminated timed-out session ${sessionId} (PID ${pid}) after SIGTERM timeout`);
              if (!trackedAtRequest.childProcess) {
                // A successful SIGKILL cannot be handled or ignored by the
                // target. Do not depend on the external parent reaping its
                // zombie within a short polling window before converging the
                // daemon and server projections.
                onChildExited(pid);
              }
            } catch (error) {
              logger.warn(`[DAEMON RUN] Failed to force-terminate timed-out session ${sessionId} (PID ${pid})`, error);
            }
          }, SESSION_STOP_TIMEOUT_MS);
          session.stopTimer.unref?.();
          return { success: true, state: 'stopping' };
        }
      }

      logger.debug(`[DAEMON RUN] Session ${sessionId} not found`);
      return { success: false, state: 'not-found' };
    };

    // Handle child process exit — preserve session data for resume
    function onChildExited(pid: number): void {
      const session = pidToTrackedSession.get(pid);
      if (session?.stopTimer) {
        clearTimeout(session.stopTimer);
        session.stopTimer = undefined;
      }
      if (session) {
        session.lifecycleState = markSessionExited(session.lifecycleState ?? 'running');
        if (session.agentHubSessionId) {
          stopStateRegistry.record(
            session.agentHubSessionId,
            session.lifecycleState === 'timeout' ? 'timeout' : 'exited',
          );
          // The runner normally emits session-end itself. Daemon-owned stop
          // and crash paths must still converge the server projection when a
          // process exits before that final event reaches the server.
          void archiveServerSessionAfterProcessExit(session.agentHubSessionId, session);
        }
      }
      if (session?.agentHubSessionId && session.encryption) {
        sessionIdToFinishedSession.set(session.agentHubSessionId, session);
        logger.debug(`[DAEMON RUN] Process PID ${pid} exited, preserved session ${session.agentHubSessionId} for resume`);
      } else {
        logger.debug(`[DAEMON RUN] Removing exited process PID ${pid} from tracking`);
      }
      pidToTrackedSession.delete(pid);
    }

    function monitorExternalSessionExit(pid: number, trackedSession: TrackedSession): void {
      const deadline = Date.now() + SESSION_EXTERNAL_EXIT_POLL_TIMEOUT_MS;
      const poll = async () => {
        if (pidToTrackedSession.get(pid) !== trackedSession) return;

        const processState = await probeExternalProcessState(pid);
        if (pidToTrackedSession.get(pid) !== trackedSession) return;
        if (processState === 'exited') {
          onChildExited(pid);
          return;
        }

        if (Date.now() >= deadline) {
          logger.debug(`[DAEMON RUN] External session PID ${pid} still appears alive after exit polling window`);
          return;
        }

        const timer = setTimeout(() => void poll(), SESSION_EXTERNAL_EXIT_POLL_INTERVAL_MS);
        timer.unref?.();
      };

      void poll();
    }

    // Start control server
    const controlToken = randomBytes(32).toString('base64url');
    const { port: controlPort, stop: stopControlServer } = await startDaemonControlServer({
      controlToken,
      ownerNonce,
      getChildren: getCurrentChildren,
      stopSession,
      spawnSession,
      requestShutdown: () => requestShutdown('agenthub-cli'),
      onAgentHubSessionWebhook
    });

    // Write initial daemon state (no lock needed for state file)
    const fileState: DaemonLocallyPersistedState = {
      pid: process.pid,
      httpPort: controlPort,
      controlToken,
      ownerNonce,
      processIdentity,
      startTime: new Date().toLocaleString(),
      startedWithCliVersion: packageJson.version,
      daemonLogPath: logger.logFilePath
    };
    // Capture the bundled CLI's mtime at startup so the heartbeat can detect
    // when npm replaces `dist/index.mjs` on disk (= the user ran `npm i -g @artsum/agenthub`).
    // We previously compared disk `package.json.version` to our bundled version,
    // but that produced infinite restart loops (#1107) when the manifest version
    // diverged from the bundled version (e.g. `agenthub-coder@0.13.1` deprecation
    // stub bumped package.json without rebuilding dist). File mtime is a more
    // reliable signal: it only changes when the bundle is actually replaced.
    const bundleDirectory = join(projectPath(), 'dist');
    const bundlePath = join(bundleDirectory, 'index.mjs');
    const bundleBackupPath = join(configuration.agentHubHomeDir, 'daemon.bundle.previous');
    let initialBundleFingerprint: BundleFingerprint | null = null;
    let bundleBackupReady = false;
    try {
      initialBundleFingerprint = await readBundleTreeFingerprint(bundleDirectory);
      await writeBundleBackup(bundleDirectory, bundleBackupPath);
      bundleBackupReady = true;
    } catch (error) {
      // dist/index.mjs not present (e.g. dev mode via tsx) — skip upgrade detection.
      // Keep the concrete reason: a failed backup must not be silently
      // mistaken for an absent bundle, otherwise rollback becomes impossible.
      logger.warn(`[DAEMON RUN] Bundle snapshot unavailable; self-restart on upgrade disabled: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Publish daemon state only after the initial bundle snapshot completes.
    // Callers observing state readiness must never race a missing rollback
    // backup during the first heartbeat.
    writeDaemonState(fileState);
    logger.debug('[DAEMON RUN] Daemon state written');

    // Prepare initial daemon state
    let publishCliUpdateStatus: ((status: CliUpdateStatus) => Promise<void>) | undefined;
    const cliUpdateManager = new CliUpdateManager({
      currentVersion: packageJson.version,
      onStatus: async (status) => publishCliUpdateStatus?.(status),
    });
    const initialDaemonState: DaemonState = {
      status: 'offline',
      pid: process.pid,
      httpPort: controlPort,
      startedAt: Date.now(),
      startedWithCliVersion: packageJson.version,
      cliUpdate: cliUpdateManager.getStatus(),
    };

    // Create API client
    const api = await ApiClient.create(credentials);

    // Get or create machine
    const machine = await api.getOrCreateMachine({
      machineId,
      metadata: initialMachineMetadata,
      daemonState: initialDaemonState
    });
    logger.debug(`[DAEMON RUN] Machine registered: ${machine.id}`);

    // Create realtime machine session
    const apiMachine = api.machineSyncClient(machine);
    let cliUpdatePublishQueue = Promise.resolve();
    publishCliUpdateStatus = (status) => {
      cliUpdatePublishQueue = cliUpdatePublishQueue
        .then(() => apiMachine.updateDaemonState((state: DaemonState | null) => ({
          ...state,
          status: state?.status ?? 'running',
          cliUpdate: status,
        })))
        .catch((error) => {
          logger.debug('[DAEMON RUN] Failed to publish CLI update status', error);
        });
      return cliUpdatePublishQueue;
    };

    // Set RPC handlers
    apiMachine.setRPCHandlers({
      spawnSession,
      resumeSession,
      stopSession,
      requestShutdown: () => requestShutdown('agenthub-app'),
      checkCliUpdate: () => cliUpdateManager.check(),
      updateCli: (version) => cliUpdateManager.requestUpdate(version),
      rollbackCli: () => cliUpdateManager.requestRollback(),
    });

    // Connect to server
    apiMachine.connect();

    const updateCheckIntervalMs = Math.max(
      60_000,
      Number.parseInt(process.env.AGENTHUB_CLI_UPDATE_CHECK_INTERVAL_MS || String(6 * 60 * 60_000), 10) || 6 * 60 * 60_000,
    );
    const initialUpdateCheck = setTimeout(() => {
      void cliUpdateManager.check();
    }, 1_500);
    initialUpdateCheck.unref?.();
    const updateCheckInterval = setInterval(() => {
      void cliUpdateManager.check();
    }, updateCheckIntervalMs);
    updateCheckInterval.unref?.();

    // Every 60 seconds:
    // 1. Prune stale sessions
    // 2. Check if daemon needs update
    // 3. If outdated, restart with latest version
    // 4. Write heartbeat
    const heartbeatIntervalMs = parseInt(process.env.AGENTHUB_DAEMON_HEARTBEAT_INTERVAL || '60000');
    let heartbeatRunning = false
    const restartOnStaleVersionAndHeartbeat = setInterval(async () => {
      if (heartbeatRunning) {
        return;
      }
      heartbeatRunning = true;

      if (process.env.DEBUG) {
        logger.debug(`[DAEMON RUN] Health check started at ${new Date().toLocaleString()}`);
      }

      // Prune stale sessions
      for (const [pid, _] of pidToTrackedSession.entries()) {
        try {
          // Check if process is still alive (signal 0 doesn't kill, just checks)
          process.kill(pid, 0);
        } catch (error) {
          // Process is dead, remove from tracking
          logger.debug(`[DAEMON RUN] Removing stale session with PID ${pid} (process no longer exists)`);
          pidToTrackedSession.delete(pid);
        }
      }

      // Check if daemon needs update by detecting whether `dist/index.mjs` was
      // replaced on disk since the daemon started (npm install rewrites the file).
      // Skip if we never captured an initial mtime (dev mode).
      let bundleReplaced = false;
      if (initialBundleFingerprint && !cliUpdateManager.isUpdating()) {
        try {
          const currentFingerprint = await readBundleTreeFingerprint(bundleDirectory);
          bundleReplaced = currentFingerprint.sha256 !== initialBundleFingerprint.sha256;
        } catch (error) {
          const errorCode = typeof error === 'object' && error !== null && 'code' in error
            ? String((error as { code?: unknown }).code)
            : undefined;
          if (errorCode === 'ENOENT') {
            // A missing entrypoint can be a mid-install window, but a missing
            // dependent chunk while the entrypoint still exists is an invalid
            // replacement and must go through readiness validation/rollback.
            const entrypointStillPresent = await fs.access(bundlePath).then(() => true).catch(() => false);
            if (entrypointStillPresent) {
              bundleReplaced = true;
              logger.warn('[DAEMON RUN] Bundle dependency missing; treating replacement as invalid');
            } else {
              logger.debug('[DAEMON RUN] Bundle entrypoint temporarily missing; retrying on next heartbeat');
            }
          } else {
            // Symlinks and unsupported entries are unsafe candidates. Route
            // them through the normal readiness rejection and rollback path.
            bundleReplaced = true;
            logger.warn(`[DAEMON RUN] Bundle inspection failed; treating replacement as invalid: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
      if (bundleReplaced && !cliUpdateManager.isUpdating()) {
        const validation = await validateBundleCandidate(bundlePath);
        if (!validation.ok) {
          logger.warn(`[DAEMON RUN] Rejected invalid bundle replacement: ${validation.reason}`);
          if (bundleBackupReady) {
            try {
              await restoreBundleBackup(bundleBackupPath, bundleDirectory);
              initialBundleFingerprint = await readBundleTreeFingerprint(bundleDirectory);
              logger.warn('[DAEMON RUN] Restored previous daemon bundle; keeping current process alive');
            } catch (error) {
              logger.warn('[DAEMON RUN] Failed to restore previous daemon bundle:', error);
            }
          }
          heartbeatRunning = false;
          return;
        }

        const restartMode = getDaemonBundleReplacementRestartMode(process.env);
        logger.debug(`[DAEMON RUN] Daemon bundle replaced on disk, restartMode=${restartMode}`);

        clearInterval(restartOnStaleVersionAndHeartbeat);

        // Release ownership BEFORE replacement. Otherwise a replacement daemon
        // sees our still-present daemon.state.json and exits as already running.
        apiMachine.shutdown();
        await stopControlServer();
        await cleanupDaemonState(ownerNonce);
        await releaseDaemonLock(daemonLockHandle);
        await stopCaffeinate();

        if (restartMode === 'systemd') {
          logger.debug('[DAEMON RUN] Exiting with failure so systemd restarts the updated daemon');
          process.exit(1);
        } else {
          try {
            spawnAgentHubCLI(['daemon', 'start'], {
              detached: true,
              stdio: 'ignore'
            });
          } catch (error) {
            logger.debug('[DAEMON RUN] Failed to spawn new daemon, this is quite likely to happen during integration tests as we are cleaning out dist/ directory', error);
          }

          process.exit(0);
        }
      }

      // The daemon holds the exclusive lock for its lifetime. The random owner
      // nonce is the authoritative signal that another writer replaced our state;
      // persisted process-identity fields may normalize differently on Windows.
      const daemonState = await readDaemonState();
      if (hasDaemonStateOwnerChanged(daemonState, ownerNonce)) {
        logger.debug('[DAEMON RUN] Daemon state ownership changed while this process held the lock; shutting down.')
        requestShutdown('exception', 'Daemon state ownership changed while this process held the lock.')
      }

      // Heartbeat
      try {
        const updatedState: DaemonLocallyPersistedState = {
          pid: process.pid,
          httpPort: controlPort,
          controlToken,
          ownerNonce,
          processIdentity,
          startTime: fileState.startTime,
          startedWithCliVersion: packageJson.version,
          lastHeartbeat: new Date().toLocaleString(),
          daemonLogPath: fileState.daemonLogPath
        };
        writeDaemonState(updatedState);
        if (process.env.DEBUG) {
          logger.debug(`[DAEMON RUN] Health check completed at ${updatedState.lastHeartbeat}`);
        }
      } catch (error) {
        logger.debug('[DAEMON RUN] Failed to write heartbeat', error);
      }

      heartbeatRunning = false;
    }, heartbeatIntervalMs); // Every 60 seconds in production

    // Setup signal handlers
    const cleanupAndShutdown = async (source: 'agenthub-app' | 'agenthub-cli' | 'os-signal' | 'exception', errorMessage?: string) => {
      logger.debug(`[DAEMON RUN] Starting proper cleanup (source: ${source}, errorMessage: ${errorMessage})...`);

      // Clear health check interval
      if (restartOnStaleVersionAndHeartbeat) {
        clearInterval(restartOnStaleVersionAndHeartbeat);
        logger.debug('[DAEMON RUN] Health check interval cleared');
      }
      clearTimeout(initialUpdateCheck);
      clearInterval(updateCheckInterval);

      await runDaemonCleanup({
        updateDaemonState: async () => {
          await apiMachine.updateDaemonState((state: DaemonState | null) => ({
            ...state,
            status: 'shutting-down',
            shutdownRequestedAt: Date.now(),
            shutdownSource: source,
          }));
        },
        waitForMetadata: async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
        },
        shutdownApiMachine: () => apiMachine.shutdown(),
        stopControlServer,
        cleanupDaemonState: () => cleanupDaemonState(ownerNonce),
        stopCaffeinate,
        releaseDaemonLock: () => releaseDaemonLock(daemonLockHandle),
        cancelWatchdog: () => shutdownWatchdog.cancel(),
        onError: (phase, error) => {
          logger.debug(`[DAEMON RUN] Cleanup step failed (${phase})`, error);
        },
      });

      logger.debug('[DAEMON RUN] Cleanup completed, exiting process');
      process.exit(0);
    };

    logger.debug('[DAEMON RUN] Daemon started successfully, waiting for shutdown request');

    // Wait for shutdown request
    const shutdownRequest = await resolvesWhenShutdownRequested;
    await cleanupAndShutdown(shutdownRequest.source, shutdownRequest.errorMessage);
  } catch (error) {
    logger.debug('[DAEMON RUN][FATAL] Failed somewhere unexpectedly - exiting with code 1', error);
    process.exit(1);
  }
}
