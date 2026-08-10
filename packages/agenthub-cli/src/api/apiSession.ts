import { logger } from '@/ui/logger'
import { EventEmitter } from 'node:events'
import { io, Socket } from 'socket.io-client'
import { AgentState, ClientToServerEvents, Metadata, ServerToClientEvents, Session, Update, UserMessage, UserMessageSchema, Usage } from './types'
import { decodeBase64, decrypt, decryptBlob, encodeBase64, encrypt } from './encryption';
import { backoff, delay } from '@/utils/time';
import { configuration } from '@/configuration';
import { RawJSONLines } from '@/claude/types';
import { randomUUID } from 'node:crypto';
import { AsyncLock } from '@/utils/lock';
import { RpcHandlerManager } from './rpc/RpcHandlerManager';
import { registerCommonHandlers } from '../modules/common/registerCommonHandlers';
import { calculateCost } from '@/utils/pricing';
import { shouldReconnect } from '@/utils/lidState';
import { type SessionEnvelope, type SessionTurnEndStatus } from '@artsum/agenthub-wire';
import {
    closeClaudeTurnWithStatus,
    mapClaudeLogMessageToSessionEnvelopes,
    type ClaudeSessionProtocolState,
} from '@/claude/utils/sessionProtocolMapper';
import { InvalidateSync } from '@/utils/sync';
import axios from 'axios';
import { join } from 'node:path';
import { TerminalOutboxJournal } from './terminalOutboxJournal';
import { deriveKey } from '@/utils/deriveKey';
import { attachDecodedImages, parseIncomingImageAttachment, type DecodedIncomingImage } from './attachmentInbox';
import { emitSessionUpdateWithAck, type SessionUpdateAckSocket } from './sessionUpdateAck';

/**
 * Unified agent message data types used at the mobile transport boundary.
 */
export type UnifiedAgentMessageData =
    // Core message types
    | { type: 'message'; message: string }
    | { type: 'reasoning'; message: string }
    | { type: 'thinking'; text: string }
    // Tool interactions
    | { type: 'tool-call'; callId: string; name: string; input: unknown; id: string }
    | { type: 'tool-result'; callId: string; output: unknown; id: string; isError?: boolean }
    // File operations
    | { type: 'file-edit'; description: string; filePath: string; diff?: string; oldContent?: string; newContent?: string; id: string }
    // Terminal/command output
    | { type: 'terminal-output'; data: string; callId: string }
    // Task lifecycle events
    | { type: 'task_started'; id: string }
    | { type: 'task_complete'; id: string }
    | { type: 'turn_aborted'; id: string }
    // Permissions
    | { type: 'permission-request'; permissionId: string; toolName: string; description: string; options?: unknown }
    // Usage/metrics
    | { type: 'token_count';[key: string]: unknown };

export type SupportedAgentProvider = 'codex' | 'claude';

function numberField(source: Record<string, unknown>, keys: string[]): number | undefined {
    for (const key of keys) {
        const value = source[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
    }
    return undefined;
}

function recordField(source: Record<string, unknown>, keys: string[]): Record<string, unknown> | undefined {
    for (const key of keys) {
        const value = source[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return value as Record<string, unknown>;
        }
    }
    return undefined;
}

function contextFromTokenUsage(data: Record<string, unknown>, aggregate: Record<string, unknown>): number | undefined {
    const explicitContext = numberField(aggregate, ['context_tokens', 'contextTokens', 'context', 'context_size', 'contextSize']);
    if (explicitContext !== undefined) {
        return explicitContext;
    }

    const last = recordField(data, ['last', 'last_token_usage', 'lastTokenUsage']);
    const lastInput = last ? numberField(last, ['input_tokens', 'inputTokens', 'input', 'prompt_tokens', 'promptTokens']) : undefined;
    if (lastInput !== undefined) {
        return lastInput;
    }

    return aggregate !== data ? numberField(aggregate, ['input_tokens', 'inputTokens', 'input', 'prompt_tokens', 'promptTokens']) : undefined;
}

type V3SessionMessage = {
    id: string;
    seq: number;
    content: { t: 'encrypted'; c: string };
    localId: string | null;
    createdAt: number;
    updatedAt: number;
};

type V3GetSessionMessagesResponse = {
    messages: V3SessionMessage[];
    hasMore: boolean;
};

type V3PostSessionMessagesResponse = {
    messages: Array<{
        id: string;
        seq: number;
        localId: string | null;
        createdAt: number;
        updatedAt: number;
    }>;
};

const SESSION_END_ACK_TIMEOUT_MS = 2_000;
const SESSION_UPDATE_ACK_TIMEOUT_MS = 30_000;
const SESSION_END_FLUSH_TIMEOUT_MS = 1_000;
const DEFAULT_FLUSH_TIMEOUT_MS = 10_000;

export class ApiSessionClient extends EventEmitter {
    private readonly token: string;
    readonly sessionId: string;
    private metadata: Metadata | null;
    private metadataVersion: number;
    private agentState: AgentState | null;
    private agentStateVersion: number;
    private socket: Socket<ServerToClientEvents, ClientToServerEvents>;
    private pendingMessages: UserMessage[] = [];
    private pendingMessageCallback: ((message: UserMessage) => void) | null = null;
    private pendingImages: DecodedIncomingImage[] = [];
    private blobKey: Uint8Array | null = null;
    readonly rpcHandlerManager: RpcHandlerManager;
    private agentStateLock = new AsyncLock();
    private metadataLock = new AsyncLock();
    private encryptionKey: Uint8Array;
    private encryptionVariant: 'legacy' | 'dataKey';
    private reconnectInterval: NodeJS.Timeout | null = null;
    private isClosing = false;
    private ignoreArchiveSignal = false;
    private skipInitialMessages = false;
    private claudeSessionProtocolState: ClaudeSessionProtocolState = {
        currentTurnId: null,
        uuidToProviderSubagent: new Map<string, string>(),
        taskPromptToSubagents: new Map<string, string[]>(),
        providerSubagentToSessionSubagent: new Map<string, string>(),
        subagentTitles: new Map<string, string>(),
        bufferedSubagentMessages: new Map<string, RawJSONLines[]>(),
        hiddenParentToolCalls: new Set<string>(),
        startedSubagents: new Set<string>(),
        activeSubagents: new Set<string>(),
    };
    private lastSeq = 0;
    private pendingOutbox: Array<{ content: string; localId: string }> = [];
    private readonly outboxJournal: TerminalOutboxJournal | null;
    private sessionEndSendInFlight = false;
    private sessionEndSendTimer: NodeJS.Timeout | null = null;
    private sessionEndSendPromise: Promise<void> | null = null;
    private sessionEndSendResolve: (() => void) | null = null;
    private sessionEndRequested = false;
    private readonly sendSync: InvalidateSync;
    private readonly receiveSync: InvalidateSync;

    constructor(token: string, session: Session) {
        super()
        this.token = token;
        this.sessionId = session.id;
        this.metadata = session.metadata;
        this.metadataVersion = session.metadataVersion;
        this.agentState = session.agentState;
        this.agentStateVersion = session.agentStateVersion;
        this.encryptionKey = session.encryptionKey;
        this.encryptionVariant = session.encryptionVariant;
        this.sendSync = new InvalidateSync(() => this.flushOutbox());
        this.receiveSync = new InvalidateSync(() => this.fetchMessages());
        this.outboxJournal = configuration.agentHubHomeDir
            ? new TerminalOutboxJournal(join(configuration.agentHubHomeDir, 'terminal-outbox', `${encodeURIComponent(this.sessionId)}.json`))
            : null;
        if (this.outboxJournal) {
            this.pendingOutbox = this.outboxJournal.load();
        }

        // Initialize RPC handler manager
        this.rpcHandlerManager = new RpcHandlerManager({
            scopePrefix: this.sessionId,
            encryptionKey: this.encryptionKey,
            encryptionVariant: this.encryptionVariant,
            logger: (msg, data) => logger.debug(msg, data)
        });
        registerCommonHandlers(this.rpcHandlerManager, this.metadata.path);

        //
        // Create socket
        //

        this.socket = io(configuration.serverUrl, {
            auth: {
                token: this.token,
                clientType: 'session-scoped' as const,
                sessionId: this.sessionId,
                agenthubClient: `cli-coding-session/${configuration.currentCliVersion}`
            },
            path: '/v1/updates',
            reconnection: false,
            transports: ['websocket'],
            withCredentials: true,
            autoConnect: false
        });

        //
        // Handlers
        //

        this.socket.on('connect', () => {
            logger.debug('Socket connected successfully');
            if (this.reconnectInterval) {
                clearInterval(this.reconnectInterval);
                this.reconnectInterval = null;
            }
            this.rpcHandlerManager.onSocketConnect(this.socket);
            this.receiveSync.invalidate();
            if (this.pendingOutbox.length > 0) {
                this.sendSync.invalidate();
            }
            const pendingSessionEnd = this.outboxJournal?.pendingSessionEnd();
            if (pendingSessionEnd) {
                this.emitSessionEndWithAck(pendingSessionEnd);
            }
        })

        // Set up global RPC request handler
        this.socket.on('rpc-request', async (data: { method: string, params: string }, callback: (response: string) => void) => {
            callback(await this.rpcHandlerManager.handleRequest(data));
        })

        this.socket.on('disconnect', (reason) => {
            logger.debug(`[API] Socket disconnected: ${reason}`);
            this.resetSessionEndSendState();
            this.rpcHandlerManager.onSocketDisconnect();
            if (!this.isClosing) {
                this.startSmartReconnect();
            }
        })

        this.socket.on('connect_error', (error) => {
            logger.debug('[API] Socket connection error:', error);
            this.rpcHandlerManager.onSocketDisconnect();
            if (!this.isClosing) {
                this.startSmartReconnect();
            }
        })

        // Server events
        this.socket.on('update', (data: Update) => {
            try {
                logger.debugLargeJson('[SOCKET] [UPDATE] Received update:', data);

                if (!data.body) {
                    logger.debug('[SOCKET] [UPDATE] [ERROR] No body in update!');
                    return;
                }

                if (data.body.t === 'new-message') {
                    const messageSeq = data.body.message?.seq;
                    if (this.lastSeq === 0) {
                        this.receiveSync.invalidate();
                        return;
                    }
                    if (typeof messageSeq !== 'number' || messageSeq !== this.lastSeq + 1 || data.body.message.content.t !== 'encrypted') {
                        this.receiveSync.invalidate();
                        return;
                    }
                    const body = decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(data.body.message.content.c));
                    logger.debugLargeJson('[SOCKET] [UPDATE] Received update:', body)
                    if (parseIncomingImageAttachment(body)) {
                        this.receiveSync.invalidate();
                        return;
                    }
                    void this.routeIncomingMessage(body);
                    this.lastSeq = messageSeq;
                } else if (data.body.t === 'update-session') {
                    if (data.body.metadata && data.body.metadata.version > this.metadataVersion) {
                        this.metadata = decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(data.body.metadata.value));
                        this.metadataVersion = data.body.metadata.version;
                        // Check if session was archived from web/mobile
                        const meta = this.metadata as any;
                        if (meta?.lifecycleState === 'archiveRequested' || meta?.lifecycleState === 'archived') {
                            if (this.ignoreArchiveSignal) {
                                logger.debug(`[SOCKET] Session archived (${meta.lifecycleState}) but suppressed for reconnect`);
                                this.ignoreArchiveSignal = false;
                            } else {
                                logger.debug(`[SOCKET] Session archived (${meta.lifecycleState}), exiting...`);
                                this.emit('archived');
                            }
                        }
                    }
                    if (data.body.agentState && data.body.agentState.version > this.agentStateVersion) {
                        this.agentState = data.body.agentState.value ? decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(data.body.agentState.value)) : null;
                        this.agentStateVersion = data.body.agentState.version;
                    }
                } else if (data.body.t === 'update-machine') {
                    // Session clients shouldn't receive machine updates - log warning
                    logger.debug(`[SOCKET] WARNING: Session client received unexpected machine update - ignoring`);
                } else {
                    // If not a user message, it might be a permission response or other message type
                    this.emit('message', data.body);
                }
            } catch (error) {
                logger.debug('[SOCKET] [UPDATE] [ERROR] Error handling update', { error });
            }
        });

        // DEATH
        this.socket.on('error', (error) => {
            logger.debug('[API] Socket error:', error);
        });

        //
        // Connect (after short delay to give a time to add handlers)
        //

        this.socket.connect();
    }

    onUserMessage(callback: (data: UserMessage) => void) {
        this.pendingMessageCallback = callback;
        while (this.pendingMessages.length > 0) {
            callback(this.pendingMessages.shift()!);
        }
    }

    recordLastUserMessageTitle(message: UserMessage) {
        const text = message.content.text.replace(/\s+/g, ' ').trim();
        if (!text) {
            return;
        }

        this.updateMetadata((metadata) => {
            if (metadata.summary?.text?.trim()) {
                return metadata;
            }
            if (metadata.lastUserMessage === text) {
                return metadata;
            }
            return {
                ...metadata,
                lastUserMessage: text,
            };
        });
    }

    private authHeaders() {
        return {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            'X-AgentHub-Client': `cli-coding-session/${configuration.currentCliVersion}`
        };
    }

    private async getBlobKey(): Promise<Uint8Array> {
        if (!this.blobKey) {
            this.blobKey = await deriveKey(
                this.encryptionKey,
                'AgentHub Blobs',
                [this.encryptionVariant === 'dataKey' ? 'session' : 'master'],
            );
        }
        return this.blobKey;
    }

    private async downloadIncomingAttachment(ref: string): Promise<Uint8Array> {
        const reservation = await axios.post<{ downloadUrl: string }>(
            `${configuration.serverUrl}/v1/sessions/${encodeURIComponent(this.sessionId)}/attachments/request-download`,
            { ref },
            { headers: this.authHeaders(), timeout: 30_000 },
        );
        const downloadUrl = reservation.data.downloadUrl;
        if (typeof downloadUrl !== 'string') throw new Error('Attachment download reservation returned no URL');
        const sameServer = new URL(downloadUrl).origin === new URL(configuration.serverUrl).origin;
        const response = await axios.get<ArrayBuffer>(downloadUrl, {
            headers: sameServer ? { Authorization: `Bearer ${this.token}` } : undefined,
            responseType: 'arraybuffer',
            timeout: 60_000,
            maxRedirects: 5,
            maxContentLength: 10 * 1024 * 1024,
        });
        return new Uint8Array(response.data);
    }

    private async routeIncomingMessage(message: unknown) {
        const attachment = parseIncomingImageAttachment(message);
        if (attachment) {
            try {
                const encrypted = await this.downloadIncomingAttachment(attachment.ref);
                const data = decryptBlob(encrypted, await this.getBlobKey());
                if (data) {
                    this.pendingImages.push({
                        data,
                        mimeType: attachment.mimeType,
                        name: attachment.name,
                        ...(attachment.width !== undefined ? { width: attachment.width } : {}),
                        ...(attachment.height !== undefined ? { height: attachment.height } : {}),
                    });
                }
            } catch (error) {
                logger.debug('[API] Failed to download incoming image attachment', {
                    sessionId: this.sessionId,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
            return;
        }
        const userResult = UserMessageSchema.safeParse(message);
        if (userResult.success) {
            const routed = attachDecodedImages(userResult.data, this.pendingImages.splice(0));
            if (this.pendingMessageCallback) {
                this.pendingMessageCallback(routed);
            } else {
                this.pendingMessages.push(routed);
            }
            return;
        }
        this.emit('message', message);
    }

    private async fetchMessages() {
        // On reconnect, skip processing existing messages — just advance lastSeq
        const skipRouting = this.skipInitialMessages;
        if (skipRouting) {
            this.skipInitialMessages = false;
            logger.debug('[API] Reconnect mode: skipping existing messages, advancing lastSeq');
        }

        let afterSeq = this.lastSeq;
        while (true) {
            const response = await axios.get<V3GetSessionMessagesResponse>(
                `${configuration.serverUrl}/v3/sessions/${encodeURIComponent(this.sessionId)}/messages`,
                {
                    params: {
                        after_seq: afterSeq,
                        limit: 100
                    },
                    headers: this.authHeaders(),
                    timeout: 60000
                }
            );

            const messages = Array.isArray(response.data.messages) ? response.data.messages : [];
            let maxSeq = afterSeq;

            for (const message of messages) {
                if (message.seq > maxSeq) {
                    maxSeq = message.seq;
                }

                if (skipRouting) continue;

                if (message.content?.t !== 'encrypted') {
                    continue;
                }

                try {
                    const body = decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(message.content.c));
                    await this.routeIncomingMessage(body);
                } catch (error) {
                    logger.debug('[API] Failed to decrypt fetched message', {
                        sessionId: this.sessionId,
                        seq: message.seq,
                        error
                    });
                }
            }

            this.lastSeq = Math.max(this.lastSeq, maxSeq);
            const hasMore = !!response.data.hasMore;
            if (hasMore && maxSeq === afterSeq) {
                logger.debug('[API] fetchMessages pagination stalled, stopping to avoid infinite loop', {
                    sessionId: this.sessionId,
                    afterSeq
                });
                break;
            }
            afterSeq = maxSeq;
            if (!hasMore) {
                break;
            }
        }
    }

    private static readonly MAX_OUTBOX_BATCH_SIZE = 50;

    private async flushOutbox() {
        // Send latest messages first so the user sees recent activity immediately,
        // then backfill older messages in subsequent batches.
        while (this.pendingOutbox.length > 0) {
            const batchSize = Math.min(this.pendingOutbox.length, ApiSessionClient.MAX_OUTBOX_BATCH_SIZE);
            const batchStart = this.pendingOutbox.length - batchSize;
            const batch = this.pendingOutbox.slice(batchStart);

            const response = await axios.post<V3PostSessionMessagesResponse>(
                `${configuration.serverUrl}/v3/sessions/${encodeURIComponent(this.sessionId)}/messages`,
                {
                    messages: batch
                },
                {
                    headers: this.authHeaders(),
                    timeout: 60000
                }
            );

            const messages = Array.isArray(response.data.messages) ? response.data.messages : [];
            const maxSeq = messages.reduce((acc, message) => (
                message.seq > acc ? message.seq : acc
            ), this.lastSeq);
            this.lastSeq = maxSeq;
            // Keep the in-memory batch until the durable journal ACK succeeds.
            // If the process stays alive and the filesystem is temporarily
            // unavailable, the next bounded retry must still be able to send
            // the idempotent localIds instead of silently losing the batch.
            this.outboxJournal?.acknowledge(batch.map((message) => message.localId));
            this.pendingOutbox.splice(batchStart, batch.length);
        }
    }

    private enqueueMessage(content: unknown, invalidate: boolean = true) {
        const encrypted = encodeBase64(encrypt(this.encryptionKey, this.encryptionVariant, content));
        const entry = {
            content: encrypted,
            localId: randomUUID()
        };
        this.pendingOutbox.push(entry);
        try {
            this.outboxJournal?.append(entry);
        } catch (error) {
            logger.debug('[API] Failed to persist terminal outbox journal entry', error);
        }
        if (invalidate) {
            this.sendSync.invalidate();
        }
    }

    /**
     * Send message to session
     * @param body - Message body (can be MessageContent or raw content for agent messages)
     */
    sendClaudeSessionMessage(body: RawJSONLines) {
        const mapped = mapClaudeLogMessageToSessionEnvelopes(body, this.claudeSessionProtocolState);
        this.claudeSessionProtocolState.currentTurnId = mapped.currentTurnId;
        for (const envelope of mapped.envelopes) {
            this.sendSessionProtocolMessage(envelope);
        }
        // Track usage from assistant messages
        if (body.type === 'assistant' && body.message?.usage) {
            try {
                this.sendUsageData(body.message.usage, body.message.model);
            } catch (error) {
                logger.debug('[SOCKET] Failed to send usage data:', error);
            }
        }

        // Update metadata with summary if this is a summary message
        if (body.type === 'summary' && 'summary' in body && 'leafUuid' in body) {
            this.updateMetadata((metadata) => ({
                ...metadata,
                summary: {
                    text: body.summary,
                    updatedAt: Date.now()
                }
            }));
        }
    }

    closeClaudeSessionTurn(status: SessionTurnEndStatus = 'completed') {
        const mapped = closeClaudeTurnWithStatus(this.claudeSessionProtocolState, status);
        this.claudeSessionProtocolState.currentTurnId = mapped.currentTurnId;
        for (const envelope of mapped.envelopes) {
            this.sendSessionProtocolMessage(envelope);
        }
    }

    sendCodexMessage(body: any) {
        let content = {
            role: 'agent',
            content: {
                type: 'codex',
                data: body  // This wraps the entire Claude message
            },
            meta: {
                sentFrom: 'cli'
            }
        };
        this.enqueueMessage(content);
    }

    private enqueueSessionProtocolEnvelope(envelope: SessionEnvelope, invalidate: boolean = true) {
        const content = {
            role: 'session',
            content: envelope,
            meta: {
                sentFrom: 'cli'
            }
        };

        this.enqueueMessage(content, invalidate);
    }

    sendSessionProtocolMessage(envelope: SessionEnvelope) {
        if (envelope.role !== 'user') {
            this.enqueueSessionProtocolEnvelope(envelope);
            return;
        }

        if (envelope.ev.t !== 'text') {
            this.enqueueSessionProtocolEnvelope(envelope);
            return;
        }

        this.enqueueSessionProtocolEnvelope(envelope);
    }

    /**
     * Send a normalized supported-agent message to the session.
     * Normalizes supported agent messages to the unified envelope format.
     * 
     * @param provider - The supported agent provider sending the message.
     * @param body - The message payload (type: 'message' | 'reasoning' | 'tool-call' | 'tool-result')
     */
    sendAgentMessage(provider: SupportedAgentProvider, body: UnifiedAgentMessageData) {
        if (body.type === 'token_count') {
            this.sendTokenCountUsageData(provider, body);
        }

        let content = {
            role: 'agent',
            content: {
                type: 'acp',
                provider,
                data: body
            },
            meta: {
                sentFrom: 'cli'
            }
        };

        logger.debug(`[SOCKET] Sending normalized agent message from ${provider}:`, { type: body.type, hasMessage: 'message' in body });

        this.enqueueMessage(content);
    }

    /**
     * Send token_count usage data to the server for agents that do not emit
     * Claude-format assistant usage payloads.
     */
    sendTokenCountUsageData(provider: string, data: Record<string, unknown>, model?: string) {
        const aggregate = recordField(data, ['total', 'usage', 'tokenUsage']) ?? data;
        const input = numberField(aggregate, ['input_tokens', 'inputTokens', 'input', 'prompt_tokens', 'promptTokens']);
        const output = numberField(aggregate, ['output_tokens', 'outputTokens', 'output', 'completion_tokens', 'completionTokens']);
        const cacheCreation = numberField(aggregate, ['cache_creation_input_tokens', 'cacheCreationInputTokens', 'cacheCreation', 'cached_input_tokens_written']);
        const cacheRead = numberField(aggregate, ['cache_read_input_tokens', 'cacheReadInputTokens', 'cacheRead', 'cached_input_tokens', 'cachedInputTokens']);
        const reasoningOutput = numberField(aggregate, ['reasoning_output_tokens', 'reasoningOutputTokens', 'reasoning_output', 'reasoningOutput']);
        const total = numberField(aggregate, ['total_tokens', 'totalTokens', 'total'])
            ?? ((input ?? 0) + (output ?? 0) + (cacheCreation ?? 0) + (cacheRead ?? 0) + (reasoningOutput ?? 0));
        const context = contextFromTokenUsage(data, aggregate);
        const contextWindow = numberField(data, ['modelContextWindow', 'contextWindow', 'context_window', 'model_context_window', 'maxContextTokens', 'max_context_tokens'])
            ?? numberField(aggregate, ['modelContextWindow', 'contextWindow', 'context_window', 'model_context_window', 'maxContextTokens', 'max_context_tokens']);

        if (!total || total <= 0) {
            return;
        }

        const costTotal = numberField(data, ['cost_usd', 'costUsd', 'cost', 'total_cost', 'totalCost']) ?? 0;
        const usageReport = {
            key: `${provider}-session`,
            sessionId: this.sessionId,
            model: model ?? this.metadata?.currentModelCode,
            tokens: {
                total,
                ...(input !== undefined ? { input } : {}),
                ...(output !== undefined ? { output } : {}),
                ...(cacheCreation !== undefined ? { cache_creation: cacheCreation } : {}),
                ...(cacheRead !== undefined ? { cache_read: cacheRead } : {}),
                ...(reasoningOutput !== undefined ? { reasoning_output: reasoningOutput } : {}),
                ...(context !== undefined ? { context } : {}),
                ...(contextWindow !== undefined ? { context_window: contextWindow } : {}),
            },
            cost: {
                total: costTotal,
            }
        };

        logger.debugLargeJson('[SOCKET] Sending token_count usage data:', usageReport);
        this.socket.emit('usage-report', usageReport);
    }

    sendSessionEvent(event: {
        type: 'switch', mode: 'local' | 'remote'
    } | {
        type: 'message', message: string
    } | {
        type: 'permission-mode-changed', mode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
    } | {
        type: 'ready'
    }, id?: string) {
        let content = {
            role: 'agent',
            content: {
                id: id ?? randomUUID(),
                type: 'event',
                data: event
            }
        };
        this.enqueueMessage(content);
    }

    /**
     * Send a ping message to keep the connection alive
     */
    keepAlive(thinking: boolean, mode: 'local' | 'remote') {
        if (process.env.DEBUG) { // too verbose for production
            logger.debug(`[API] Sending keep alive message: ${thinking}`);
        }
        this.socket.volatile.emit('session-alive', {
            sid: this.sessionId,
            time: Date.now(),
            thinking,
            mode
        });
    }

    /**
     * Send session death message
     */
    sendSessionDeath(): Promise<void> {
        this.sessionEndRequested = true;
        const time = Date.now();
        try {
            this.outboxJournal?.markSessionEnd(this.sessionId, time);
        } catch (error) {
            logger.debug('[API] Failed to persist session-end journal marker', error);
        }
        return this.emitSessionEndWithAck({ sessionId: this.sessionId, time });
    }

    private emitSessionEndWithAck(marker: { sessionId: string; time: number }): Promise<void> {
        if (this.sessionEndSendPromise) return this.sessionEndSendPromise;
        this.sessionEndSendInFlight = true;
        const promise = new Promise<void>((resolve) => {
            this.sessionEndSendResolve = resolve;
        });
        this.sessionEndSendPromise = promise;
        this.sessionEndSendTimer = setTimeout(() => {
            this.resetSessionEndSendState();
        }, SESSION_END_ACK_TIMEOUT_MS);
        this.sessionEndSendTimer.unref?.();
        this.socket.emit(
            'session-end',
            { sid: marker.sessionId, time: marker.time },
            (response) => {
                this.resetSessionEndSendState();
                if (response?.result !== 'success') return;
                try {
                    this.outboxJournal?.consumeSessionEnd();
                } catch (error) {
                    logger.debug('[API] Failed to consume session-end journal marker', error);
                }
            },
        );
        return promise;
    }

    private resetSessionEndSendState(): void {
        const resolve = this.sessionEndSendResolve;
        this.sessionEndSendInFlight = false;
        if (this.sessionEndSendTimer) {
            clearTimeout(this.sessionEndSendTimer);
            this.sessionEndSendTimer = null;
        }
        this.sessionEndSendPromise = null;
        this.sessionEndSendResolve = null;
        resolve?.();
    }

    /**
     * Send usage data to the server
     */
    sendUsageData(usage: Usage, model?: string) {
        // Calculate total tokens
        const totalTokens = usage.input_tokens + usage.output_tokens + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
        const contextTokens = usage.input_tokens + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);

        const costs = calculateCost(usage, model);

        // Transform Claude usage format to backend expected format
        const usageReport = {
            key: 'claude-session',
            sessionId: this.sessionId,
            model: model ?? this.metadata?.currentModelCode,
            tokens: {
                total: totalTokens,
                input: usage.input_tokens,
                output: usage.output_tokens,
                cache_creation: usage.cache_creation_input_tokens || 0,
                cache_read: usage.cache_read_input_tokens || 0,
                context: contextTokens,
                ...(usage.context_window !== undefined ? { context_window: usage.context_window } : {}),
            },
            cost: {
                total: costs.total,
                input: costs.input,
                output: costs.output
            }
        }
        logger.debugLargeJson('[SOCKET] Sending usage data:', usageReport)
        this.socket.emit('usage-report', usageReport);
    }

    /**
     * Returns the latest session metadata known to the client.
     */
    getMetadata(): Metadata | null {
        return this.metadata;
    }

    /**
     * Update session metadata
     * @param handler - Handler function that returns the updated metadata
     */
    suppressNextArchiveSignal() {
        this.ignoreArchiveSignal = true;
    }

    skipExistingMessages() {
        this.skipInitialMessages = true;
    }

    updateMetadata(handler: (metadata: Metadata) => Metadata) {
        this.metadataLock.inLock(async () => {
            await backoff(async () => {
                let updated = handler(this.metadata!); // Weird state if metadata is null - should never happen but here we are
                const answer = await emitSessionUpdateWithAck<any>({
                    socket: this.socket as unknown as SessionUpdateAckSocket,
                    event: 'update-metadata',
                    data: {
                        sid: this.sessionId,
                        expectedVersion: this.metadataVersion,
                        metadata: encodeBase64(encrypt(this.encryptionKey, this.encryptionVariant, updated)),
                    },
                    timeoutMs: SESSION_UPDATE_ACK_TIMEOUT_MS,
                    onError: (error) => logger.debug('[SOCKET] update-metadata ack failed:', error),
                });
                if (!answer) return;
                if (answer.result === 'success') {
                    this.metadata = decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(answer.metadata));
                    this.metadataVersion = answer.version;
                } else if (answer.result === 'version-mismatch') {
                    if (answer.version > this.metadataVersion) {
                        this.metadataVersion = answer.version;
                        this.metadata = decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(answer.metadata));
                    }
                    throw new Error('Metadata version mismatch');
                } else if (answer.result === 'error') {
                    // Hard error - ignore
                }
            });
        });
    }

    /**
     * Update session agent state
     * @param handler - Handler function that returns the updated agent state
     */
    updateAgentState(handler: (metadata: AgentState) => AgentState) {
        logger.debugLargeJson('Updating agent state', this.agentState);
        this.agentStateLock.inLock(async () => {
            await backoff(async () => {
                let updated = handler(this.agentState || {});
                const answer = await emitSessionUpdateWithAck<any>({
                    socket: this.socket as unknown as SessionUpdateAckSocket,
                    event: 'update-state',
                    data: {
                        sid: this.sessionId,
                        expectedVersion: this.agentStateVersion,
                        agentState: updated ? encodeBase64(encrypt(this.encryptionKey, this.encryptionVariant, updated)) : null,
                    },
                    timeoutMs: SESSION_UPDATE_ACK_TIMEOUT_MS,
                    onError: (error) => logger.debug('[SOCKET] update-state ack failed:', error),
                });
                if (!answer) return;
                if (answer.result === 'success') {
                    this.agentState = answer.agentState ? decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(answer.agentState)) : null;
                    this.agentStateVersion = answer.version;
                    logger.debug('Agent state updated', this.agentState);
                } else if (answer.result === 'version-mismatch') {
                    if (answer.version > this.agentStateVersion) {
                        this.agentStateVersion = answer.version;
                        this.agentState = answer.agentState ? decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(answer.agentState)) : null;
                    }
                    throw new Error('Agent state version mismatch');
                } else if (answer.result === 'error') {
                    // console.error('Agent state update error', answer);
                    // Hard error - ignore
                }
            });
        });
    }

    /**
     * Wait for socket buffer to flush
     */
    async flush(): Promise<void> {
        const timeoutMs = this.sessionEndRequested
            ? SESSION_END_FLUSH_TIMEOUT_MS
            : DEFAULT_FLUSH_TIMEOUT_MS;
        await Promise.race([
            this.sendSync.invalidateAndAwait(),
            delay(timeoutMs)
        ]);
        if (!this.socket.connected) {
            return;
        }
        return new Promise((resolve) => {
            this.socket.emit('ping', () => {
                resolve();
            });
            setTimeout(() => {
                resolve();
            }, timeoutMs);
        });
    }

    async close() {
        logger.debug('[API] socket.close() called');
        this.isClosing = true;
        this.resetSessionEndSendState();
        this.sendSync.stop();
        this.receiveSync.stop();
        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
        }
        this.socket.close();
    }

    private startSmartReconnect() {
        if (this.isClosing) return;
        if (this.reconnectInterval) return;

        this.reconnectInterval = setInterval(() => {
            if (this.isClosing) {
                clearInterval(this.reconnectInterval!);
                this.reconnectInterval = null;
                return;
            }
            if (this.socket.connected) {
                clearInterval(this.reconnectInterval!);
                this.reconnectInterval = null;
                return;
            }
            if (!shouldReconnect()) {
                logger.debug('[API] Still not ready to reconnect');
                return;
            }
            logger.debug('[API] Attempting reconnect');
            this.socket.connect();
        }, 3000);

        if (shouldReconnect()) {
            logger.debug('[API] Network up + lid open — reconnecting in 1s');
            setTimeout(() => { if (!this.isClosing && !this.socket.connected) this.socket.connect() }, 1000);
        }
    }
}
