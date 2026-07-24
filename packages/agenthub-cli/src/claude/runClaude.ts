import os from 'node:os';
import { randomUUID } from 'node:crypto';

import { ApiClient } from '@/api/api';
import type { ApiSessionClient } from '@/api/apiSession';
import { logger } from '@/ui/logger';
import { loop } from '@/claude/loop';
import { AgentGoalStatus, AgentState, Metadata } from '@/api/types';
import packageJson from '../../package.json';
import { Credentials, readSettings } from '@/persistence';
import { EnhancedMode, PermissionMode } from './loop';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { hashObject } from '@/utils/deterministicJson';
import { parseSpecialCommand } from '@/parsers/specialCommands';
import { getEnvironmentInfo } from '@/ui/doctor';
import { configuration } from '@/configuration';
import { notifyDaemonSessionStarted } from '@/daemon/controlClient';
import { initialMachineMetadata } from '@/daemon/run';
import { startAgentHubServer } from '@/claude/utils/startAgentHubServer';
import { startHookServer } from '@/claude/utils/startHookServer';
import { generateHookSettingsFile, cleanupHookSettingsFile } from '@/claude/utils/generateHookSettings';
import { registerKillSessionHandler } from './registerKillSessionHandler';
import { projectPath } from '../projectPath';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { startOfflineReconnection, connectionState } from '@/utils/serverConnectionErrors';
import { claudeLocal } from '@/claude/claudeLocal';
import { createSessionScanner } from '@/claude/utils/sessionScanner';
import {
    CLAUDE_GOAL_ACTION_CONFIRMATIONS,
    claudeGoalActionCapabilities,
    mapClaudeGoalStatusEventToAgentGoalStatus,
    parseClaudeGoalActionParams,
    type ClaudeGoalStatusTranscriptEvent,
} from '@/claude/claudeGoalStatus';
import { Session } from './session';
import { applySandboxPermissionPolicy, isPermissionMode, resolveInitialClaudePermissionMode } from './utils/permissionMode';
import { decodeBase64, encodeBase64 } from '@/api/encryption';
import type { Session as ApiSession } from '@/api/types';
import { getProjectPath } from './utils/path';
import { extractUserMessageText } from './utils/extractUserMessageText';
import { RawJSONLinesSchema, type RawJSONLines } from './types';
import { createRunnerShutdownCoordinator, type RunnerShutdownCoordinator, type RunnerShutdownRequest } from '@/sessionProtocol/RunnerShutdownCoordinator';
import { registerRunnerSignalHandlers } from '@/sessionProtocol/processSignalHandlers';
import { takeOfficialMirrorScannerForCleanup } from './officialMirrorTakeover';
import { resolveBundledToolsDir } from '@/tools/toolsPath';

/** JavaScript runtime to use for spawning Claude Code */
export type JsRuntime = 'node' | 'bun'

export interface StartOptions {
    model?: string
    permissionMode?: PermissionMode
    startingMode?: 'local' | 'remote'
    shouldStartDaemon?: boolean
    claudeEnvVars?: Record<string, string>
    claudeArgs?: string[]
    startedBy?: 'daemon' | 'terminal'
    noSandbox?: boolean
    /** JavaScript runtime to use for spawning Claude Code (default: 'node') */
    jsRuntime?: JsRuntime
}

type ClaudeGoalCommand = NonNullable<ReturnType<typeof parseClaudeGoalActionParams>>;
type PendingClaudeGoalAction = {
    command: ClaudeGoalCommand;
    resolve: (value: { ok: true }) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
};

async function backfillClaudeSessionFromJsonl(opts: {
    session: Pick<ApiSessionClient, 'sendClaudeSessionMessage' | 'updateMetadata'> & {
        recordLastUserMessageTitle: (message: { role: 'user'; content: { type: 'text'; text: string } }) => void;
    };
    workingDirectory: string;
    claudeSessionId: string;
    logPrefix: string;
}): Promise<void> {
    const jsonlPath = join(getProjectPath(opts.workingDirectory), `${opts.claudeSessionId}.jsonl`);
    try {
        const file = await readFile(jsonlPath, 'utf-8');
        let backfilled = 0;
        let lastUserText: string | null = null;
        for (const line of file.split('\n')) {
            if (line.trim().length === 0) {
                continue;
            }
            let parsed: unknown;
            try {
                parsed = JSON.parse(line);
            } catch {
                continue;
            }
            const result = RawJSONLinesSchema.safeParse(parsed);
            if (!result.success) {
                continue;
            }
            const data = result.data as RawJSONLines;
            opts.session.sendClaudeSessionMessage(data);
            const userText = extractUserMessageText(data);
            if (userText) {
                lastUserText = userText;
            }
            backfilled += 1;
        }
        opts.session.updateMetadata((meta) => ({ ...meta, claudeSessionId: opts.claudeSessionId }));
        if (lastUserText) {
            opts.session.recordLastUserMessageTitle({
                role: 'user',
                content: { type: 'text', text: lastUserText },
            });
        }
        logger.debug(`[${opts.logPrefix}] Replayed ${backfilled} historical messages from ${jsonlPath}`);
    } catch (error) {
        logger.debug(`[${opts.logPrefix}] Failed to read ${jsonlPath}:`, error);
    }
}

export async function runClaude(credentials: Credentials, options: StartOptions = {}): Promise<void> {
    logger.debug(`[CLAUDE] ===== CLAUDE MODE STARTING =====`);
    logger.debug(`[CLAUDE] Starting Claude Code agent`);
    
    const workingDirectory = process.cwd();
    const sessionTag = randomUUID();

    // Log environment info at startup
    logger.debugLargeJson('[START] AgentHub process started', getEnvironmentInfo());
    logger.debug(`[START] Options: startedBy=${options.startedBy}, startingMode=${options.startingMode}`);

    // Validate daemon spawn requirements - fail fast on invalid config
    if (options.startedBy === 'daemon' && options.startingMode === 'local') {
        throw new Error('Daemon-spawned sessions cannot use local/interactive mode. Use --agenthub-starting-mode remote or spawn sessions directly from terminal.');
    }

    // Set backend for offline warnings (before any API calls)
    connectionState.setBackend('Claude');

    // Create session service
    const api = await ApiClient.create(credentials);

    // Create a new session
    let state: AgentState = {};

    // Get machine ID from settings (should already be set up)
    const settings = await readSettings();
    let machineId = settings?.machineId
    const sandboxConfig = options.noSandbox ? undefined : settings?.sandboxConfig;
    const sandboxEnabled = Boolean(sandboxConfig?.enabled);
    const initialPermissionMode = applySandboxPermissionPolicy(
        resolveInitialClaudePermissionMode(options.permissionMode, options.claudeArgs),
        sandboxEnabled,
    );
    const dangerouslySkipPermissions =
        initialPermissionMode === 'bypassPermissions' ||
        initialPermissionMode === 'yolo' ||
        sandboxEnabled ||
        Boolean(options.claudeArgs?.includes('--dangerously-skip-permissions'));
    if (!machineId) {
        console.error(`[START] No machine ID found in settings, which is unexpected since authAndSetupMachineIfNeeded should have created it. Please report this issue at https://agenthub.yzsd.asia/support`);
        process.exit(1);
    }
    logger.debug(`Using machineId: ${machineId}`);

    // Create machine if it doesn't exist
    await api.getOrCreateMachine({
        machineId,
        metadata: initialMachineMetadata
    });

    const forkedFromSessionId = process.env.AGENTHUB_FORKED_FROM_SESSION_ID;
    const forkedFromMessageId = process.env.AGENTHUB_FORKED_FROM_MESSAGE_ID;
    const mirrorClaudeSessionId = process.env.AGENTHUB_MIRROR_CLAUDE_SESSION_ID || null;

    let metadata: Metadata = {
        path: workingDirectory,
        host: os.hostname(),
        version: packageJson.version,
        os: os.platform(),
        machineId: machineId,
        homeDir: os.homedir(),
        agentHubHomeDir: configuration.agentHubHomeDir,
        agentHubLibDir: projectPath(),
        agentHubToolsDir: resolveBundledToolsDir(),
        startedFromDaemon: options.startedBy === 'daemon',
        hostPid: process.pid,
        startedBy: options.startedBy || 'terminal',
        // Initialize lifecycle state
        lifecycleState: 'running',
        lifecycleStateSince: Date.now(),
        flavor: 'claude',
        sandbox: sandboxConfig?.enabled ? sandboxConfig : null,
        dangerouslySkipPermissions,
        ...(mirrorClaudeSessionId ? {
            claudeSessionId: mirrorClaudeSessionId,
            officialMirror: {
                provider: 'claude',
                id: mirrorClaudeSessionId,
            },
        } : {}),
        ...(forkedFromSessionId ? { parentSessionId: forkedFromSessionId } : {}),
        ...(forkedFromMessageId ? { forkedFromMessageId } : {}),
    };

    if (mirrorClaudeSessionId) {
        options.claudeArgs = ['--resume', mirrorClaudeSessionId, ...(options.claudeArgs ?? [])];
        options.startingMode = 'remote';
    }

    // Check for session reconnection env vars (set by daemon for resume-in-place)
    const reconnectSessionId = process.env.AGENTHUB_RECONNECT_SESSION_ID;
    const reconnectKeyBase64 = process.env.AGENTHUB_RECONNECT_ENCRYPTION_KEY;
    const reconnectVariant = process.env.AGENTHUB_RECONNECT_ENCRYPTION_VARIANT as 'legacy' | 'dataKey' | undefined;
    const reconnectSeq = process.env.AGENTHUB_RECONNECT_SEQ;
    const reconnectMetadataVersion = process.env.AGENTHUB_RECONNECT_METADATA_VERSION;
    const reconnectAgentStateVersion = process.env.AGENTHUB_RECONNECT_AGENT_STATE_VERSION;

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

    // Handle server unreachable case - run Claude locally with hot reconnection
    // Note: connectionState.notifyOffline() was already called by api.ts with error details
    if (!response) {
        let offlineSessionId: string | null = null;

        const reconnection = startOfflineReconnection({
            serverUrl: configuration.serverUrl,
            onReconnected: async () => {
                const resp = await api.getOrCreateSession({ tag: randomUUID(), metadata, state });
                if (!resp) throw new Error('Server unavailable');
                const session = api.sessionSyncClient(resp);
                let latestClaudeGoalStatus: AgentGoalStatus | null = null;
                const observedClaudeGoalRevisions = new Set<string>();
                const goalCommandSupported = () => {
                    const slashCommands = session.getMetadata()?.slashCommands ?? [];
                    return slashCommands.includes('goal') || slashCommands.includes('/goal');
                };
                const currentClaudeSessionId = () => session.getMetadata()?.claudeSessionId ?? null;
                const updateClaudeGoalState = (event: ClaudeGoalStatusTranscriptEvent) => {
                    if (observedClaudeGoalRevisions.has(event.sourceRevision)) {
                        return;
                    }
                    const capabilities = claudeGoalActionCapabilities({
                        goalCommandSupported: goalCommandSupported(),
                        observedGoalStatus: true,
                        confirmedActions: CLAUDE_GOAL_ACTION_CONFIRMATIONS,
                    });
                    const goalStatus = mapClaudeGoalStatusEventToAgentGoalStatus(
                        event,
                        currentClaudeSessionId(),
                        capabilities ? { capabilities } : undefined,
                    );
                    if (!goalStatus) {
                        return;
                    }
                    observedClaudeGoalRevisions.add(event.sourceRevision);
                    latestClaudeGoalStatus = goalStatus;
                    session.updateAgentState((current) => ({
                        ...current,
                        agentGoalStatus: latestClaudeGoalStatus ?? goalStatus,
                    }));
                };
                const scanner = await createSessionScanner({
                    sessionId: null,
                    workingDirectory,
                    onMessage: (msg) => session.sendClaudeSessionMessage(msg),
                    onTranscriptEvent: updateClaudeGoalState,
                });
                if (offlineSessionId) scanner.onNewSession(offlineSessionId);
                return { session, scanner };
            },
            onNotify: console.log,
            onCleanup: () => {
                // Scanner cleanup handled automatically when process exits
            }
        });

        try {
            await claudeLocal({
                path: workingDirectory,
                sessionId: null,
                onSessionFound: (id) => { offlineSessionId = id; },
                onThinkingChange: () => {},
                abort: new AbortController().signal,
                claudeEnvVars: options.claudeEnvVars,
                claudeArgs: options.claudeArgs,
                mcpServers: {},
                allowedTools: [],
                sandboxConfig,
            });
        } finally {
            reconnection.cancel();
        }
        process.exit(0);
    }

    logger.debug(`Session created: ${response.id}`);

    // Always report to daemon if it exists
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

    // SDK metadata (tools, slash commands) is now extracted from the
    // system.init message in claudeRemote.ts via onSDKMetadata callback

    // Create realtime session
    const session = api.sessionSyncClient(response);

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

    const forkClaudeSessionId = process.env.AGENTHUB_FORK_CLAUDE_SESSION_ID;
    if (!reconnectSessionId && forkClaudeSessionId) {
        await backfillClaudeSessionFromJsonl({
            session,
            workingDirectory,
            claudeSessionId: forkClaudeSessionId,
            logPrefix: 'FORK BACKFILL',
        });
    }

    let latestClaudeGoalStatus: AgentGoalStatus | null = null;
    const observedClaudeGoalRevisions = new Set<string>();
    let pendingClaudeGoalAction: PendingClaudeGoalAction | null = null;
    const goalCommandSupported = () => {
        const slashCommands = session.getMetadata()?.slashCommands ?? [];
        return slashCommands.includes('goal') || slashCommands.includes('/goal');
    };
    const currentClaudeSessionId = () => session.getMetadata()?.claudeSessionId ?? null;
    const settlePendingClaudeGoalAction = (goalStatus: AgentGoalStatus) => {
        if (!pendingClaudeGoalAction) {
            return;
        }

        const pending = pendingClaudeGoalAction;
        if (pending.command.type === 'clear' && goalStatus.status === 'inactive') {
            clearTimeout(pending.timeout);
            pendingClaudeGoalAction = null;
            pending.resolve({ ok: true });
            return;
        }

        if (
            pending.command.type === 'set'
            && goalStatus.status === 'active'
            && goalStatus.text.trim() === pending.command.objective.trim()
        ) {
            clearTimeout(pending.timeout);
            pendingClaudeGoalAction = null;
            pending.resolve({ ok: true });
        }
    };
    const updateClaudeGoalState = (event: ClaudeGoalStatusTranscriptEvent) => {
        if (observedClaudeGoalRevisions.has(event.sourceRevision)) {
            return;
        }
        const capabilities = claudeGoalActionCapabilities({
            goalCommandSupported: goalCommandSupported(),
            observedGoalStatus: true,
            confirmedActions: CLAUDE_GOAL_ACTION_CONFIRMATIONS,
        });
        const goalStatus = mapClaudeGoalStatusEventToAgentGoalStatus(
            event,
            currentClaudeSessionId(),
            capabilities ? { capabilities } : undefined,
        );
        if (!goalStatus) {
            return;
        }
        observedClaudeGoalRevisions.add(event.sourceRevision);
        latestClaudeGoalStatus = goalStatus;
        settlePendingClaudeGoalAction(goalStatus);
        session.updateAgentState((current) => ({
            ...current,
            agentGoalStatus: latestClaudeGoalStatus ?? goalStatus,
        }));
    };
    let officialMirrorScanner: Awaited<ReturnType<typeof createSessionScanner>> | null = null;
    let officialMirrorTakeoverStarted = false;
    if (!reconnectSessionId && mirrorClaudeSessionId) {
        officialMirrorScanner = await createSessionScanner({
            sessionId: mirrorClaudeSessionId,
            workingDirectory,
            onMessage: (message) => {
                session.sendClaudeSessionMessage(message);
            },
            onTranscriptEvent: updateClaudeGoalState,
        });
        await backfillClaudeSessionFromJsonl({
            session,
            workingDirectory,
            claudeSessionId: mirrorClaudeSessionId,
            logPrefix: 'OFFICIAL CLAUDE MIRROR',
        });
    }
    const goalScanner = await createSessionScanner({
        sessionId: metadata.claudeSessionId ?? null,
        workingDirectory,
        onMessage: () => {},
        onTranscriptEvent: updateClaudeGoalState,
    });

    // Start AgentHub MCP server
    const agenthubServer = await startAgentHubServer(session);
    logger.debug(`[START] AgentHub MCP server started at ${agenthubServer.url}`);

    // Variable to track current session instance (updated via onSessionReady callback)
    // Used by hook server to notify Session when Claude changes session ID
    let currentSession: Session | null = null;

    // Start Hook server for receiving Claude session notifications
    const hookServer = await startHookServer({
        onSessionHook: (sessionId, data) => {
            logger.debug(`[START] Session hook received: ${sessionId}`, data);

            goalScanner.onNewSession(sessionId);
            
            // Update session ID in the Session instance
            if (currentSession) {
                const previousSessionId = currentSession.sessionId;
                if (previousSessionId !== sessionId) {
                    logger.debug(`[START] Claude session ID changed: ${previousSessionId} -> ${sessionId}`);
                    currentSession.onSessionFound(sessionId);
                }
            }
        }
    });
    logger.debug(`[START] Hook server started on port ${hookServer.port}`);

    // Generate hook settings file for Claude
    const hookSettingsPath = generateHookSettingsFile(hookServer.port);
    logger.debug(`[START] Generated hook settings file: ${hookSettingsPath}`);

    // Print log file path
    const logPath = logger.logFilePath;
    logger.infoDeveloper(`Session: ${response.id}`);
    logger.infoDeveloper(`Logs: ${logPath}`);

    // Set initial agent state
    session.updateAgentState((currentState) => ({
        ...currentState,
        controlledByUser: options.startingMode !== 'remote'
    }));

    // Import MessageQueue2 and create message queue
    const messageQueue = new MessageQueue2<EnhancedMode>(mode => hashObject({
        isPlan: mode.permissionMode === 'plan',
        model: mode.model,
        fallbackModel: mode.fallbackModel,
        customSystemPrompt: mode.customSystemPrompt,
        appendSystemPrompt: mode.appendSystemPrompt,
        allowedTools: mode.allowedTools,
        disallowedTools: mode.disallowedTools
    }));

    // Forward messages to the queue
    // Permission modes: Use the unified 7-mode type, mapping happens at SDK boundary in claudeRemote.ts
    let currentPermissionMode: PermissionMode | undefined = initialPermissionMode;
    let currentModel = options.model; // Track current model state
    let currentFallbackModel: string | undefined = undefined; // Track current fallback model
    let currentCustomSystemPrompt: string | undefined = undefined; // Track current custom system prompt
    let currentAppendSystemPrompt: string | undefined = undefined; // Track current append system prompt
    let currentAllowedTools: string[] | undefined = undefined; // Track current allowed tools
    let currentDisallowedTools: string[] | undefined = undefined; // Track current disallowed tools
    let currentRunMode: 'local' | 'remote' = options.startingMode ?? 'local';
    const currentEnhancedMode = (): EnhancedMode => ({
        permissionMode: currentPermissionMode || 'default',
        model: currentModel,
        fallbackModel: currentFallbackModel,
        customSystemPrompt: currentCustomSystemPrompt,
        appendSystemPrompt: currentAppendSystemPrompt,
        allowedTools: currentAllowedTools,
        disallowedTools: currentDisallowedTools
    });

    session.rpcHandlerManager.registerHandler('goal-action', async (params: unknown) => {
        const actionParams = params && typeof params === 'object' && !Array.isArray(params)
            ? params as Record<string, unknown>
            : null;
        const command = actionParams ? parseClaudeGoalActionParams(actionParams) : null;
        if (!command) {
            throw new Error('Unsupported Claude goal action');
        }
        if (pendingClaudeGoalAction) {
            throw new Error('Claude goal action already in progress');
        }
        if (!latestClaudeGoalStatus || latestClaudeGoalStatus.status !== 'active') {
            throw new Error('No active Claude goal');
        }

        const capabilities = latestClaudeGoalStatus.capabilities ?? {};
        if (command.type === 'clear' && !capabilities.clear) {
            throw new Error('Claude clear goal action is not supported');
        }
        if (command.type === 'set' && !capabilities.edit) {
            throw new Error('Claude edit goal action is not supported');
        }
        if (currentRunMode !== 'remote') {
            throw new Error('Claude goal action is not ready: remote mode is not active');
        }
        if (!currentSession || currentSession.thinking) {
            throw new Error('Claude goal action is not ready while Claude is thinking');
        }
        if (messageQueue.size() > 0) {
            throw new Error('Claude message queue is busy');
        }

        const slashCommand = command.type === 'clear'
            ? '/goal clear'
            : `/goal ${command.objective}`;
        const mode = currentEnhancedMode();

        return await new Promise<{ ok: true }>((resolve, reject) => {
            const timeout = setTimeout(() => {
                pendingClaudeGoalAction = null;
                reject(new Error('Timed out waiting for Claude goal confirmation'));
            }, 30000);

            pendingClaudeGoalAction = { command, resolve, reject, timeout };
            try {
                messageQueue.pushIsolateAndClear(slashCommand, mode);
            } catch (error) {
                clearTimeout(timeout);
                pendingClaudeGoalAction = null;
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        });
    });

    // Exit when session is archived from web/mobile
    session.on('archived', () => {
        logger.debug('[loop] Session archived from web/mobile, cleaning up...');
        cleanup();
    });

    session.onUserMessage((message) => {
        session.recordLastUserMessageTitle(message);
        const takeover = takeOfficialMirrorScannerForCleanup(officialMirrorScanner, officialMirrorTakeoverStarted);
        officialMirrorScanner = takeover.scanner;
        officialMirrorTakeoverStarted = takeover.takeoverStarted;
        if (takeover.scannerToCleanup) {
            void takeover.scannerToCleanup.cleanup().catch((error) => {
                logger.debug('[OFFICIAL CLAUDE MIRROR] Failed to stop mirror scanner during takeover', error);
            });
        }

        // Resolve permission mode from meta - pass through as-is, mapping happens at SDK boundary
        let messagePermissionMode: PermissionMode | undefined = currentPermissionMode;
        if (message.meta?.permissionMode) {
            if (isPermissionMode(message.meta.permissionMode)) {
                messagePermissionMode = applySandboxPermissionPolicy(message.meta.permissionMode, sandboxEnabled);
                currentPermissionMode = messagePermissionMode;
                logger.debug(`[loop] Permission mode updated from user message to: ${currentPermissionMode}`);
            } else {
                logger.debug(`[loop] Ignoring invalid permission mode from user message: ${String(message.meta.permissionMode)}`);
            }
        } else {
            logger.debug(`[loop] User message received with no permission mode override, using current: ${currentPermissionMode}`);
        }

        // Resolve model - use message.meta.model if provided, otherwise use current model
        let messageModel = currentModel;
        if (message.meta?.hasOwnProperty('model')) {
            messageModel = message.meta.model || undefined; // null becomes undefined
            currentModel = messageModel;
            logger.debug(`[loop] Model updated from user message: ${messageModel || 'reset to default'}`);
        } else {
            logger.debug(`[loop] User message received with no model override, using current: ${currentModel || 'default'}`);
        }

        // Resolve custom system prompt - use message.meta.customSystemPrompt if provided, otherwise use current
        let messageCustomSystemPrompt = currentCustomSystemPrompt;
        if (message.meta?.hasOwnProperty('customSystemPrompt')) {
            messageCustomSystemPrompt = message.meta.customSystemPrompt || undefined; // null becomes undefined
            currentCustomSystemPrompt = messageCustomSystemPrompt;
            logger.debug(`[loop] Custom system prompt updated from user message: ${messageCustomSystemPrompt ? 'set' : 'reset to none'}`);
        } else {
            logger.debug(`[loop] User message received with no custom system prompt override, using current: ${currentCustomSystemPrompt ? 'set' : 'none'}`);
        }

        // Resolve fallback model - use message.meta.fallbackModel if provided, otherwise use current fallback model
        let messageFallbackModel = currentFallbackModel;
        if (message.meta?.hasOwnProperty('fallbackModel')) {
            messageFallbackModel = message.meta.fallbackModel || undefined; // null becomes undefined
            currentFallbackModel = messageFallbackModel;
            logger.debug(`[loop] Fallback model updated from user message: ${messageFallbackModel || 'reset to none'}`);
        } else {
            logger.debug(`[loop] User message received with no fallback model override, using current: ${currentFallbackModel || 'none'}`);
        }

        // Resolve append system prompt - use message.meta.appendSystemPrompt if provided, otherwise use current
        let messageAppendSystemPrompt = currentAppendSystemPrompt;
        if (message.meta?.hasOwnProperty('appendSystemPrompt')) {
            messageAppendSystemPrompt = message.meta.appendSystemPrompt || undefined; // null becomes undefined
            currentAppendSystemPrompt = messageAppendSystemPrompt;
            logger.debug(`[loop] Append system prompt updated from user message: ${messageAppendSystemPrompt ? 'set' : 'reset to none'}`);
        } else {
            logger.debug(`[loop] User message received with no append system prompt override, using current: ${currentAppendSystemPrompt ? 'set' : 'none'}`);
        }

        // Resolve allowed tools - use message.meta.allowedTools if provided, otherwise use current
        let messageAllowedTools = currentAllowedTools;
        if (message.meta?.hasOwnProperty('allowedTools')) {
            messageAllowedTools = message.meta.allowedTools || undefined; // null becomes undefined
            currentAllowedTools = messageAllowedTools;
            logger.debug(`[loop] Allowed tools updated from user message: ${messageAllowedTools ? messageAllowedTools.join(', ') : 'reset to none'}`);
        } else {
            logger.debug(`[loop] User message received with no allowed tools override, using current: ${currentAllowedTools ? currentAllowedTools.join(', ') : 'none'}`);
        }

        // Resolve disallowed tools - use message.meta.disallowedTools if provided, otherwise use current
        let messageDisallowedTools = currentDisallowedTools;
        if (message.meta?.hasOwnProperty('disallowedTools')) {
            messageDisallowedTools = message.meta.disallowedTools || undefined; // null becomes undefined
            currentDisallowedTools = messageDisallowedTools;
            logger.debug(`[loop] Disallowed tools updated from user message: ${messageDisallowedTools ? messageDisallowedTools.join(', ') : 'reset to none'}`);
        } else {
            logger.debug(`[loop] User message received with no disallowed tools override, using current: ${currentDisallowedTools ? currentDisallowedTools.join(', ') : 'none'}`);
        }

        // Check for special commands before processing
        const specialCommand = parseSpecialCommand(message.content.text);

        if (specialCommand.type === 'compact') {
            logger.debug('[start] Detected /compact command');
            const enhancedMode: EnhancedMode = {
                permissionMode: messagePermissionMode || 'default',
                model: messageModel,
                fallbackModel: messageFallbackModel,
                customSystemPrompt: messageCustomSystemPrompt,
                appendSystemPrompt: messageAppendSystemPrompt,
                allowedTools: messageAllowedTools,
                disallowedTools: messageDisallowedTools
            };
            messageQueue.pushIsolateAndClear(specialCommand.originalMessage || message.content.text, enhancedMode);
            logger.debugLargeJson('[start] /compact command pushed to queue:', message);
            return;
        }

        if (specialCommand.type === 'clear') {
            logger.debug('[start] Detected /clear command');
            const enhancedMode: EnhancedMode = {
                permissionMode: messagePermissionMode || 'default',
                model: messageModel,
                fallbackModel: messageFallbackModel,
                customSystemPrompt: messageCustomSystemPrompt,
                appendSystemPrompt: messageAppendSystemPrompt,
                allowedTools: messageAllowedTools,
                disallowedTools: messageDisallowedTools
            };
            messageQueue.pushIsolateAndClear(specialCommand.originalMessage || message.content.text, enhancedMode);
            logger.debugLargeJson('[start] /compact command pushed to queue:', message);
            return;
        }

        if (specialCommand.type === 'mcp' || specialCommand.type === 'skills') {
            // In local mode, let Claude Code handle these commands natively
            if (currentRunMode === 'local') {
                logger.debug(`[start] /${specialCommand.type} in local mode — passing through to Claude Code`);
            } else {
                logger.debug(`[start] Detected /${specialCommand.type} command in remote mode`);
                const metadata = session.getMetadata();
                let responseText: string;

                if (specialCommand.type === 'mcp') {
                    const servers = metadata?.mcpServers;
                    if (servers && servers.length > 0) {
                        responseText = '**MCP Servers**\n\n' + servers.map(s => `- **${s.name}** — ${s.status}`).join('\n');
                    } else {
                        responseText = 'No MCP servers configured. Session may still be initializing — try again after sending a message.';
                    }
                } else {
                    const skills = metadata?.skills ?? metadata?.slashCommands;
                    if (skills && skills.length > 0) {
                        responseText = '**Available Skills**\n\n' + skills.map(s => `- /${s}`).join('\n');
                    } else {
                        responseText = 'No skills available. Session may still be initializing — try again after sending a message.';
                    }
                }

                session.sendClaudeSessionMessage({
                    type: 'assistant',
                    uuid: randomUUID(),
                    parentUuid: null,
                    isSidechain: false,
                    sessionId: session.sessionId || 'unknown',
                    timestamp: new Date().toISOString(),
                    message: {
                        role: 'assistant',
                        model: 'system',
                        content: [{ type: 'text', text: responseText }],
                    },
                } as any);
                return;
            }
        }

        // Push with resolved permission mode, model, system prompts, and tools
        const enhancedMode: EnhancedMode = {
            permissionMode: messagePermissionMode || 'default',
            model: messageModel,
            fallbackModel: messageFallbackModel,
            customSystemPrompt: messageCustomSystemPrompt,
            appendSystemPrompt: messageAppendSystemPrompt,
            allowedTools: messageAllowedTools,
            disallowedTools: messageDisallowedTools
        };
        // Store images from meta for the launcher to pick up
        if (message.meta?.images && message.meta.images.length > 0) {
            if (currentSession) {
                currentSession.pendingImages = message.meta.images as Array<{ data: string; mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; name?: string; width?: number; height?: number }>;
            }
        }

        messageQueue.push(message.content.text, enhancedMode);
        logger.debugLargeJson('User message pushed to queue:', message)
    });

    // Setup one idempotent terminal coordinator for signals, archive, RPC,
    // backend/SDK failures and the normal Claude loop exit.
    let requestShutdown: (request: RunnerShutdownRequest) => Promise<void> = async () => {};
    let disposeRunnerSignalHandlers = () => {};
    const safely = async (label: string, action: () => void | Promise<void>) => {
        try {
            await action();
        } catch (error) {
            logger.debug(`[Claude] ${label} cleanup failed`, error);
        }
    };
    const shutdownCoordinator = createRunnerShutdownCoordinator({
        stopAcceptingTurns: () => messageQueue.close(),
        abortBackend: async (request) => {
            if (request.reason === 'Session ended') return;
            await safely('current session', () => currentSession?.cleanup());
        },
        closeActiveTurn: (status) => session.closeClaudeSessionTurn(status),
        publishThinkingFalse: () => {
            if (currentSession?.thinking === true) {
                currentSession.onThinkingChange?.(false);
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
            disposeRunnerSignalHandlers();
            if (officialMirrorScanner) {
                const scanner = officialMirrorScanner;
                officialMirrorScanner = null;
                await safely('official mirror scanner', () => scanner.cleanup());
            }
            await safely('goal scanner', () => goalScanner.cleanup());
            await safely('AgentHub MCP server', () => agenthubServer.stop());
            await safely('hook server', () => hookServer.stop());
            await safely('hook settings', () => cleanupHookSettingsFile(hookSettingsPath));
        },
    });
    requestShutdown = shutdownCoordinator.shutdown;

    const cleanup = async () => {
        logger.debug('[START] Received termination signal, cleaning up...');

        try {
            await requestShutdown({ reason: 'User terminated', turnStatus: 'cancelled' });

            logger.debug('[START] Cleanup complete, exiting');
            process.exit(0);
        } catch (error) {
            logger.debug('[START] Error during cleanup:', error);
            process.exit(1);
        }
    };

    // Handle termination signals
    disposeRunnerSignalHandlers = registerRunnerSignalHandlers({
        onSigterm: cleanup,
        onSigint: cleanup,
    });

    // Handle uncaught exceptions and rejections
    process.once('uncaughtException', (error) => {
        logger.debug('[START] Uncaught exception:', error);
        cleanup();
    });

    process.once('unhandledRejection', (reason) => {
        logger.debug('[START] Unhandled rejection:', reason);
        cleanup();
    });

    registerKillSessionHandler(session.rpcHandlerManager, cleanup);

    // Create claude loop
    const exitCode = await loop({
        path: workingDirectory,
        model: options.model,
        permissionMode: initialPermissionMode,
        startingMode: options.startingMode,
        messageQueue,
        api,
        allowedTools: agenthubServer.toolNames.map(toolName => `mcp__agenthub__${toolName}`),
        onModeChange: (newMode) => {
            currentRunMode = newMode;
            session.sendSessionEvent({ type: 'switch', mode: newMode });
            session.updateAgentState((currentState) => ({
                ...currentState,
                controlledByUser: newMode === 'local'
            }));
        },
        onSessionReady: (sessionInstance) => {
            // Store reference for hook server callback
            currentSession = sessionInstance;
        },
        onBackendFatal: async (error) => {
            const message = error instanceof Error ? error.message : String(error);
            logger.debug(`[Claude] Backend fatal; archiving session: ${message}`);
            await requestShutdown({
                reason: `Claude backend exited unexpectedly: ${message}`,
                turnStatus: 'failed',
            });
        },
        mcpServers: {
            'agenthub': {
                type: 'http' as const,
                url: agenthubServer.url,
            }
        },
        session,
        claudeEnvVars: options.claudeEnvVars,
        claudeArgs: options.claudeArgs,
        sandboxConfig,
        hookSettingsPath,
        jsRuntime: options.jsRuntime
    });

    logger.debug('Waiting for socket to flush...');
    logger.debug('Closing session...');
    await requestShutdown({
        reason: exitCode === 0 ? 'Claude exited' : `Claude exited with code ${exitCode}`,
        turnStatus: exitCode === 0 ? 'completed' : 'failed',
    });
    logger.debug('Stopped AgentHub MCP server');
    logger.debug('Stopped Hook server and cleaned up settings file');

    // Exit with the code from Claude
    process.exit(exitCode);
}
