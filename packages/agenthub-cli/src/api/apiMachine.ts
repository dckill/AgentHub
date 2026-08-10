/**
 * WebSocket client for machine/daemon communication with AgentHub server
 * Similar to ApiSessionClient but for machine-scoped connections
 */

import { io, Socket } from 'socket.io-client';
import { logger } from '@/ui/logger';
import { configuration } from '@/configuration';
import { MachineMetadata, DaemonState, Machine, Update, UpdateMachineBody } from './types';
import { registerCommonHandlers, SpawnSessionOptions, SpawnSessionResult } from '../modules/common/registerCommonHandlers';
import { encodeBase64, decodeBase64, encrypt, decrypt } from './encryption';
import { backoff } from '@/utils/time';
import { RpcHandlerManager } from './rpc/RpcHandlerManager';
import { detectCLIAvailability, CLIAvailability } from '@/utils/detectCLI';
import { detectResumeSupport, type ResumeSupport } from '@/resume/localAgentHubAgentAuth';
import { shouldReconnect } from '@/utils/lidState';
import { getProjectPath } from '@/claude/utils/path';
import { listOfficialClaudeSessionsForMachine, type OfficialClaudeSession } from '@/claude/officialSessions';
import {
    forkSession as claudeForkSession,
    forkAndTruncateSession as claudeForkAndTruncateSession,
    listClaudeRewindPoints,
    ForkTruncateUuidNotFoundError,
    ForkSourceMissingError,
} from '@/claude/utils/claudeSessionFork';
import { CodexAppServerClient } from '@/codex/codexAppServerClient';
import {
    CodexForkRewindPointNotFoundError,
    forkCodexThread,
    listCodexRewindPoints,
} from '@/codex/codexThreadFork';
import {
    listOfficialCodexThreadsForMachine,
    listOfficialCodexThreadStatesForMachine,
    type OfficialCodexThread,
} from '@/codex/officialSessions';
import { homedir } from 'os';
import { chmod, open, stat, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { StopSessionResult } from '@/daemon/sessionStopState';
import { hashObject } from '@/utils/deterministicJson';
import type { CliUpdateStatus, RpcCodexModelsResult } from '@artsum/agenthub-wire';
import { execSync } from 'node:child_process';
import { collectSystemMetrics } from '@/system/systemMetrics';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SPAWN_ENV_ALLOWLIST = new Set([
    'TERM', 'COLORTERM', 'LANG', 'LC_ALL', 'LC_CTYPE', 'NO_COLOR', 'FORCE_COLOR',
]);

function assertAllowedSpawnEnvironment(environmentVariables: unknown): asserts environmentVariables is Record<string, string> | undefined {
    if (environmentVariables === undefined) return;
    if (!environmentVariables || typeof environmentVariables !== 'object' || Array.isArray(environmentVariables)) {
        throw new Error('environmentVariables must be an object');
    }
    const invalidKeys = Object.keys(environmentVariables as Record<string, unknown>)
        .filter((key) => !SPAWN_ENV_ALLOWLIST.has(key));
    if (invalidKeys.length > 0) {
        throw new Error(`environmentVariables contains a non-allowlisted key: ${invalidKeys[0]}`);
    }
}

type OfficialAgentSession = OfficialCodexThread | OfficialClaudeSession;

type OfficialSessionProvider = 'codex' | 'claude';

type OfficialSessionsListRequest = {
    paths?: string[];
    providers?: OfficialSessionProvider[];
    limit?: number;
};

type OfficialCodexThreadIgnoreState = {
    ignoredThreadIds: string[];
};

const OFFICIAL_CODEX_THREAD_IGNORE_FILE = 'official-codex-thread-ignores.json';

async function getOfficialCodexThreadIgnoreFilePath(): Promise<string> {
    const agenthubHome = process.env.AGENTHUB_HOME_DIR || join(homedir(), '.agenthub');
    await mkdir(agenthubHome, { recursive: true, mode: 0o700 });
    return join(agenthubHome, OFFICIAL_CODEX_THREAD_IGNORE_FILE);
}

async function readOfficialCodexThreadIgnoreState(): Promise<OfficialCodexThreadIgnoreState> {
    try {
        const filePath = await getOfficialCodexThreadIgnoreFilePath();
        const raw = await readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        const ignoredThreadIds = Array.isArray(parsed?.ignoredThreadIds)
            ? parsed.ignoredThreadIds.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
            : [];
        return { ignoredThreadIds };
    } catch {
        return { ignoredThreadIds: [] };
    }
}

async function writeOfficialCodexThreadIgnoreState(state: OfficialCodexThreadIgnoreState): Promise<void> {
    const filePath = await getOfficialCodexThreadIgnoreFilePath();
    await writeFile(filePath, JSON.stringify({
        ignoredThreadIds: Array.from(new Set(state.ignoredThreadIds)).sort(),
    }, null, 2), { encoding: 'utf8', mode: 0o600 });
    await chmod(filePath, 0o600);
}

function normalizeOfficialSessionPath(path: string): string {
    if (path === '/') {
        return '/';
    }
    return path.replace(/\/+$/u, '');
}

function isOfficialSessionPathInScope(candidatePath: string | undefined | null, projectPath: string): boolean {
    if (!candidatePath) {
        return false;
    }

    const candidate = normalizeOfficialSessionPath(candidatePath);
    const project = normalizeOfficialSessionPath(projectPath);

    return candidate === project;
}

export function filterOfficialAgentSessionsForRequest<T extends {
    provider: OfficialSessionProvider;
    cwd?: string | null;
    updatedAt?: number | null;
}>(
    sessions: readonly T[],
    request: OfficialSessionsListRequest,
): T[] {
    const providerSet = request.providers?.length ? new Set(request.providers) : null;
    const normalizedPaths = request.paths?.map(normalizeOfficialSessionPath).filter((path) => path.length > 0) ?? [];
    const limit = request.limit && request.limit > 0 ? request.limit : 300;

    return sessions
        .filter((session) => {
            if (providerSet && !providerSet.has(session.provider)) {
                return false;
            }
            if (normalizedPaths.length === 0) {
                return true;
            }
            return normalizedPaths.some((path) => isOfficialSessionPathInScope(session.cwd, path));
        })
        .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
        .slice(0, limit);
}

async function listOfficialAgentSessionsForMachine(machineId: string, request: OfficialSessionsListRequest = {}): Promise<OfficialAgentSession[]> {
    const ignoreState = await readOfficialCodexThreadIgnoreState();
    const ignoredIds = new Set(ignoreState.ignoredThreadIds);
    const [codexThreads, claudeSessions] = await Promise.all([
        listOfficialCodexThreadsForMachine(machineId, ignoredIds),
        listOfficialClaudeSessionsForMachine(machineId, ignoredIds),
    ]);

    return filterOfficialAgentSessionsForRequest([...codexThreads, ...claudeSessions], request);
}

async function ignoreOfficialCodexThread(threadId: string): Promise<void> {
    const state = await readOfficialCodexThreadIgnoreState();
    if (!state.ignoredThreadIds.includes(threadId)) {
        state.ignoredThreadIds.push(threadId);
        await writeOfficialCodexThreadIgnoreState(state);
    }
}

async function unignoreOfficialCodexThread(threadId: string): Promise<void> {
    const state = await readOfficialCodexThreadIgnoreState();
    const next = state.ignoredThreadIds.filter((id) => id !== threadId);
    if (next.length !== state.ignoredThreadIds.length) {
        await writeOfficialCodexThreadIgnoreState({ ignoredThreadIds: next });
    }
}

async function listIgnoredOfficialCodexThreads(): Promise<string[]> {
    const state = await readOfficialCodexThreadIgnoreState();
    return state.ignoredThreadIds;
}

interface ServerToDaemonEvents {
    update: (data: Update) => void;
    'rpc-request': (data: { method: string, params: string }, callback: (response: string) => void) => void;
    'rpc-registered': (data: { method: string }) => void;
    'rpc-unregistered': (data: { method: string }) => void;
    'rpc-error': (data: { type: string, error: string }) => void;
    auth: (data: { success: boolean, user: string }) => void;
    error: (data: { message: string }) => void;
    'file-transfer-start': (data: { params: string; targetSocketId: string; attemptId: string }, callback: (response: { ok: boolean; totalSize?: number; error?: string }) => void) => void;
    'file-transfer-cancel': (data: { params: string }, callback: (response: { ok: boolean; error?: string }) => void) => void;
}

interface DaemonToServerEvents {
    'machine-alive': (data: {
        machineId: string;
        time: number;
    }) => void;

    'machine-update-metadata': (data: {
        machineId: string;
        metadata: string; // Encrypted MachineMetadata
        expectedVersion: number
    }, cb: (answer: {
        result: 'error'
    } | {
        result: 'version-mismatch'
        version: number,
        metadata: string
    } | {
        result: 'success',
        version: number,
        metadata: string
    }) => void) => void;

    'machine-update-state': (data: {
        machineId: string;
        daemonState: string; // Encrypted DaemonState
        expectedVersion: number
    }, cb: (answer: {
        result: 'error'
    } | {
        result: 'version-mismatch'
        version: number,
        daemonState: string
    } | {
        result: 'success',
        version: number,
        daemonState: string
    }) => void) => void;

    'rpc-register': (data: { method: string }) => void;
    'rpc-unregister': (data: { method: string }) => void;
    'rpc-call': (data: { method: string, params: any }, callback: (response: {
        ok: boolean
        result?: any
        error?: string
    }) => void) => void;
    'file-transfer-chunk': (data: {
        transferId: string;
        targetSocketId: string;
        metadata: FileTransferChunkMetadata;
        bytes: Uint8Array;
    }, callback: (response: { ok: boolean; error?: string }) => void) => void;
}

function requireNonEmptyString(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${name} is required`);
    }
    return value;
}

async function withCodexAppServerClient<T>(
    handler: (client: CodexAppServerClient) => Promise<T>,
    runtimeOptions: { cwd?: string; environmentVariables?: Record<string, string> } = {},
): Promise<T> {
    const client = new CodexAppServerClient(undefined, runtimeOptions);
    await client.connect();
    try {
        return await handler(client);
    } finally {
        await client.disconnect();
    }
}

type MachineRpcHandlers = {
    spawnSession: (options: SpawnSessionOptions) => Promise<SpawnSessionResult>;
    resumeSession?: (sessionId: string, options?: { model?: string; permissionMode?: string }) => Promise<SpawnSessionResult>;
    stopSession: (sessionId: string) => StopSessionResult;
    requestShutdown: () => void;
    checkCliUpdate: () => Promise<CliUpdateStatus>;
    updateCli: (version?: string) => Promise<{ accepted: boolean; status: CliUpdateStatus; message?: string }>;
    rollbackCli: () => Promise<{ accepted: boolean; status: CliUpdateStatus; message?: string }>;
}

type ActiveFileTransfer = {
    cancelled: boolean;
    attemptId: string;
    file?: FileHandle;
};

type FileTransferStartParams = {
    protocolVersion?: number;
    transferId: string;
    attemptId: string;
    path: string;
    offset?: number;
    chunkSize?: number;
    acceptsBinary?: boolean;
    maxInFlightChunks?: number;
};

type FileTransferCancelParams = {
    transferId: string;
    attemptId?: string;
};

type FileTransferChunkMetadata = {
    transferId: string;
    attemptId: string;
    offset: number;
    bytesRead: number;
    totalSize: number;
    done?: boolean;
    error?: string;
};

const DEFAULT_FILE_TRANSFER_CHUNK_BYTES = 2 * 1024 * 1024;
const MAX_FILE_TRANSFER_CHUNK_BYTES = 4 * 1024 * 1024;
const MIN_FILE_TRANSFER_CHUNK_BYTES = 64 * 1024;
const DEFAULT_FILE_TRANSFER_IN_FLIGHT_CHUNKS = 8;
const MAX_FILE_TRANSFER_IN_FLIGHT_CHUNKS = 16;
const FILE_TRANSFER_CHUNK_ACK_TIMEOUT_MS = 15_000;
const CODEX_MODEL_CATALOG_FRESH_MS = 5 * 60 * 1000;

function readCodexCliVersion(): string | undefined {
    try {
        return execSync('codex --version', { encoding: 'utf8', windowsHide: true }).trim() || undefined;
    } catch {
        return undefined;
    }
}

export class ApiMachineClient {
    private socket!: Socket<ServerToDaemonEvents, DaemonToServerEvents>;
    private keepAliveInterval: NodeJS.Timeout | null = null;
    private lastKnownCLIAvailability: CLIAvailability | null = null;
    private lastKnownResumeSupport: ResumeSupport | null = null;
    private rpcHandlerManager: RpcHandlerManager;
    private resumeSessionHandler: ((sessionId: string, options?: { model?: string; permissionMode?: string }) => Promise<SpawnSessionResult>) | null = null;
    private reconnectInterval: NodeJS.Timeout | null = null;
    private isShuttingDown = false;
    private activeFileTransfers = new Map<string, ActiveFileTransfer>();
    private codexModelCatalogCache = new Map<string, RpcCodexModelsResult>();
    private codexModelCatalogRefreshes = new Map<string, Promise<RpcCodexModelsResult>>();

    constructor(
        private token: string,
        private machine: Machine
    ) {
        // Initialize RPC handler manager
        this.rpcHandlerManager = new RpcHandlerManager({
            scopePrefix: this.machine.id,
            encryptionKey: this.machine.encryptionKey,
            encryptionVariant: this.machine.encryptionVariant,
            logger: (msg, data) => logger.debug(msg, data)
        });

        registerCommonHandlers(this.rpcHandlerManager, homedir(), false);
    }

    setRPCHandlers({
        spawnSession,
        resumeSession,
        stopSession,
        requestShutdown,
        checkCliUpdate,
        updateCli,
        rollbackCli,
    }: MachineRpcHandlers) {
        this.resumeSessionHandler = resumeSession ?? null;

        // Register spawn session handler
        this.rpcHandlerManager.registerHandler('spawn-agenthub-session', async (params: any) => {
            const {
                directory,
                sessionId,
                machineId,
                approvedNewDirectoryCreation,
                agent,
                permissionMode,
                model,
                environmentVariables,
                token,
                resumeClaudeSessionId,
                resumeCodexThreadId,
                officialMirrorClaudeSessionId,
                officialMirrorCodexThreadId,
                parentSessionId,
                forkedFromMessageId,
                isSideChat,
            } = params || {};
            assertAllowedSpawnEnvironment(environmentVariables);

            logger.debug('[API MACHINE] Spawning session', {
                directory,
                sessionId,
                machineId,
                agent,
                permissionMode,
                model,
                hasToken: typeof token === 'string' && token.length > 0,
                environmentVariableKeys: environmentVariables ? Object.keys(environmentVariables).sort() : [],
                resumeClaudeSessionId,
                resumeCodexThreadId,
                officialMirrorClaudeSessionId,
                officialMirrorCodexThreadId,
                parentSessionId,
                forkedFromMessageId,
                isSideChat,
            });

            if (!directory) {
                throw new Error('Directory is required');
            }

            const result = await spawnSession({
                directory,
                sessionId,
                machineId,
                approvedNewDirectoryCreation,
                agent,
                permissionMode,
                model,
                environmentVariables,
                token,
                resumeClaudeSessionId,
                resumeCodexThreadId,
                officialMirrorClaudeSessionId,
                officialMirrorCodexThreadId,
                parentSessionId,
                forkedFromMessageId,
                isSideChat,
            });

            switch (result.type) {
                case 'success':
                    logger.debug(`[API MACHINE] Spawned session ${result.sessionId}`);
                    return { type: 'success', sessionId: result.sessionId };

                case 'requestToApproveDirectoryCreation':
                    logger.debug(`[API MACHINE] Requesting directory creation approval for: ${result.directory}`);
                    return { type: 'requestToApproveDirectoryCreation', directory: result.directory };

                case 'error':
                    throw new Error(result.errorMessage);
            }
        });

        this.syncResumeSessionRpcRegistration();

        this.rpcHandlerManager.registerHandler('claude-fork-session', async (params: any) => {
            const { directory, claudeSessionId } = params || {};
            if (typeof directory !== 'string' || directory.length === 0) {
                throw new Error('directory is required');
            }
            if (typeof claudeSessionId !== 'string' || !UUID_RE.test(claudeSessionId)) {
                throw new Error('valid claudeSessionId is required');
            }
            try {
                const newClaudeSessionId = await claudeForkSession(getProjectPath(directory), claudeSessionId);
                return { type: 'success', newClaudeSessionId };
            } catch (error) {
                if (error instanceof ForkSourceMissingError) {
                    throw new Error('Claude session file not found on this machine');
                }
                throw error;
            }
        });

        this.rpcHandlerManager.registerHandler('claude-list-rewind-points', async (params: any) => {
            const { directory, claudeSessionId } = params || {};
            if (typeof directory !== 'string' || directory.length === 0) {
                throw new Error('directory is required');
            }
            if (typeof claudeSessionId !== 'string' || !UUID_RE.test(claudeSessionId)) {
                throw new Error('valid claudeSessionId is required');
            }
            try {
                const points = await listClaudeRewindPoints(getProjectPath(directory), claudeSessionId);
                return { type: 'success', points };
            } catch (error) {
                if (error instanceof ForkSourceMissingError) {
                    throw new Error('Claude session file not found on this machine');
                }
                throw error;
            }
        });

        this.rpcHandlerManager.registerHandler('claude-duplicate-session', async (params: any) => {
            const { directory, claudeSessionId, cutAfterUuid } = params || {};
            if (typeof directory !== 'string' || directory.length === 0) {
                throw new Error('directory is required');
            }
            if (typeof claudeSessionId !== 'string' || !UUID_RE.test(claudeSessionId)) {
                throw new Error('valid claudeSessionId is required');
            }
            if (typeof cutAfterUuid !== 'string' || !UUID_RE.test(cutAfterUuid)) {
                throw new Error('valid cutAfterUuid is required');
            }
            try {
                const newClaudeSessionId = await claudeForkAndTruncateSession(
                    getProjectPath(directory),
                    claudeSessionId,
                    cutAfterUuid,
                );
                return { type: 'success', newClaudeSessionId };
            } catch (error) {
                if (error instanceof ForkSourceMissingError) {
                    throw new Error('Claude session file not found on this machine');
                }
                if (error instanceof ForkTruncateUuidNotFoundError) {
                    throw new Error('The chosen rewind point is no longer present in the source session - try forking without truncation');
                }
                throw error;
            }
        });

        this.rpcHandlerManager.registerHandler('codex-fork-thread', async (params: any) => {
            const directory = requireNonEmptyString(params?.directory, 'directory');
            const codexThreadId = requireNonEmptyString(params?.codexThreadId, 'codexThreadId');

            return withCodexAppServerClient((client) => forkCodexThread(client, {
                threadId: codexThreadId,
                cwd: directory,
            }));
        });

        this.rpcHandlerManager.registerHandler('codex-list-rewind-points', async (params: any) => {
            const codexThreadId = requireNonEmptyString(params?.codexThreadId, 'codexThreadId');

            return withCodexAppServerClient(async (client) => {
                const { thread } = await client.readThread({ threadId: codexThreadId });
                return {
                    type: 'success',
                    points: listCodexRewindPoints(thread),
                };
            });
        });

        this.rpcHandlerManager.registerHandler('codex-duplicate-thread', async (params: any) => {
            const directory = requireNonEmptyString(params?.directory, 'directory');
            const codexThreadId = requireNonEmptyString(params?.codexThreadId, 'codexThreadId');
            const cutAfterItemId = requireNonEmptyString(params?.cutAfterItemId, 'cutAfterItemId');

            try {
                return await withCodexAppServerClient((client) => forkCodexThread(client, {
                    threadId: codexThreadId,
                    cwd: directory,
                    cutAfterItemId,
                }));
            } catch (error) {
                if (error instanceof CodexForkRewindPointNotFoundError) {
                    throw new Error('The chosen rewind point is no longer present in the source Codex thread - try forking without truncation');
                }
                throw error;
            }
        });

        this.rpcHandlerManager.registerHandler('codex-list-models', async (params: any) => {
            const directory = requireNonEmptyString(params?.directory, 'directory');
            const environmentVariables = params?.environmentVariables && typeof params.environmentVariables === 'object'
                ? params.environmentVariables as Record<string, string>
                : undefined;
            const cliVersion = readCodexCliVersion();
            const cacheKey = hashObject({ directory, environmentVariables: environmentVariables ?? {}, cliVersion });
            const cached = this.codexModelCatalogCache.get(cacheKey);
            if (cached && Date.now() - cached.fetchedAt < CODEX_MODEL_CATALOG_FRESH_MS) {
                return cached;
            }

            const refresh = () => {
                const existing = this.codexModelCatalogRefreshes.get(cacheKey);
                if (existing) return existing;
                const pending = withCodexAppServerClient(
                    (client) => client.listModels({ includeHidden: false }),
                    { cwd: directory, environmentVariables },
                ).then((models): RpcCodexModelsResult => {
                    const result = {
                        models,
                        fetchedAt: Date.now(),
                        stale: false,
                        ...(cliVersion ? { cliVersion } : {}),
                    };
                    this.codexModelCatalogCache.set(cacheKey, result);
                    return result;
                }).finally(() => {
                    this.codexModelCatalogRefreshes.delete(cacheKey);
                });
                this.codexModelCatalogRefreshes.set(cacheKey, pending);
                return pending;
            };

            if (cached) {
                void refresh().catch((error) => {
                    logger.debug('[API MACHINE] Background Codex model catalog refresh failed', error);
                });
                return { ...cached, stale: true };
            }
            return refresh();
        });

        this.rpcHandlerManager.registerHandler('codex-list-official-threads', async (params: any) => {
            const paths = Array.isArray(params?.paths)
                ? params.paths.filter((path: unknown): path is string => typeof path === 'string' && path.length > 0)
                : undefined;
            const providers = Array.isArray(params?.providers)
                ? params.providers.filter((provider: unknown): provider is OfficialSessionProvider => provider === 'codex' || provider === 'claude')
                : undefined;
            const limit = typeof params?.limit === 'number' && Number.isFinite(params.limit)
                ? params.limit
                : undefined;
            const threads = await listOfficialAgentSessionsForMachine(this.machine.id, { paths, providers, limit });
            return {
                type: 'success',
                threads,
            };
        });

        this.rpcHandlerManager.registerHandler('codex-list-official-thread-states', async (params: any) => {
            const threadIds = Array.isArray(params?.threadIds)
                ? params.threadIds.filter((threadId: unknown): threadId is string => typeof threadId === 'string' && threadId.length > 0)
                : [];
            return {
                type: 'success',
                threadStates: await listOfficialCodexThreadStatesForMachine(threadIds),
            };
        });

        this.rpcHandlerManager.registerHandler('codex-list-ignored-official-threads', async () => {
            return {
                type: 'success',
                threadIds: await listIgnoredOfficialCodexThreads(),
            };
        });

        this.rpcHandlerManager.registerHandler('codex-ignore-official-thread', async (params: any) => {
            const threadId = requireNonEmptyString(params?.threadId, 'threadId');
            await ignoreOfficialCodexThread(threadId);
            return { type: 'success' };
        });

        this.rpcHandlerManager.registerHandler('codex-unignore-official-thread', async (params: any) => {
            const threadId = requireNonEmptyString(params?.threadId, 'threadId');
            await unignoreOfficialCodexThread(threadId);
            return { type: 'success' };
        });

        // Register stop session handler
        this.rpcHandlerManager.registerHandler('stop-session', (params: any) => {
            const { sessionId } = params || {};

            if (!sessionId) {
                throw new Error('Session ID is required');
            }

            const result = stopSession(sessionId);
            // `not-found` is a valid terminal observation: the App must be
            // able to archive the server projection without downgrading to a
            // legacy kill RPC. Other unsuccessful states remain failures.
            if (!result.success && result.state !== 'not-found') {
                throw new Error('Session not found or failed to stop');
            }

            logger.debug(`[API MACHINE] Session ${sessionId} stop state: ${result.state}`);
            return { message: 'Session stop requested', state: result.state };
        });

        // Register stop daemon handler
        this.rpcHandlerManager.registerHandler('stop-daemon', () => {
            logger.debug('[API MACHINE] Received stop-daemon RPC request');

            // Trigger shutdown callback after a delay
            setTimeout(() => {
                logger.debug('[API MACHINE] Initiating daemon shutdown from RPC');
                requestShutdown();
            }, 100);

            return { message: 'Daemon stop request acknowledged, starting shutdown sequence...' };
        });

        this.rpcHandlerManager.registerHandler('check-cli-update', async () => checkCliUpdate());
        this.rpcHandlerManager.registerHandler('update-cli', async (params: { version?: string }) => updateCli(params.version));
        this.rpcHandlerManager.registerHandler('rollback-cli', async () => rollbackCli());
        this.rpcHandlerManager.registerHandler('get-system-metrics', async () => collectSystemMetrics());
    }

    private syncResumeSessionRpcRegistration(): void {
        const method = 'resume-agenthub-session';

        if (this.resumeSessionHandler) {
            if (!this.rpcHandlerManager.hasHandler(method)) {
                this.rpcHandlerManager.registerHandler(method, async (params: any) => {
                    const { sessionId, model, permissionMode } = params || {};

                    if (!sessionId || typeof sessionId !== 'string') {
                        throw new Error('Session ID is required');
                    }

                    const handler = this.resumeSessionHandler;
                    if (!handler) {
                        throw new Error('Resume session handler not available');
                    }

                    const result = await handler(sessionId, { model, permissionMode });
                    switch (result.type) {
                        case 'success':
                            return { type: 'success', sessionId: result.sessionId };
                        case 'requestToApproveDirectoryCreation':
                            return result;
                        case 'error':
                            throw new Error(result.errorMessage);
                    }
                });
            }
            return;
        }

        if (this.rpcHandlerManager.hasHandler(method)) {
            this.rpcHandlerManager.unregisterHandler(method);
        }
    }

    /**
     * Update machine metadata
     * Currently unused, changes from the mobile client are more likely
     * for example to set a custom name.
     */
    async updateMachineMetadata(handler: (metadata: MachineMetadata | null) => MachineMetadata): Promise<void> {
        await backoff(async () => {
            const updated = handler(this.machine.metadata);

            const answer = await this.socket.emitWithAck('machine-update-metadata', {
                machineId: this.machine.id,
                metadata: encodeBase64(encrypt(this.machine.encryptionKey, this.machine.encryptionVariant, updated)),
                expectedVersion: this.machine.metadataVersion
            });

            if (answer.result === 'success') {
                this.machine.metadata = decrypt(this.machine.encryptionKey, this.machine.encryptionVariant, decodeBase64(answer.metadata));
                this.machine.metadataVersion = answer.version;
                logger.debug('[API MACHINE] Metadata updated successfully');
            } else if (answer.result === 'version-mismatch') {
                if (answer.version > this.machine.metadataVersion) {
                    this.machine.metadataVersion = answer.version;
                    this.machine.metadata = decrypt(this.machine.encryptionKey, this.machine.encryptionVariant, decodeBase64(answer.metadata));
                }
                throw new Error('Metadata version mismatch'); // Triggers retry
            }
        });
    }

    /**
     * Update daemon state (runtime info) - similar to session updateAgentState
     * Simplified without lock - relies on backoff for retry
     */
    async updateDaemonState(handler: (state: DaemonState | null) => DaemonState): Promise<void> {
        await backoff(async () => {
            const updated = handler(this.machine.daemonState);

            const answer = await this.socket.emitWithAck('machine-update-state', {
                machineId: this.machine.id,
                daemonState: encodeBase64(encrypt(this.machine.encryptionKey, this.machine.encryptionVariant, updated)),
                expectedVersion: this.machine.daemonStateVersion
            });

            if (answer.result === 'success') {
                this.machine.daemonState = decrypt(this.machine.encryptionKey, this.machine.encryptionVariant, decodeBase64(answer.daemonState));
                this.machine.daemonStateVersion = answer.version;
                logger.debug('[API MACHINE] Daemon state updated successfully');
            } else if (answer.result === 'version-mismatch') {
                if (answer.version > this.machine.daemonStateVersion) {
                    this.machine.daemonStateVersion = answer.version;
                    this.machine.daemonState = decrypt(this.machine.encryptionKey, this.machine.encryptionVariant, decodeBase64(answer.daemonState));
                }
                throw new Error('Daemon state version mismatch'); // Triggers retry
            }
        });
    }

    connect() {
        this.isShuttingDown = false;
        const serverUrl = configuration.serverUrl.replace(/^http/, 'ws');
        logger.debug(`[API MACHINE] Connecting to ${serverUrl}`);

        this.socket = io(serverUrl, {
            transports: ['websocket'],
            auth: {
                token: this.token,
                clientType: 'machine-scoped' as const,
                machineId: this.machine.id,
                agenthubClient: `cli-daemon/${configuration.currentCliVersion}`
            },
            path: '/v1/updates',
            reconnection: false,
        });

        this.socket.on('connect', () => {
            logger.debug('[API MACHINE] Connected to server');

            if (this.reconnectInterval) {
                clearInterval(this.reconnectInterval);
                this.reconnectInterval = null;
            }

            this.updateDaemonState((state) => ({
                ...state,
                status: 'running',
                pid: process.pid,
                httpPort: this.machine.daemonState?.httpPort,
                startedAt: Date.now()
            }));

            this.rpcHandlerManager.onSocketConnect(this.socket);
            this.syncResumeSessionRpcRegistration();
            this.startKeepAlive();
        });

        this.socket.on('disconnect', (reason) => {
            logger.debug(`[API MACHINE] Disconnected from server — reason: ${reason}`);
            this.rpcHandlerManager.onSocketDisconnect();
            this.stopKeepAlive();
            if (!this.isShuttingDown) {
                this.startSmartReconnect();
            }
        });

        // Single consolidated RPC handler
        this.socket.on('rpc-request', async (data: { method: string, params: string }, callback: (response: string) => void) => {
            logger.debugLargeJson(`[API MACHINE] Received RPC request:`, data);
            callback(await this.rpcHandlerManager.handleRequest(data));
        });

        this.socket.on('file-transfer-start', (data, callback) => {
            this.handleFileTransferStart(data, callback);
        });

        this.socket.on('file-transfer-cancel', (data, callback) => {
            this.handleFileTransferCancel(data, callback);
        });

        // Handle update events from server
        this.socket.on('update', (data: Update) => {
            // Machine clients should only care about machine updates
            if (data.body.t === 'update-machine' && (data.body as UpdateMachineBody).machineId === this.machine.id) {
                // Handle machine metadata or daemon state updates from other clients (e.g., mobile app)
                const update = data.body as UpdateMachineBody;

                if (update.metadata) {
                    logger.debug('[API MACHINE] Received external metadata update');
                    this.machine.metadata = decrypt(this.machine.encryptionKey, this.machine.encryptionVariant, decodeBase64(update.metadata.value));
                    this.machine.metadataVersion = update.metadata.version;
                }

                if (update.daemonState) {
                    logger.debug('[API MACHINE] Received external daemon state update');
                    this.machine.daemonState = decrypt(this.machine.encryptionKey, this.machine.encryptionVariant, decodeBase64(update.daemonState.value));
                    this.machine.daemonStateVersion = update.daemonState.version;
                }
            } else {
                logger.debug(`[API MACHINE] Received unknown update type: ${(data.body as any).t}`);
            }
        });

        this.socket.on('connect_error', (error) => {
            logger.debug(`[API MACHINE] Connection error: ${error.message}`);
            this.rpcHandlerManager.onSocketDisconnect();
            this.stopKeepAlive();
            if (!this.isShuttingDown) {
                this.startSmartReconnect();
            }
        });

        this.socket.io.on('error', (error: any) => {
            logger.debug('[API MACHINE] Socket error:', error);
        });
    }

    private decryptFileTransferParams<T>(encryptedParams: string): T | null {
        try {
            return decrypt(
                this.machine.encryptionKey,
                this.machine.encryptionVariant,
                decodeBase64(encryptedParams),
            ) as T | null;
        } catch (error) {
            logger.debug('[API MACHINE] Failed to decrypt file transfer params:', error);
            return null;
        }
    }

    private normalizeFileTransferChunkSize(chunkSize: unknown): number {
        if (typeof chunkSize !== 'number' || !Number.isFinite(chunkSize)) {
            return DEFAULT_FILE_TRANSFER_CHUNK_BYTES;
        }
        const normalized = Math.floor(chunkSize);
        return Math.max(MIN_FILE_TRANSFER_CHUNK_BYTES, Math.min(MAX_FILE_TRANSFER_CHUNK_BYTES, normalized));
    }

    private normalizeFileTransferInFlightChunks(value: unknown): number {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return DEFAULT_FILE_TRANSFER_IN_FLIGHT_CHUNKS;
        }
        return Math.max(1, Math.min(MAX_FILE_TRANSFER_IN_FLIGHT_CHUNKS, Math.floor(value)));
    }

    private handleFileTransferStart(
        data: { params: string; targetSocketId: string; attemptId: string },
        callback: (response: { ok: boolean; totalSize?: number; error?: string }) => void,
    ) {
        const params = this.decryptFileTransferParams<FileTransferStartParams>(data.params);
        if (!params?.transferId || typeof params.transferId !== 'string' || !params.attemptId || typeof params.attemptId !== 'string' || !params.path || typeof params.path !== 'string') {
            callback({ ok: false, error: 'Invalid file transfer start params' });
            return;
        }
        if (params.attemptId !== data.attemptId) {
            callback({ ok: false, error: 'File transfer attempt mismatch' });
            return;
        }
        if (params.protocolVersion !== 2 || params.acceptsBinary !== true) {
            callback({ ok: false, error: 'File transfer v2 binary protocol is required' });
            return;
        }
        if (!data.targetSocketId || typeof data.targetSocketId !== 'string') {
            callback({ ok: false, error: 'Missing transfer target socket' });
            return;
        }

        this.prepareAndStartFileTransfer(params, data.targetSocketId, callback).catch((error) => {
            const message = error instanceof Error ? error.message : 'Failed to start file transfer';
            callback({ ok: false, error: message });
        });
    }

    private async prepareAndStartFileTransfer(
        params: FileTransferStartParams,
        targetSocketId: string,
        callback: (response: { ok: boolean; totalSize?: number; error?: string }) => void,
    ) {
        const fileStat = await stat(params.path);
        if (!fileStat.isFile()) {
            callback({ ok: false, error: 'Path is not a regular file' });
            return;
        }

        const totalSize = fileStat.size;
        const offset = Math.max(0, Math.min(totalSize, Math.floor(params.offset ?? 0)));
        const chunkSize = this.normalizeFileTransferChunkSize(params.chunkSize);
        const maxInFlightChunks = this.normalizeFileTransferInFlightChunks(params.maxInFlightChunks);

        const previous = this.activeFileTransfers.get(params.transferId);
        if (previous) {
            previous.cancelled = true;
            previous.file?.close().catch(() => {});
        }

        const active: ActiveFileTransfer = { cancelled: false, attemptId: params.attemptId };
        this.activeFileTransfers.set(params.transferId, active);
        logger.debug(`[API MACHINE] File transfer start transfer=${params.transferId} attempt=${params.attemptId} path=${params.path} offset=${offset} total=${totalSize} chunkSize=${chunkSize} inFlight=${maxInFlightChunks}`);
        callback({ ok: true, totalSize });

        this.streamFileTransfer({
            transferId: params.transferId,
            attemptId: params.attemptId,
            path: params.path,
            targetSocketId,
            offset,
            chunkSize,
            maxInFlightChunks,
            totalSize,
            active,
        }).catch((error) => {
            if (active.cancelled) {
                return;
            }
            logger.debug('[API MACHINE] File transfer failed:', error);
            this.sendFileTransferError(params.transferId, params.attemptId, targetSocketId, error).catch(() => {});
        });
    }

    private async streamFileTransfer(options: {
        transferId: string;
        attemptId: string;
        path: string;
        targetSocketId: string;
        offset: number;
        chunkSize: number;
        maxInFlightChunks: number;
        totalSize: number;
        active: ActiveFileTransfer;
    }) {
        const file = await open(options.path, 'r');
        options.active.file = file;

        try {
            let offset = options.offset;
            if (offset >= options.totalSize) {
                await this.sendFileTransferChunk(options.transferId, options.targetSocketId, {
                    transferId: options.transferId,
                    attemptId: options.attemptId,
                    offset,
                    bytesRead: 0,
                    totalSize: options.totalSize,
                    done: true,
                }, new Uint8Array());
                return;
            }

            const inFlight = new Set<Promise<void>>();
            let firstError: unknown = null;

            const trackChunk = (promise: Promise<void>) => {
                let tracked: Promise<void>;
                tracked = promise
                    .catch((error) => {
                        firstError ??= error;
                    })
                    .finally(() => {
                        inFlight.delete(tracked);
                    });
                inFlight.add(tracked);
            };

            while (!options.active.cancelled && (offset < options.totalSize || inFlight.size > 0)) {
                while (!options.active.cancelled && offset < options.totalSize && inFlight.size < options.maxInFlightChunks) {
                    const length = Math.min(options.chunkSize, options.totalSize - offset);
                    const buffer = Buffer.allocUnsafe(length);
                    const { bytesRead } = await file.read(buffer, 0, length, offset);
                    if (bytesRead <= 0) {
                        throw new Error('Unexpected end of file during transfer');
                    }

                    const chunkOffset = offset;
                    const nextOffset = offset + bytesRead;
                    trackChunk(this.sendFileTransferChunk(options.transferId, options.targetSocketId, {
                        transferId: options.transferId,
                        attemptId: options.attemptId,
                        offset: chunkOffset,
                        bytesRead,
                        totalSize: options.totalSize,
                        done: nextOffset >= options.totalSize,
                    }, buffer.subarray(0, bytesRead)));
                    offset = nextOffset;
                }

                if (firstError) {
                    throw firstError;
                }
                if (inFlight.size > 0) {
                    await Promise.race(inFlight);
                }
                if (firstError) {
                    throw firstError;
                }
            }
        } finally {
            await file.close().catch(() => {});
            if (this.activeFileTransfers.get(options.transferId) === options.active) {
                this.activeFileTransfers.delete(options.transferId);
            }
        }
    }

    private async sendFileTransferChunk(transferId: string, targetSocketId: string, metadata: FileTransferChunkMetadata, bytes: Uint8Array) {
        const startedAt = Date.now();
        try {
            const ack = await this.socket
                .timeout(FILE_TRANSFER_CHUNK_ACK_TIMEOUT_MS)
                .emitWithAck('file-transfer-chunk', {
                    transferId,
                    targetSocketId,
                    metadata,
                    bytes,
                });
            const duration = Date.now() - startedAt;
            if (!ack?.ok) {
                throw new Error(ack?.error || 'File transfer receiver did not accept chunk');
            }
            if (duration > 1000 || metadata.done) {
                logger.debug(`[API MACHINE] File transfer chunk ack transfer=${transferId} attempt=${metadata.attemptId} offset=${metadata.offset} bytes=${metadata.bytesRead} done=${!!metadata.done} durationMs=${duration}`);
            }
        } catch (error) {
            const duration = Date.now() - startedAt;
            logger.debug(`[API MACHINE] File transfer chunk failed transfer=${transferId} attempt=${metadata.attemptId} offset=${metadata.offset} bytes=${metadata.bytesRead} done=${!!metadata.done} durationMs=${duration}:`, error);
            throw error;
        }
    }

    private async sendFileTransferError(transferId: string, attemptId: string, targetSocketId: string, error: unknown) {
        const message = error instanceof Error ? error.message : 'File transfer failed';
        await this.sendFileTransferChunk(transferId, targetSocketId, {
            transferId,
            attemptId,
            offset: 0,
            bytesRead: 0,
            totalSize: 0,
            done: true,
            error: message,
        }, new Uint8Array());
    }

    private handleFileTransferCancel(
        data: { params: string },
        callback: (response: { ok: boolean; error?: string }) => void,
    ) {
        const params = this.decryptFileTransferParams<FileTransferCancelParams>(data.params);
        if (!params?.transferId || typeof params.transferId !== 'string') {
            callback({ ok: false, error: 'Invalid file transfer cancel params' });
            return;
        }

        const active = this.activeFileTransfers.get(params.transferId);
        if (active) {
            active.cancelled = true;
            active.file?.close().catch(() => {});
            this.activeFileTransfers.delete(params.transferId);
        }
        callback({ ok: true });
    }

    private startKeepAlive() {
        this.stopKeepAlive();
        this.keepAliveInterval = setInterval(() => {
            const payload = {
                machineId: this.machine.id,
                time: Date.now()
            };
            if (process.env.DEBUG) {
                logger.debugLargeJson(`[API MACHINE] Emitting machine-alive`, payload);
            }
            this.socket.emit('machine-alive', payload);

            // Re-detect CLI availability and push metadata update if changed
            const newAvailability = detectCLIAvailability();
            const prev = this.lastKnownCLIAvailability;
            const newResumeSupport = detectResumeSupport();
            const prevResume = this.lastKnownResumeSupport;
            const cliAvailabilityChanged = !prev || prev.claude !== newAvailability.claude || prev.codex !== newAvailability.codex;
            const resumeSupportChanged = !prevResume
                || prevResume.rpcAvailable !== newResumeSupport.rpcAvailable
                || prevResume.agenthubAgentAuthenticated !== newResumeSupport.agenthubAgentAuthenticated;

            if (cliAvailabilityChanged || resumeSupportChanged) {
                this.lastKnownCLIAvailability = newAvailability;
                this.lastKnownResumeSupport = newResumeSupport;
                this.updateMachineMetadata((metadata) => ({
                    ...(metadata || {} as any),
                    cliAvailability: newAvailability,
                    resumeSupport: { ...newResumeSupport, rpcAvailable: !!this.resumeSessionHandler },
                })).catch((err) => {
                    logger.debug('[API MACHINE] Failed to update machine capabilities:', err);
                });
            }
        }, 20000);
        logger.debug('[API MACHINE] Keep-alive started (20s interval)');
    }

    private startSmartReconnect() {
        if (this.isShuttingDown) return;
        if (this.reconnectInterval) return;

        this.reconnectInterval = setInterval(() => {
            if (this.isShuttingDown) {
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
                logger.debug('[API MACHINE] Still not ready to reconnect');
                return;
            }
            logger.debug('[API MACHINE] Attempting reconnect');
            this.socket.connect();
        }, 3000);

        if (shouldReconnect()) {
            logger.debug('[API MACHINE] Network up + lid open — reconnecting in 1s');
            setTimeout(() => { if (!this.isShuttingDown && !this.socket.connected) this.socket.connect() }, 1000);
        }
    }

    private stopKeepAlive() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
            logger.debug('[API MACHINE] Keep-alive stopped');
        }
    }

    shutdown() {
        logger.debug('[API MACHINE] Shutting down');
        this.isShuttingDown = true;
        this.stopKeepAlive();
        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
        }
        if (this.socket) {
            this.socket.close();
            logger.debug('[API MACHINE] Socket closed');
        }
    }
}
