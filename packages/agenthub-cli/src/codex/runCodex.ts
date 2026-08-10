import { render } from "ink";
import React from "react";
import { ApiClient } from '@/api/api';
import { CodexAppServerClient } from './codexAppServerClient';
import { CodexPermissionHandler } from './utils/permissionHandler';
import { ReasoningProcessor } from './utils/reasoningProcessor';
import { DiffProcessor } from './utils/diffProcessor';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { logger } from '@/ui/logger';
import { Credentials, readSettings } from '@/persistence';
import { initialMachineMetadata } from '@/daemon/run';
import { configuration } from '@/configuration';
import packageJson from '../../package.json';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { hashObject } from '@/utils/deterministicJson';
import { projectPath } from '@/projectPath';
import { join } from 'node:path';
import { createSessionMetadata } from '@/utils/createSessionMetadata';
import { startAgentHubServer } from '@/claude/utils/startAgentHubServer';
import { MessageBuffer } from "@/ui/ink/messageBuffer";
import { CodexDisplay } from "@/ui/ink/CodexDisplay";
import { trimIdent } from "@/utils/trimIdent";
import { CHANGE_TITLE_INSTRUCTION } from '@/codex/constants';
import { notifyDaemonSessionStarted } from "@/daemon/controlClient";
import { encodeBase64, decodeBase64 } from '@/api/encryption';
import type { Session as ApiSession } from '@/api/types';
import { registerKillSessionHandler } from "@/claude/registerKillSessionHandler";
import { connectionState } from '@/utils/serverConnectionErrors';
import { setupOfflineReconnection } from '@/utils/setupOfflineReconnection';
import type { ApiSessionClient } from '@/api/apiSession';
import { resolveCodexExecutionPolicy } from './executionPolicy';
import {
    closeCodexTurnWithStatus,
    mapCodexMcpMessageToSessionEnvelopes,
    mapCodexProcessorMessageToSessionEnvelopes,
} from './utils/sessionProtocolMapper';
import { resumeExistingThread } from './resumeExistingThread';
import { createOfficialCodexThreadSync } from './officialThreadSync';
import { emitReadyIfIdle } from './emitReadyIfIdle';
import { discoverCodexSkillCommands } from './codexSkills';
import {
    codexGoalActionCapabilities,
    mapCodexGoalEventToAgentGoalStatus,
    parseCodexGoalActionParams,
    parseCodexGoalCommand,
    type CodexGoalCommand,
} from './codexGoalStatus';
import { routeCodexUserMessage } from './routeCodexUserMessage';
import { createRunnerShutdownCoordinator, type RunnerShutdownCoordinator } from '@/sessionProtocol/RunnerShutdownCoordinator';
import { registerRunnerFatalHandlers, registerRunnerSignalHandlers } from '@/sessionProtocol/processSignalHandlers';
import { createEnvelope, type SessionEnvelope } from '@artsum/agenthub-wire';
import { enqueueCodexUserText, isCodexClearText } from './codexClearCommand';
import { prepareCodexInlineImageInputs, type InlineImage } from './utils/imageInput';

export function buildCodexTurnPrompt(opts: {
    message: string;
    appendSystemPrompt?: string;
    includeAppendSystemPrompt: boolean;
    includeTitleInstruction: boolean;
}): string {
    const parts: string[] = [];
    if (opts.includeAppendSystemPrompt && opts.appendSystemPrompt) {
        parts.push(opts.appendSystemPrompt);
    }
    parts.push(opts.message);
    if (opts.includeTitleInstruction) {
        parts.push(CHANGE_TITLE_INSTRUCTION);
    }
    return parts.join('\n\n');
}

export function buildCodexMessageModeHash(mode: {
    permissionMode: import('@/api/types').PermissionMode;
    model?: string;
    effort?: string;
    clientUserMessageId?: string;
    appendSystemPrompt?: string;
    images?: InlineImage[];
}): string {
    return hashObject({
        permissionMode: mode.permissionMode,
        model: mode.model,
        effort: mode.effort,
        clientUserMessageId: mode.clientUserMessageId,
        appendSystemPrompt: mode.appendSystemPrompt,
        images: mode.images?.map((image) => ({
            mimeType: image.mimeType,
            length: image.data.length,
            prefix: image.data.slice(0, 24),
        })),
    });
}

export function shouldTerminateCodexSessionAfterError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /stdin not writable|Codex process exited|Codex process disconnected|write EPIPE/i.test(message);
}

/**
 * Extracts a human-readable error from a codex task_complete/turn_aborted event.
 * Returns null if the event represents a successful/clean completion.
 */
function describeCodexFailure(msg: any): string | null {
    const hasFailure = msg?.status === 'failed' || (msg?.error !== undefined && msg?.error !== null);
    if (!hasFailure) return null;
    const err = msg.error;
    if (typeof err === 'string' && err.length > 0) return err;
    if (err && typeof err === 'object' && typeof err.message === 'string' && err.message.length > 0) {
        return err.message;
    }
    return 'Unknown error';
}

/**
 * Main entry point for the codex command with ink UI
 */
export async function runCodex(opts: {
    credentials: Credentials;
    startedBy?: 'daemon' | 'terminal';
    noSandbox?: boolean;
    resumeThreadId?: string;
    initialPermissionMode?: import('@/api/types').PermissionMode;
    initialModel?: string;
}): Promise<void> {
    // Early check: ensure Codex CLI is installed before proceeding
    try {
        execSync('codex --version', { encoding: 'utf8', stdio: 'pipe', windowsHide: true });
    } catch {
        console.error('\n\x1b[1m\x1b[33mCodex CLI is not installed\x1b[0m\n');
        console.error('Please install Codex CLI using one of these methods:\n');
        console.error('\x1b[1mOption 1 - npm (recommended):\x1b[0m');
        console.error('  \x1b[36mnpm install -g @openai/codex\x1b[0m\n');
        console.error('\x1b[1mOption 2 - Homebrew (macOS):\x1b[0m');
        console.error('  \x1b[36mbrew install --cask codex\x1b[0m\n');
        console.error('Alternatively, use Claude Code:');
        console.error('  \x1b[36magenthub claude\x1b[0m\n');
        process.exit(1);
    }

    // Use shared PermissionMode type for cross-agent compatibility
    type PermissionMode = import('@/api/types').PermissionMode;
    interface EnhancedMode {
        permissionMode: PermissionMode;
        model?: string;
        effort?: string;
        clientUserMessageId?: string;
        appendSystemPrompt?: string;
        images?: InlineImage[];
    }

    //
    // Define session
    //

    const sessionTag = randomUUID();

    // Set backend for offline warnings (before any API calls)
    connectionState.setBackend('Codex');

    const api = await ApiClient.create(opts.credentials);

    // Log startup options
    logger.debug(`[codex] Starting with options: startedBy=${opts.startedBy || 'terminal'}, initialPermissionMode=${opts.initialPermissionMode ?? 'default'}, initialModel=${opts.initialModel ?? 'default'}`);

    //
    // Machine
    //

    const settings = await readSettings();
    let machineId = settings?.machineId;
    const sandboxConfig = opts.noSandbox ? undefined : settings?.sandboxConfig;
    if (!machineId) {
        console.error(`[START] No machine ID found in settings, which is unexpected since authAndSetupMachineIfNeeded should have created it. Please report this issue at https://agenthub.yzsd.asia/support`);
        process.exit(1);
    }
    logger.debug(`Using machineId: ${machineId}`);
    await api.getOrCreateMachine({
        machineId,
        metadata: initialMachineMetadata
    });

    //
    // Create session
    //

    const forkedFromSessionId = process.env.AGENTHUB_FORKED_FROM_SESSION_ID;
    const forkedFromMessageId = process.env.AGENTHUB_FORKED_FROM_MESSAGE_ID;
    const isSideChat = process.env.AGENTHUB_SIDE_CHAT === '1';

    const { state, metadata } = createSessionMetadata({
        flavor: 'codex',
        machineId,
        startedBy: opts.startedBy,
        sandbox: sandboxConfig,
        ...(forkedFromSessionId ? { parentSessionId: forkedFromSessionId } : {}),
        ...(forkedFromMessageId ? { forkedFromMessageId } : {}),
        ...(isSideChat ? { isSideChat: true } : {}),
    });
    const skillCommands = await discoverCodexSkillCommands();
    if (skillCommands.length > 0) {
        metadata.skills = skillCommands;
        metadata.slashCommands = Array.from(new Set([...(metadata.slashCommands ?? []), ...skillCommands]));
    }

    // Check for session reconnection env vars (set by daemon for resume-in-place)
    const reconnectSessionId = process.env.AGENTHUB_RECONNECT_SESSION_ID;
    const reconnectKeyBase64 = process.env.AGENTHUB_RECONNECT_ENCRYPTION_KEY;
    const reconnectVariant = process.env.AGENTHUB_RECONNECT_ENCRYPTION_VARIANT as 'legacy' | 'dataKey' | undefined;
    const reconnectSeq = process.env.AGENTHUB_RECONNECT_SEQ;
    const reconnectMetadataVersion = process.env.AGENTHUB_RECONNECT_METADATA_VERSION;
    const reconnectAgentStateVersion = process.env.AGENTHUB_RECONNECT_AGENT_STATE_VERSION;
    let pendingMirrorCodexThreadId = process.env.AGENTHUB_MIRROR_CODEX_THREAD_ID || null;

    let response: ApiSession | null;
    if (reconnectSessionId && reconnectKeyBase64 && reconnectVariant) {
        logger.debug(`[START] Reconnecting to existing session ${reconnectSessionId}`);
        response = {
            id: reconnectSessionId,
            seq: parseInt(reconnectSeq || '0', 10),
            encryptionKey: decodeBase64(reconnectKeyBase64),
            encryptionVariant: reconnectVariant,
            metadata,
            metadataVersion: parseInt(reconnectMetadataVersion || '0', 10),
            agentState: state,
            agentStateVersion: parseInt(reconnectAgentStateVersion || '0', 10),
        };
    } else {
        response = await api.getOrCreateSession({ tag: sessionTag, metadata, state });
    }

    // Handle server unreachable case - create offline stub with hot reconnection
    let session: ApiSessionClient;
    // Permission handler declared here so it can be updated in onSessionSwap callback
    // (assigned later at line ~385 after client setup)
    let permissionHandler: CodexPermissionHandler | undefined;
    let client!: CodexAppServerClient;
    let reasoningProcessor!: ReasoningProcessor;
    let diffProcessor: DiffProcessor | undefined;
    let agenthubServer: Awaited<ReturnType<typeof startAgentHubServer>> | null = null;
    let abortInProgress: Promise<void> | null = null;
    const { session: initialSession, reconnectionHandle } = setupOfflineReconnection({
        api,
        sessionTag,
        metadata,
        state,
        response,
        onSessionSwap: (newSession) => {
            session = newSession;
            // Update permission handler with new session to avoid stale reference
            permissionHandler?.updateSession(newSession);
        }
    });
    session = initialSession;

    // On reconnect, un-archive the session and skip replaying old messages.
    if (reconnectSessionId) {
        session.suppressNextArchiveSignal();
        session.skipExistingMessages();
        session.updateMetadata((meta) => ({
            ...meta,
            lifecycleState: 'running',
            archivedBy: undefined,
        }));
    }

    // Always report to daemon if it exists (skip if offline)
    if (response) {
        try {
            logger.debug(`[START] Reporting session ${response.id} to daemon`);
            const result = await notifyDaemonSessionStarted(response.id, metadata, {
                encryptionKey: encodeBase64(response.encryptionKey),
                encryptionVariant: response.encryptionVariant,
                seq: response.seq,
                metadataVersion: response.metadataVersion,
                agentStateVersion: response.agentStateVersion,
            });
            if (result.error) {
                logger.debug(`[START] Failed to report to daemon (may not be running):`, result.error);
            } else {
                logger.debug(`[START] Reported session ${response.id} to daemon`);
            }
        } catch (error) {
            logger.debug('[START] Failed to report to daemon (may not be running):', error);
        }
    }

    const messageQueue = new MessageQueue2<EnhancedMode>(buildCodexMessageModeHash);

    // Track current overrides to apply per message
    // Use shared PermissionMode type from api/types for cross-agent compatibility
    let currentPermissionMode: import('@/api/types').PermissionMode | undefined = opts.initialPermissionMode;
    let currentModel: string | undefined = opts.initialModel;
    let currentEffort: string | undefined;
    let currentAppendSystemPrompt: string | undefined;

    // Valid Codex permission modes from remote messages. Matches the modes
    // the mobile UI exposes for Codex sessions (see modelModeOptions.ts:
    // getCodexPermissionModes). Anything outside this set is silently ignored — the
    // previous code blindly cast `message.meta.permissionMode as PermissionMode`
    // at runtime, meaning a crafted value like `'totally_unsafe'` would be
    // accepted and then fall through to the `default` branch in
    // resolveCodexExecutionPolicy() — or worse, an attacker-chosen valid value
    // could escalate sandbox scope (issue #1092).
    const VALID_REMOTE_PERMISSION_MODES: readonly PermissionMode[] = [
        'default',
        'read-only',
        'safe-yolo',
        'yolo',
    ];

    const seenCodexEnvelopeIds = new Set<string>();
    const observedCodexEnvelopes = new Map<string, SessionEnvelope>();
    let officialThreadSync: ReturnType<typeof createOfficialCodexThreadSync> | null = null;
    let officialThreadSyncInterval: NodeJS.Timeout | null = null;
    const rememberCodexEnvelope = (envelope: SessionEnvelope) => {
        if (observedCodexEnvelopes.has(envelope.id)) {
            return;
        }
        seenCodexEnvelopeIds.add(envelope.id);
        observedCodexEnvelopes.set(envelope.id, envelope);
        officialThreadSync?.rememberEnvelope(envelope);
    };

    session.onUserMessage((message) => {
        const isClearCommand = isCodexClearText(message.content.text);
        if (!isClearCommand) {
            session.recordLastUserMessageTitle(message);
            rememberCodexEnvelope(createEnvelope('user', {
                t: 'text',
                text: message.content.text,
            }, {
                id: message.localKey,
            }));
        }

        // Resolve permission mode (validate against Codex-native modes)
        let messagePermissionMode = currentPermissionMode;
        if (message.meta?.permissionMode) {
            const incoming = message.meta.permissionMode as PermissionMode;
            if (VALID_REMOTE_PERMISSION_MODES.includes(incoming)) {
                messagePermissionMode = incoming;
                currentPermissionMode = messagePermissionMode;
                logger.debug(`[Codex] Permission mode updated from user message to: ${currentPermissionMode}`);
            } else {
                logger.debug(`[Codex] Ignoring invalid permission mode from user message: ${String(message.meta.permissionMode)}`);
            }
        } else {
            logger.debug(`[Codex] User message received with no permission mode override, using current: ${currentPermissionMode ?? 'default (effective)'}`);
        }

        // Resolve model; explicit null resets to default (undefined)
        let messageModel = currentModel;
        if (message.meta?.hasOwnProperty('model')) {
            messageModel = message.meta.model || undefined;
            currentModel = messageModel;
            logger.debug(`[Codex] Model updated from user message: ${messageModel || 'reset to default'}`);
        } else {
            logger.debug(`[Codex] User message received with no model override, using current: ${currentModel || 'default'}`);
        }

        let messageEffort = currentEffort;
        if (message.meta?.hasOwnProperty('effort')) {
            messageEffort = message.meta.effort || undefined;
            currentEffort = messageEffort;
            logger.debug(`[Codex] Reasoning effort updated from user message: ${messageEffort || 'reset to default'}`);
        }

        let messageAppendSystemPrompt = currentAppendSystemPrompt;
        if (message.meta?.hasOwnProperty('appendSystemPrompt')) {
            messageAppendSystemPrompt = message.meta.appendSystemPrompt || undefined;
            currentAppendSystemPrompt = messageAppendSystemPrompt;
        }

        const enhancedMode: EnhancedMode = {
            permissionMode: messagePermissionMode || 'default',
            model: messageModel,
            effort: messageEffort,
            clientUserMessageId: message.localKey,
            appendSystemPrompt: messageAppendSystemPrompt,
            images: message.meta?.images,
        };
        if (isClearCommand) {
            enqueueCodexUserText({
                text: message.content.text,
                mode: enhancedMode,
                queue: messageQueue,
            });
            void handleAbort();
            return;
        }
        if (!client) {
            messageQueue.push(message.content.text, enhancedMode);
            return;
        }

        void routeCodexUserMessage({
            client,
            queue: messageQueue,
            text: message.content.text,
            mode: enhancedMode,
            clientUserMessageId: message.localKey,
            forceQueue: Boolean(enhancedMode.images?.length),
        }).catch((error) => {
            logger.debug('[Codex] Failed to route user message through active turn steering; queueing as next turn', error);
            messageQueue.push(message.content.text, enhancedMode);
        });
    });
    let thinking = false;
    let currentTurnId: string | null = null;
    let codexFinalAnswerMessageId: string | null = null;
    let codexStartedSubagents = new Set<string>();
    let codexActiveSubagents = new Set<string>();
    let codexProviderSubagentToSessionSubagent = new Map<string, string>();
    session.keepAlive(thinking, 'remote');
    // Periodic keep-alive; store handle so we can clear on exit
    const keepAliveInterval = setInterval(() => {
        session.keepAlive(thinking, 'remote');
    }, 2000);
    const sendCodexSessionProtocolMessage = (envelope: Parameters<ApiSessionClient['sendSessionProtocolMessage']>[0]) => {
        rememberCodexEnvelope(envelope);
        session.sendSessionProtocolMessage(envelope);
    };

    const sendReady = () => {
        session.sendSessionEvent({ type: 'ready' });
        try {
            api.push().sendSessionNotification({
                kind: 'done',
                metadata: session.getMetadata(),
                data: {
                    sessionId: session.sessionId,
                    type: 'ready',
                    provider: 'codex',
                }
            });
        } catch (pushError) {
            logger.debug('[Codex] Failed to send ready push', pushError);
        }
    };

    // Debug helper: log active handles/requests if DEBUG is enabled
    function logActiveHandles(tag: string) {
        if (!process.env.DEBUG) return;
        const anyProc: any = process as any;
        const handles = typeof anyProc._getActiveHandles === 'function' ? anyProc._getActiveHandles() : [];
        const requests = typeof anyProc._getActiveRequests === 'function' ? anyProc._getActiveRequests() : [];
        logger.debug(`[codex][handles] ${tag}: handles=${handles.length} requests=${requests.length}`);
        try {
            const kinds = handles.map((h: any) => (h && h.constructor ? h.constructor.name : typeof h));
            logger.debug(`[codex][handles] kinds=${JSON.stringify(kinds)}`);
        } catch {
            // Best effort debug inspection; failure to enumerate handles must not affect the session.
        }
    }

    //
    // Abort handling
    // IMPORTANT: There are two different operations:
    // 1. Abort (handleAbort): Stops the current inference/task but keeps the session alive
    //    - Used by the 'abort' RPC from mobile app
    //    - Similar to Claude Code's abort behavior
    //    - Allows continuing with new prompts after aborting
    // 2. Kill (handleKillSession): Terminates the entire process
    //    - Used by the 'killSession' RPC
    //    - Completely exits the CLI process
    //

    // AbortController is used ONLY to wake messageQueue.waitForMessages when idle.
    // Turn cancellation uses client.interruptTurn() — no AbortController hack needed.
    let abortController = new AbortController();
    let shouldExit = false;

    const closeActiveCodexTurn = (status: 'completed' | 'failed' | 'cancelled' = 'cancelled') => {
        if (!currentTurnId) {
            if (thinking) {
                thinking = false;
                session.keepAlive(false, 'remote');
            }
            return;
        }

        const mapped = closeCodexTurnWithStatus({
            currentTurnId,
            finalAnswerMessageId: codexFinalAnswerMessageId,
            startedSubagents: codexStartedSubagents,
            activeSubagents: codexActiveSubagents,
            providerSubagentToSessionSubagent: codexProviderSubagentToSessionSubagent,
        }, status);
        currentTurnId = mapped.currentTurnId;
        codexFinalAnswerMessageId = mapped.finalAnswerMessageId ?? null;
        codexStartedSubagents = mapped.startedSubagents;
        codexActiveSubagents = mapped.activeSubagents;
        codexProviderSubagentToSessionSubagent = mapped.providerSubagentToSessionSubagent;
        for (const envelope of mapped.envelopes) {
            sendCodexSessionProtocolMessage(envelope);
        }
        if (thinking) {
            thinking = false;
            session.keepAlive(false, 'remote');
        }
    };

    let shutdownCoordinator: RunnerShutdownCoordinator | null = null;
    let disposeRunnerProcessHandlers = () => {};
    const closeSessionAndBackend = async (
        archiveReason: string,
        turnStatus: 'completed' | 'failed' | 'cancelled' = 'cancelled',
    ) => {
        shutdownCoordinator ??= createRunnerShutdownCoordinator({
            stopAcceptingTurns: () => {
                shouldExit = true;
                messageQueue.close();
                abortController.abort();
            },
            abortBackend: (request) => request.reason === 'Session ended' ? undefined : handleAbort(),
            closeActiveTurn: closeActiveCodexTurn,
            publishThinkingFalse: () => {
                if (thinking) {
                    thinking = false;
                    session.keepAlive(false, 'remote');
                }
            },
            markArchived: ({ reason }) => {
                session.updateMetadata((currentMetadata) => ({
                    ...currentMetadata,
                    lifecycleState: 'archived',
                    lifecycleStateSince: Date.now(),
                    archivedBy: 'cli',
                    archiveReason: reason,
                }));
            },
            sendSessionDeath: () => session.sendSessionDeath(),
            flush: () => session.flush(),
            closeSession: () => session.close(),
            cleanupLocalResources: async () => {
                disposeRunnerProcessHandlers();
                try { permissionHandler?.reset(); } catch (error) { logger.debug('[Codex] permission cleanup failed', error); }
                try { reasoningProcessor?.abort(); } catch (error) { logger.debug('[Codex] reasoning cleanup failed', error); }
                try { diffProcessor?.reset(); } catch (error) { logger.debug('[Codex] diff cleanup failed', error); }
                try { await client.disconnect(); } catch (error) { logger.debug('[Codex] client disconnect failed', error); }
                try { agenthubServer?.stop(); } catch (error) { logger.debug('[Codex] MCP cleanup failed', error); }
            },
        });
        await shutdownCoordinator.shutdown({ reason: archiveReason, turnStatus });
    };

    const requestProcessShutdown = async (
        archiveReason: string,
        exitCode = 0,
        turnStatus: 'completed' | 'failed' | 'cancelled' = 'cancelled',
    ) => {
        logger.debug(`[Codex] Process shutdown requested: ${archiveReason}`);
        shouldExit = true;
        messageQueue.close();
        abortController.abort();
        try {
            await closeSessionAndBackend(archiveReason, turnStatus);
        } catch (error) {
            logger.debug('[Codex] Shutdown cleanup failed:', error);
        } finally {
            process.exit(exitCode);
        }
    };

    /**
     * Handles aborting the current task/inference without exiting the process.
     * This is the equivalent of Claude Code's abort - it stops what's currently
     * happening but keeps the session alive for new prompts.
     */
    async function handleAbort() {
        if (abortInProgress) {
            await abortInProgress;
            return;
        }

        logger.debug('[Codex] Abort requested - stopping current task');
        abortInProgress = (async () => {
            try {
                // Resolve any pending permission requests as 'abort' first.
                permissionHandler?.abortAll();

                // Request interruption, then force-restart Codex app-server if
                // it doesn't settle quickly (long-running shell commands).
                if (client) {
                    const abortResult = await client.abortTurnWithFallback({
                        gracePeriodMs: 3000,
                        forceRestartOnTimeout: true,
                    });
                    if (abortResult.forcedRestart) {
                        logger.warn('[Codex] Forced app-server restart after interrupt timeout');
                        session.sendSessionEvent({
                            type: 'message',
                            message: abortResult.resumedThread
                                ? 'Force-stopped active task after interrupt timeout. Codex backend was restarted and the previous thread was resumed.'
                                : 'Force-stopped active task after interrupt timeout. Codex backend was restarted, but the previous thread could not be resumed.',
                        });
                    }
                }

                reasoningProcessor.abort();
                logger.debug('[Codex] Abort completed - session remains active');
            } catch (error) {
                logger.debug('[Codex] Error during abort:', error);
            } finally {
                // Wake up message queue wait if idle
                abortController.abort();
                abortController = new AbortController();
            }
        })();

        await abortInProgress;
        abortInProgress = null;
    }

    /**
     * Handles session termination and process exit.
     * This is called when the session needs to be completely killed (not just aborted).
     * Abort stops the current inference but keeps the session alive.
     * Kill terminates the entire process.
     */
    const handleKillSession = async () => {
        logger.debug('[Codex] Kill session requested - terminating process');
        await requestProcessShutdown('User terminated', 0);
    };

    // Register abort handler
    session.rpcHandlerManager.registerHandler('abort', handleAbort);

    registerKillSessionHandler(session.rpcHandlerManager, handleKillSession);

    session.on('archived', () => {
        void requestProcessShutdown('Archive requested remotely', 0);
    });

    const disposeSignalHandlers = registerRunnerSignalHandlers({
        onSigterm: () => requestProcessShutdown('Received SIGTERM', 0),
        onSigint: () => requestProcessShutdown('Received SIGINT', 0),
    });
    const disposeFatalHandlers = registerRunnerFatalHandlers({
        onUncaughtException: (error) => {
            logger.debug('[Codex] Uncaught exception:', error);
            return requestProcessShutdown('Codex runner uncaught exception', 1, 'failed');
        },
        onUnhandledRejection: (reason) => {
            logger.debug('[Codex] Unhandled rejection:', reason);
            return requestProcessShutdown('Codex runner unhandled rejection', 1, 'failed');
        },
    });
    disposeRunnerProcessHandlers = () => {
        disposeSignalHandlers();
        disposeFatalHandlers();
    };

    //
    // Initialize Ink UI
    //

    const messageBuffer = new MessageBuffer();
    const hasTTY = process.stdout.isTTY && process.stdin.isTTY;
    let inkInstance: any = null;

    if (hasTTY) {
        console.clear();
        inkInstance = render(React.createElement(CodexDisplay, {
            messageBuffer,
            logPath: process.env.DEBUG ? logger.getLogPath() : undefined,
            onExit: async () => {
                // Exit the agent
                logger.debug('[codex]: Exiting agent via Ctrl-C');
                shouldExit = true;
                await handleAbort();
            }
        }), {
            exitOnCtrlC: false,
            patchConsole: false
        });
    }

    if (hasTTY) {
        process.stdin.resume();
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }
        process.stdin.setEncoding("utf8");
    }

    //
    // Start Context 
    //

    client = new CodexAppServerClient(sandboxConfig);
    client.setFatalErrorHandler((error) => {
        if (shouldExit) {
            return;
        }
        logger.warn('[Codex] app-server process failed:', error);
        void requestProcessShutdown('Codex app-server exited unexpectedly', 1, 'failed').catch((shutdownError) => {
            logger.debug('[Codex] Failed to archive after app-server failure:', shutdownError);
        });
    });

    permissionHandler = new CodexPermissionHandler(session, {
        provider: 'codex',
        notifyPermissionRequest: ({ toolCallId, toolName, provider }) => {
            api.push().sendSessionNotification({
                kind: 'permission',
                metadata: session.getMetadata(),
                data: {
                    sessionId: session.sessionId,
                    requestId: toolCallId,
                    tool: toolName,
                    type: 'permission_request',
                    provider,
                },
            });
        },
    });
    // Clear approvals orphaned by an earlier runner before accepting turns.
    permissionHandler.reset('Previous CLI process exited before responding');
    reasoningProcessor = new ReasoningProcessor((message) => {
        const envelopes = mapCodexProcessorMessageToSessionEnvelopes(message, { currentTurnId });
        for (const envelope of envelopes) {
            sendCodexSessionProtocolMessage(envelope);
        }
    });
    diffProcessor = new DiffProcessor((message) => {
        const envelopes = mapCodexProcessorMessageToSessionEnvelopes(message, { currentTurnId });
        for (const envelope of envelopes) {
            sendCodexSessionProtocolMessage(envelope);
        }
    });
    const updateCodexGoalState = (message: Record<string, unknown>) => {
        const capabilities = codexGoalActionCapabilities(client.supportsGoalActions());
        const goalStatus = mapCodexGoalEventToAgentGoalStatus(
            message,
            client.threadId,
            capabilities ? { capabilities } : undefined,
        );
        if (!goalStatus) {
            return;
        }
        session.updateAgentState((currentState) => ({
            ...currentState,
            agentGoalStatus: goalStatus,
        }));
    };
    const handleCodexGoalCommand = async (
        command: CodexGoalCommand,
        threadId: string,
    ): Promise<boolean> => {
        try {
            if (command.type === 'clear') {
                const result = await client.clearGoal({ threadId });
                if (result.cleared !== false) {
                    updateCodexGoalState({
                        type: 'thread_goal_cleared',
                        threadId,
                    });
                }
                messageBuffer.addMessage('Goal cleared', 'status');
                return true;
            }

            const result = await client.setGoal({
                threadId,
                objective: command.objective,
            });
            updateCodexGoalState({
                type: 'thread_goal_updated',
                threadId,
                goal: result.goal,
            });
            messageBuffer.addMessage('Goal updated', 'status');
            return true;
        } catch (error) {
            logger.debug('[Codex] Goal command API failed; falling back to normal turn:', error);
            return false;
        }
    };
    session.rpcHandlerManager.registerHandler('goal-action', async (params: unknown) => {
        const actionParams = params && typeof params === 'object' && !Array.isArray(params)
            ? params as Record<string, unknown>
            : null;
        const command = actionParams ? parseCodexGoalActionParams(actionParams) : null;
        if (!command) {
            throw new Error('Unsupported Codex goal action');
        }

        const threadId = client.threadId;
        if (!threadId) {
            throw new Error('No active Codex thread');
        }

        const handled = await handleCodexGoalCommand(command, threadId);
        if (!handled) {
            throw new Error('Codex goal actions are not supported by this runtime');
        }

        return { ok: true };
    });

    // Approval handler: routes server → client approval requests to our permission handler
    client.setApprovalHandler(async (params) => {
        const toolName = params.type === 'exec'
            ? 'CodexBash'
            : params.type === 'patch'
                ? 'CodexPatch'
                : (params.toolName ?? 'McpTool');
        const input = params.type === 'exec'
            ? { command: params.command, cwd: params.cwd }
            : params.type === 'patch'
                ? { changes: params.fileChanges }
                : (params.input ?? {});

        try {
            const result = await permissionHandler.handleToolCall(params.callId, toolName, input);
            logger.debug('[Codex] Permission result:', result.decision);
            return result.decision;
        } catch (error) {
            logger.debug('[Codex] Error handling permission:', error);
            return 'denied';
        }
    });

    // Event handler: same EventMsg types as the legacy MCP server — no changes needed
    client.setEventHandler((msg) => {
        logger.debug(`[Codex] Event: ${JSON.stringify(msg)}`);

        // Add messages to the ink UI buffer based on message type
        if (msg.type === 'agent_message') {
            messageBuffer.addMessage((msg as any).message, 'assistant');
        } else if (msg.type === 'agent_reasoning_delta') {
            // Skip reasoning deltas in the UI to reduce noise
        } else if (msg.type === 'agent_reasoning') {
            messageBuffer.addMessage(`[Thinking] ${(msg as any).text.substring(0, 100)}...`, 'system');
        } else if (msg.type === 'exec_command_begin') {
            messageBuffer.addMessage(`Executing: ${(msg as any).command}`, 'tool');
        } else if (msg.type === 'exec_command_end') {
            const output = (msg as any).output || (msg as any).error || 'Command completed';
            const truncatedOutput = output.substring(0, 200);
            messageBuffer.addMessage(
                `Result: ${truncatedOutput}${output.length > 200 ? '...' : ''}`,
                'result'
            );
        } else if (msg.type === 'task_started') {
            messageBuffer.addMessage('Starting task...', 'status');
        } else if (msg.type === 'task_complete') {
            // Ready is emitted from the main loop's idle check so pushes only fire once
            // after the queue is actually drained.
            const failure = describeCodexFailure(msg);
            if (failure) {
                messageBuffer.addMessage(`Task failed: ${failure}`, 'status');
                session.sendSessionEvent({ type: 'message', message: `Codex error: ${failure}` });
            } else {
                messageBuffer.addMessage('Task completed', 'status');
            }
        } else if (msg.type === 'turn_aborted') {
            const failure = describeCodexFailure(msg);
            if (failure) {
                messageBuffer.addMessage(`Turn aborted: ${failure}`, 'status');
                session.sendSessionEvent({ type: 'message', message: `Codex error: ${failure}` });
            } else {
                messageBuffer.addMessage('Turn aborted', 'status');
            }
        } else if (msg.type === 'token_count') {
            session.sendTokenCountUsageData('codex', msg as Record<string, unknown>, currentModel);
        }

        if (msg.type === 'task_started') {
            if (!thinking) {
                logger.debug('thinking started');
                thinking = true;
                session.keepAlive(thinking, 'remote');
            }
        }
        if (msg.type === 'task_complete' || msg.type === 'turn_aborted') {
            if (thinking) {
                logger.debug('thinking completed');
                thinking = false;
                session.keepAlive(thinking, 'remote');
            }
            // Reset diff processor on task end or abort
            diffProcessor?.reset();
        }
        if (msg.type === 'agent_reasoning_section_break') {
            reasoningProcessor.handleSectionBreak();
        }
        if (msg.type === 'agent_reasoning_delta') {
            reasoningProcessor.processDelta((msg as any).delta);
        }
        if (msg.type === 'agent_reasoning') {
            reasoningProcessor.complete((msg as any).text);
        }
        if (msg.type === 'patch_apply_begin') {
            const { changes } = msg as any;
            const changeCount = Object.keys(changes).length;
            const filesMsg = changeCount === 1 ? '1 file' : `${changeCount} files`;
            messageBuffer.addMessage(`Modifying ${filesMsg}...`, 'tool');
        }
        if (msg.type === 'patch_apply_end') {
            const { stdout, stderr, success } = msg as any;
            if (success) {
                const message = stdout || 'Files modified successfully';
                messageBuffer.addMessage(message.substring(0, 200), 'result');
            } else {
                const errorMsg = stderr || 'Failed to modify files';
                messageBuffer.addMessage(`Error: ${errorMsg.substring(0, 200)}`, 'result');
            }
        }
        if (msg.type === 'turn_diff') {
            if ((msg as any).unified_diff) {
                diffProcessor?.processDiff((msg as any).unified_diff);
            }
        }
        if (msg.type === 'thread_goal_updated' || msg.type === 'thread_goal_cleared') {
            updateCodexGoalState(msg as Record<string, unknown>);
        }

        // Convert events into the unified session-protocol envelope stream.
        // Reasoning deltas are handled by ReasoningProcessor to avoid duplicate text output.
        if (msg.type !== 'agent_reasoning_delta' && msg.type !== 'agent_reasoning' && msg.type !== 'agent_reasoning_section_break' && msg.type !== 'turn_diff') {
            const mapped = mapCodexMcpMessageToSessionEnvelopes(msg, {
                currentTurnId,
                finalAnswerMessageId: codexFinalAnswerMessageId,
                startedSubagents: codexStartedSubagents,
                activeSubagents: codexActiveSubagents,
                providerSubagentToSessionSubagent: codexProviderSubagentToSessionSubagent,
            });
            currentTurnId = mapped.currentTurnId;
            if ('finalAnswerMessageId' in mapped) {
                codexFinalAnswerMessageId = mapped.finalAnswerMessageId ?? null;
            }
            codexStartedSubagents = mapped.startedSubagents;
            codexActiveSubagents = mapped.activeSubagents;
            codexProviderSubagentToSessionSubagent = mapped.providerSubagentToSessionSubagent;
            for (const envelope of mapped.envelopes) {
                sendCodexSessionProtocolMessage(envelope);
            }
        }
    });

    // Start AgentHub MCP server (HTTP) and prepare STDIO bridge config for Codex
    agenthubServer = await startAgentHubServer(session);
    // Launch the bridge via `node <path>` (rather than relying on the .mjs shebang)
    // so it works on Windows, where Windows can't execute shebang scripts directly.
    // codex would otherwise fail to start the MCP server, the change_title tool would
    // not be visible to the model, and the model would improvise with shell echoes.
    const bridgeEntrypoint = join(projectPath(), 'bin', 'agenthub-mcp.mjs');
    const mcpServers = {
        agenthub: {
            command: process.execPath,
            args: ['--no-warnings', '--no-deprecation', bridgeEntrypoint, '--url', agenthubServer.url]
        }
    } as const;
    let shouldRequestTitleUpdate = true;
    let appendSystemPromptInjected = false;
    let officialThreadSyncThreadId: string | null = null;

    const startOfficialThreadSync = async (threadId: string, logPrefix: string) => {
        if (officialThreadSyncThreadId === threadId && officialThreadSync) {
            return;
        }
        if (officialThreadSyncInterval) {
            clearInterval(officialThreadSyncInterval);
            officialThreadSyncInterval = null;
        }

        officialThreadSyncThreadId = threadId;
        officialThreadSync = createOfficialCodexThreadSync({
            client,
            session: {
                sendSessionProtocolMessage: (envelope) => {
                    seenCodexEnvelopeIds.add(envelope.id);
                    session.sendSessionProtocolMessage(envelope);
                },
                updateMetadata: session.updateMetadata.bind(session),
            },
            threadId,
            seenEnvelopeIds: seenCodexEnvelopeIds,
            seenEnvelopes: observedCodexEnvelopes.values(),
            skipInitialHistory: isSideChat,
        });
        await officialThreadSync.poll();
        officialThreadSyncInterval = setInterval(() => {
            void officialThreadSync?.poll().catch((error) => {
                logger.debug(`[${logPrefix}] Failed to sync thread ${threadId}:`, error);
            });
        }, 2000);
        logger.debug(`[${logPrefix}] Synced envelopes from official thread ${threadId}`);
    };

    const stopOfficialThreadSync = () => {
        if (officialThreadSyncInterval) {
            clearInterval(officialThreadSyncInterval);
            officialThreadSyncInterval = null;
        }
        officialThreadSync = null;
        officialThreadSyncThreadId = null;
    };

    try {
        logger.debug('[codex]: client.connect begin');
        await client.connect();
        logger.debug('[codex]: client.connect done');

        void client.listModels({ includeHidden: false }).then((runtimeModels) => {
            session.updateMetadata((currentMetadata) => ({
                ...currentMetadata,
                models: runtimeModels.map((model) => ({
                    code: model.model,
                    value: model.displayName || model.model,
                    description: model.description || null,
                    isDefault: model.isDefault,
                    supportedReasoningEfforts: model.supportedReasoningEfforts.map((effort) => ({
                        code: effort.reasoningEffort,
                        value: effort.reasoningEffort,
                        description: effort.description || null,
                    })),
                    defaultReasoningEffortCode: model.defaultReasoningEffort,
                })),
            }));
        }).catch((error) => {
            logger.warn('[codex] Failed to publish runtime model catalog; continuing with default model', error);
        });

        if (opts.resumeThreadId) {
            const resumedThread = await resumeExistingThread({
                client,
                session,
                messageBuffer,
                threadId: opts.resumeThreadId,
                cwd: process.cwd(),
                mcpServers,
            });
            await startOfficialThreadSync(resumedThread.threadId, 'CODEX RESUME SYNC');
            shouldRequestTitleUpdate = false;
            pendingMirrorCodexThreadId = null;
        }

        if (!reconnectSessionId && pendingMirrorCodexThreadId && !opts.resumeThreadId) {
            const mirrorThreadId = pendingMirrorCodexThreadId;
            session.updateMetadata((currentMetadata) => ({
                ...currentMetadata,
                codexThreadId: mirrorThreadId,
                officialMirror: {
                    provider: 'codex',
                    id: mirrorThreadId,
                },
            }));
            await startOfficialThreadSync(mirrorThreadId, 'CODEX MIRROR SYNC');
            shouldRequestTitleUpdate = false;
        }

        const forkCodexThreadId = process.env.AGENTHUB_FORK_CODEX_THREAD_ID;
        if (!reconnectSessionId && forkCodexThreadId && !pendingMirrorCodexThreadId) {
            try {
                let syncThreadId = forkCodexThreadId;
                if (!opts.resumeThreadId) {
                    const resumedThread = await resumeExistingThread({
                        client,
                        session,
                        messageBuffer,
                        threadId: forkCodexThreadId,
                        cwd: process.cwd(),
                        mcpServers,
                        announce: !isSideChat,
                    });
                    syncThreadId = resumedThread.threadId;
                } else {
                    session.updateMetadata((currentMetadata) => ({
                        ...currentMetadata,
                        codexThreadId: forkCodexThreadId,
                    }));
                }
                await startOfficialThreadSync(syncThreadId, 'CODEX FORK SYNC');
                shouldRequestTitleUpdate = false;
            } catch (error) {
                logger.debug(`[CODEX FORK BACKFILL] Failed to read thread ${forkCodexThreadId}:`, error);
            }
        }

        let pending: { message: string; mode: EnhancedMode; isolate: boolean; hash: string } | null = null;

        while (!shouldExit) {
            logActiveHandles('loop-top');
            let message: { message: string; mode: EnhancedMode; isolate: boolean; hash: string } | null = pending;
            pending = null;
            if (!message) {
                // Capture the current signal to distinguish idle-abort from queue close
                const waitSignal = abortController.signal;
                const batch = await messageQueue.waitForMessagesAndGetAsString(waitSignal);
                if (!batch) {
                    // If wait was aborted (e.g., remote abort with no active inference), ignore and continue
                    if (waitSignal.aborted && !shouldExit) {
                        logger.debug('[codex]: Wait aborted while idle; ignoring and continuing');
                        continue;
                    }
                    logger.debug(`[codex]: batch=${!!batch}, shouldExit=${shouldExit}`);
                    break;
                }
                message = batch;
            }

            // Defensive check for TS narrowing
            if (!message) {
                break;
            }

            if (isCodexClearText(message.message)) {
                logger.debug('[Codex] Handling /clear command locally');
                closeActiveCodexTurn('cancelled');
                client.clearThreadState();
                stopOfficialThreadSync();
                pendingMirrorCodexThreadId = null;
                codexFinalAnswerMessageId = null;
                codexStartedSubagents = new Set<string>();
                codexActiveSubagents = new Set<string>();
                codexProviderSubagentToSessionSubagent = new Map<string, string>();
                permissionHandler.reset('Codex context cleared');
                reasoningProcessor.abort();
                diffProcessor?.reset();
                appendSystemPromptInjected = false;
                thinking = false;
                session.keepAlive(false, 'remote');
                session.updateMetadata((currentMetadata) => {
                    const nextMetadata = { ...currentMetadata };
                    delete nextMetadata.codexThreadId;
                    return nextMetadata;
                });
                messageBuffer.addMessage('Context was reset', 'status');
                session.sendSessionEvent({ type: 'message', message: 'Context was reset' });
                emitReadyIfIdle({
                    pending,
                    queueSize: () => messageQueue.size(),
                    shouldExit,
                    sendReady,
                });
                continue;
            }

            // Display user messages in the UI
            messageBuffer.addMessage(message.message, 'user');

            try {
                // Map permission mode to approval policy and sandbox.
                // With app-server, these are per-turn — no restart needed on mode change.
                const sandboxManagedByAgentHub = client.sandboxEnabled;
                const executionPolicy = resolveCodexExecutionPolicy(
                    message.mode.permissionMode,
                    sandboxManagedByAgentHub,
                );

                // Start thread on first turn (thread persists across mode changes)
                if (!client.hasActiveThread()) {
                    if (pendingMirrorCodexThreadId) {
                        const resumedThread = await resumeExistingThread({
                            client,
                            session,
                            messageBuffer,
                            threadId: pendingMirrorCodexThreadId,
                            cwd: process.cwd(),
                            mcpServers,
                        });
                        await startOfficialThreadSync(resumedThread.threadId, 'CODEX MIRROR SYNC');
                        pendingMirrorCodexThreadId = null;
                    } else {
                        const startedThread = await client.startThread({
                            model: message.mode.model,
                            cwd: process.cwd(),
                            approvalPolicy: executionPolicy.approvalPolicy,
                            sandbox: executionPolicy.sandbox,
                            mcpServers,
                        });
                        session.updateMetadata((currentMetadata) => ({
                            ...currentMetadata,
                            codexThreadId: startedThread.threadId,
                            currentModelCode: startedThread.model,
                        }));
                    }
                }

                const activeThreadId = client.threadId;
                if (!activeThreadId) {
                    throw new Error('No active Codex thread after start.');
                }

                const goalCommand = parseCodexGoalCommand(message.message);
                if (goalCommand && await handleCodexGoalCommand(goalCommand, activeThreadId)) {
                    continue;
                }

                const includeAppendSystemPrompt = Boolean(
                    message.mode.appendSystemPrompt && !appendSystemPromptInjected,
                );
                const imageInputs = await prepareCodexInlineImageInputs(message.mode.images, {
                    sessionId: session.sessionId,
                });
                if (message.mode.images?.length && imageInputs.inputItems.length === 0 && !message.message.trim()) {
                    session.sendSessionEvent({
                        type: 'message',
                        message: 'No supported images were available to send to Codex.',
                    });
                    continue;
                }
                const turnPrompt = buildCodexTurnPrompt({
                    message: message.message,
                    appendSystemPrompt: message.mode.appendSystemPrompt,
                    includeAppendSystemPrompt,
                    includeTitleInstruction: shouldRequestTitleUpdate,
                });

                const result = await client.sendTurnAndWait(turnPrompt, {
                    clientUserMessageId: message.mode.clientUserMessageId,
                    model: message.mode.model,
                    effort: message.mode.effort,
                    approvalPolicy: executionPolicy.approvalPolicy,
                    sandbox: executionPolicy.sandbox,
                    extraInputItems: imageInputs.inputItems,
                });
                shouldRequestTitleUpdate = false;
                if (includeAppendSystemPrompt) {
                    appendSystemPromptInjected = true;
                }

                if (result.aborted) {
                    // Turn was aborted (user abort or permission cancel).
                    // UI handling already done by the event handler (turn_aborted).
                    logger.debug('[Codex] Turn aborted');
                }
            } catch (error) {
                // Only actual errors reach here (process crash, connection failure, etc.)
                logger.warn('Error in codex session:', error);
                closeActiveCodexTurn('failed');
                if (shouldTerminateCodexSessionAfterError(error)) {
                    const message = 'Codex 后端进程已退出，会话已自动归档，请从官方会话或新会话继续。';
                    messageBuffer.addMessage(message, 'status');
                    session.sendSessionEvent({ type: 'message', message });
                    await requestProcessShutdown('Codex app-server exited unexpectedly', 1, 'failed');
                    return;
                }
                const message = 'Codex 会话出错，请稍后重试。';
                messageBuffer.addMessage(message, 'status');
                session.sendSessionEvent({ type: 'message', message });
            } finally {
                // Reset permission handler, reasoning processor, and diff processor
                permissionHandler?.reset();
                reasoningProcessor.abort();  // Use abort to properly finish any in-progress tool calls
                diffProcessor?.reset();
                thinking = false;
                session.keepAlive(thinking, 'remote');
                emitReadyIfIdle({
                    pending,
                    queueSize: () => messageQueue.size(),
                    shouldExit,
                    sendReady,
                });
                logActiveHandles('after-turn');
            }
        }

    } finally {
        // Clean up resources when main loop exits
        logger.debug('[codex]: Final cleanup start');
        logActiveHandles('cleanup-start');

        // Cancel offline reconnection if still running
        if (reconnectionHandle) {
            logger.debug('[codex]: Cancelling offline reconnection');
            reconnectionHandle.cancel();
        }

        await closeSessionAndBackend('Session ended', 'cancelled');

        // Clean up ink UI
        if (process.stdin.isTTY) {
            logger.debug('[codex]: setRawMode(false)');
            try { process.stdin.setRawMode(false); } catch {
                // Best effort terminal cleanup; the session has already been closed.
            }
        }
        // Stop reading from stdin so the process can exit
        if (hasTTY) {
            logger.debug('[codex]: stdin.pause()');
            try { process.stdin.pause(); } catch {
                // Best effort terminal cleanup; stdin may already be closed by the host.
            }
        }
        // Clear periodic keep-alive to avoid keeping event loop alive
        logger.debug('[codex]: clearInterval(keepAlive)');
        clearInterval(keepAliveInterval);
        if (officialThreadSyncInterval) {
            logger.debug('[codex]: clearInterval(officialThreadSync)');
            clearInterval(officialThreadSyncInterval);
        }
        if (inkInstance) {
            logger.debug('[codex]: inkInstance.unmount()');
            inkInstance.unmount();
        }
        messageBuffer.clear();

        logActiveHandles('cleanup-end');
        logger.debug('[codex]: Final cleanup completed');
    }
}
