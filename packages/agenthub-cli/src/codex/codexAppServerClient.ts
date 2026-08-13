/**
 * Codex App Server Client — drives Codex via the v2 JSON-RPC protocol
 * (`codex app-server`), replacing the legacy MCP-based CodexMcpClient.
 *
 * Protocol: JSON-RPC 2.0 over stdio (newline-delimited JSON).
 * Reference: codex-rs/app-server/README.md in the openai/codex repo.
 *
 * WARNING: @openai/codex-sdk (v0.118.0) exists but only wraps `codex exec`
 * (non-interactive, fire-and-forget). It has NO support for `app-server`,
 * interactive approvals, or bidirectional JSON-RPC. We need app-server for
 * mobile approval routing (exec:request, patch:request, mcp:call), which is
 * why this client is hand-rolled. Re-evaluate if the SDK ever adds an
 * app-server wrapper or approval callbacks. See docs/plans/codex-app-server-migration.md.
 */

import type { ChildProcess } from 'node:child_process';
import { spawn as crossSpawn } from 'cross-spawn';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import { logger } from '@/ui/logger';
import type {
    NewConversationResponse,
    ResumeConversationResponse,
    InterruptConversationParams,
    SteerConversationParams,
    SteerConversationResponse,
    ReviewDecision,
    EventMsg,
    ApprovalPolicy,
    SandboxMode,
    InputItem,
    ReasoningEffort,
    ThreadGoalSetResponse,
    ThreadGoalClearResponse,
    ForkConversationResponse,
    ReadConversationResponse,
    RollbackConversationResponse,
    InjectItemsResponse,
    Thread,
    CodexModel,
    ModelListResponse,
} from './codexAppServerTypes';
import type { SandboxConfig } from '@/persistence';
import { initializeSandbox, wrapForMcpTransport } from '@/sandbox/manager';
import packageJson from '../../package.json';
import { rememberBoundedTurnId } from './boundedTurnSet';
import { resolveCodexPendingTurnLifecycle } from './codexPendingTurnResolutionLifecycle';
import { resolveCodexPendingTurn } from './codexPendingTurnCompletion';
import { buildTurnStartParams } from './turnStartParams';
import type { CodexRawFileChanges } from './codexRawItemRouting';
import {
    buildForkThreadParams,
    buildResumeThreadParams,
    buildStartThreadParams,
} from './threadRequestParams';
import { fetchAllCodexModels } from './modelListPagination';
import { handleCodexServerRequestLifecycle } from './codexServerRequestLifecycle';
import type { ThreadGoalSetOptions } from './goalParamsBuilder';
import {
    clearCodexThreadGoal,
    injectCodexItems,
    readCodexThread,
    rollbackCodexThread,
    setCodexThreadGoal,
} from './codexThreadOperations';
import { dispatchCodexResponse } from './codexResponseDispatch';
import { type PendingCodexRequest } from './codexResponseResolution';
import { terminateCodexProcess } from './codexProcessTermination';
import { reportCodexProcessFailure } from './codexProcessFailure';
import { dispatchCodexNotification } from './codexNotificationDispatch';
import { routeCodexInboundTransportLine } from './codexInboundTransportLifecycle';
import { buildCodexProcessEnvironment } from './codexProcessEnvironment';
import { rejectPendingCodexRequests } from './codexPendingRequestCleanup';
import { emitCodexRawTurnCompletion } from './codexRawTurnCompletion';
import { runCodexSendTurnAndWait } from './codexSendTurnAndWait';
import { waitForCodexTurnCompletion } from './codexTurnCompletionWait';
import { handleCodexNotificationLifecycle } from './codexNotificationLifecycle';
import { reconcileDisconnectedCodexTurns } from './codexDisconnectedTurnReconciliation';
import { reconnectAndResumeCodexThread } from './codexReconnectAndResume';
import { abortCodexTurnWithFallback } from './codexAbortTurnFallback';
import { interruptCodexTurn } from './codexInterruptTurn';
import { steerCodexActiveTurn } from './codexSteerActiveTurn';
import { sendCodexTurn } from './codexSendTurn';
import { resolveCodexApproval } from './codexApprovalHandler';
import { dispatchCodexRequest } from './codexRequestDispatch';
import { clearCodexThreadState } from './codexThreadStateReset';
import { runCodexDisconnectLifecycle } from './codexDisconnectLifecycle';
import { attachCodexProcessLifecycle } from './codexProcessLifecycle';
import {
    cancelPendingApprovalResponses,
    createPendingApprovalResponder,
} from './codexApprovalLifecycle';
import type { TurnCompletionResult } from './codexTurnCompletionWaiter';
import type { CodexThreadDefaults } from './codexThreadDefaults';
import {
    applyCodexForkedThread,
    applyCodexResumedThread,
    applyCodexStartedThread,
} from './codexThreadLifecycle';
import { initializeCodexAppServer } from './codexInitializeHandshake';
import { spawnCodexAppServerProcess } from './codexProcessSpawn';
import { isAppServerAvailable, isGoalActionsAvailable } from './codexRuntimeCapabilities';
import type { ApprovalHandler } from './codexApprovalTypes';
export type { ApprovalHandler } from './codexApprovalTypes';

export class CodexAppServerClient {
    private process: ChildProcess | null = null;
    private readline: ReadlineInterface | null = null;
    private nextId = 1;
    private pending = new Map<number, PendingCodexRequest>();
    private processEpoch = 0;
    private connected = false;
    private sandboxConfig?: SandboxConfig;
    private sandboxCleanup: (() => Promise<void>) | null = null;
    public sandboxEnabled = false;

    // Session state
    private _threadId: string | null = null;
    private _turnId: string | null = null;
    private threadDefaults: CodexThreadDefaults | null = null;

    // Turn completion tracking for the currently active sendTurnAndWait call.
    // A completion event only resolves once we have seen task_started for this turn.
    private pendingTurnCompletion: {
        resolve: (result: TurnCompletionResult) => void;
        turnId: string | null;
    } | null = null;
    private pendingApprovalResponses = new Map<number, () => void>();

    // Tracks in-flight interruptTurn() RPCs so sendTurnAndWait can wait for them
    // before starting a new turn (prevents stale turn/interrupt from aborting the next turn).
    private pendingInterrupt: Promise<void> | null = null;
    private notificationProtocol: 'unknown' | 'legacy' | 'raw' = 'unknown';
    private completedTurnIds = new Set<string>();
    private disconnectedTurnIds = new Set<string>();
    private recoveredTurnIds = new Set<string>();
    private static readonly MAX_COMPLETED_TURN_IDS = 1024;
    private rawFileChangesByItemId = new Map<string, CodexRawFileChanges>();

    // Handlers set by the consumer (runCodex.ts)
    private eventHandler: ((msg: EventMsg) => void) | null = null;
    private approvalHandler: ApprovalHandler | null = null;
    private fatalErrorHandler: ((error: Error) => void) | null = null;
    private processFailureReportedEpoch: number | null = null;
    private intentionalDisconnectEpoch: number | null = null;
    private runtimeOptions: {
        cwd?: string;
        environmentVariables?: Record<string, string>;
    };

    constructor(sandboxConfig?: SandboxConfig, runtimeOptions: {
        cwd?: string;
        environmentVariables?: Record<string, string>;
    } = {}) {
        this.sandboxConfig = sandboxConfig;
        this.runtimeOptions = runtimeOptions;
    }

    get threadId(): string | null {
        return this._threadId;
    }

    get turnId(): string | null {
        return this._turnId;
    }

    supportsGoalActions(): boolean {
        return isGoalActionsAvailable();
    }

    setEventHandler(handler: (msg: EventMsg) => void): void {
        this.eventHandler = handler;
    }

    /**
     * Receive an unrecoverable app-server process failure, including exits
     * while the client is idle (when no pending JSON-RPC request can surface
     * the failure to the runner).
     */
    setFatalErrorHandler(handler: (error: Error) => void): void {
        this.fatalErrorHandler = handler;
    }

    setApprovalHandler(handler: ApprovalHandler): void {
        this.approvalHandler = handler;
    }

    private reportProcessFailure(proc: ChildProcess, epoch: number, error: Error): void {
        reportCodexProcessFailure({
            currentProcess: this.process,
            process: proc,
            currentEpoch: this.processEpoch,
            epoch,
            intentionalDisconnectEpoch: this.intentionalDisconnectEpoch,
            processFailureReportedEpoch: this.processFailureReportedEpoch,
            error,
            markReported: () => {
                this.processFailureReportedEpoch = epoch;
                this.connected = false;
            },
            rejectPending: (failureEpoch, failureError) => {
                rejectPendingCodexRequests(this.pending, failureEpoch, () => failureError);
            },
            resolvePendingTurn: (aborted, reason) => this.resolvePendingTurn(aborted, reason),
            onFatalError: (failureError) => this.fatalErrorHandler?.(failureError),
            onFatalErrorFailure: (handlerError) => logger.debug(
                '[CodexAppServer] Fatal error handler failed:',
                handlerError,
            ),
        });
    }

    private rememberCompletedTurnId(turnId: string): void {
        rememberBoundedTurnId(this.completedTurnIds, turnId, CodexAppServerClient.MAX_COMPLETED_TURN_IDS);
    }

    private emitRawTurnCompletion(
        turnId: string | null,
        status: string | null,
        error: unknown,
        source: string,
    ): void {
        emitCodexRawTurnCompletion({
            turnId,
            status,
            error,
            source,
            tryResolvePendingTurn: (aborted, resolvedTurnId, completionSource) => this.tryResolvePendingTurn(
                aborted,
                resolvedTurnId,
                completionSource,
            ),
            clearTurn: () => { this._turnId = null; },
            hasCompletedTurn: (completedTurnId) => this.completedTurnIds.has(completedTurnId),
            rememberCompletedTurn: (completedTurnId) => this.rememberCompletedTurnId(completedTurnId),
            emit: (event) => this.eventHandler?.(event),
        });
    }

    // ─── Lifecycle ──────────────────────────────────────────────

    async connect(): Promise<void> {
        if (this.connected) return;

        if (!isAppServerAvailable()) {
            throw new Error(
                'Codex CLI is not installed\n\n' +
                'Please install Codex CLI using one of these methods:\n\n' +
                'Option 1 - npm (recommended):\n  npm install -g @openai/codex\n\n' +
                'Option 2 - Homebrew (macOS):\n  brew install --cask codex\n\n' +
                'Alternatively, use Claude Code:\n  agenthub claude',
            );
        }

        let command = 'codex';
        let args = ['app-server', '--listen', 'stdio://'];
        this.sandboxEnabled = false;

        if (this.sandboxConfig?.enabled && process.platform !== 'win32') {
            try {
                this.sandboxCleanup = await initializeSandbox(this.sandboxConfig, this.runtimeOptions.cwd ?? process.cwd());
                const wrapped = await wrapForMcpTransport('codex', ['app-server', '--listen', 'stdio://']);
                command = wrapped.command;
                args = wrapped.args;
                this.sandboxEnabled = true;
                logger.info(`[CodexAppServer] Sandbox enabled`);
            } catch (error) {
                logger.warn('[CodexAppServer] Failed to initialize sandbox; continuing without.', error);
                this.sandboxCleanup = null;
            }
        }

        const env = buildCodexProcessEnvironment({
            base: process.env,
            overrides: this.runtimeOptions.environmentVariables,
            sandboxEnabled: this.sandboxEnabled,
        });

        logger.debug(`[CodexAppServer] Spawning: ${command} ${args.join(' ')}`);

        const epoch = ++this.processEpoch;
        this.processFailureReportedEpoch = null;
        this.intentionalDisconnectEpoch = null;
        // Use cross-spawn so npm-installed wrappers (codex.cmd / codex.ps1) resolve on Windows.
        // Native child_process.spawn fails with ENOENT for .cmd shims (issues #980, #1016).
        const proc = spawnCodexAppServerProcess({
            command,
            args,
            env,
            cwd: this.runtimeOptions.cwd,
            spawnProcess: (spawnCommand, spawnArgs, options) => crossSpawn(spawnCommand, spawnArgs, options),
        });
        this.process = proc;

        this.readline = attachCodexProcessLifecycle({
            proc,
            epoch,
            isCurrent: () => this.process === proc && this.processEpoch === epoch,
            createReadline: (stdout) => createInterface({ input: stdout as NodeJS.ReadableStream }),
            onProcessError: (error) => {
                logger.debug('[CodexAppServer] Process error:', error);
                this.reportProcessFailure(
                    proc,
                    epoch,
                    error instanceof Error ? error : new Error(String(error)),
                );
            },
            onProcessExit: (code, signal) => {
                logger.debug(`[CodexAppServer] Process exited: code=${code} signal=${signal}`);
                this.reportProcessFailure(
                    proc,
                    epoch,
                    new Error(`Codex process exited (code=${code}, signal=${signal ?? 'none'})`),
                );
            },
            onStaleExit: () => logger.debug('[CodexAppServer] Ignoring stale process exit'),
            onStderr: (text) => logger.debug(`[CodexAppServer:stderr] ${text}`),
            onLine: (line, sourceEpoch) => this.handleLine(line, sourceEpoch),
        });

        try {
            await initializeCodexAppServer({
                version: packageJson.version,
                request: (method, params) => this.request(method, params),
                notify: (method) => this.notify(method),
                setConnected: () => { this.connected = true; },
                logConnected: () => logger.debug('[CodexAppServer] Connected and initialized'),
            });
        } catch (error) {
            await this.disconnectInternal();
            throw error;
        }
    }

    private async disconnectInternal(opts?: { preserveThreadState?: boolean }): Promise<void> {
        if (!this.connected && !this.process) return;

        const proc = this.process;
        const pid = proc?.pid;
        const epoch = this.processEpoch;
        const pendingTurnId = this.pendingTurnCompletion?.turnId ?? this._turnId;
        logger.debug(`[CodexAppServer] Disconnecting; pid=${pid ?? 'none'}`);
        this.intentionalDisconnectEpoch = epoch;

        const readline = this.readline;
        await runCodexDisconnectLifecycle({
            preserveThreadState: opts?.preserveThreadState,
            proc,
            readline,
            pid,
            epoch,
            pendingTurnId,
            disconnectedTurnIds: this.disconnectedTurnIds,
            pending: this.pending,
            sandboxCleanup: this.sandboxCleanup,
            terminateProcess: () => terminateCodexProcess({ readline, proc, pid }),
            setReadline: (value) => { this.readline = value; },
            setProcess: (value) => { this.process = value; },
            setConnected: (value) => { this.connected = value; },
            setSandboxCleanup: (value) => { this.sandboxCleanup = value; },
            setSandboxEnabled: (value) => { this.sandboxEnabled = value; },
            setTurnId: (turnId) => { this._turnId = turnId; },
            setNotificationProtocol: (protocol) => { this.notificationProtocol = protocol; },
            clearThreadState: () => {
                this._threadId = null;
                this.threadDefaults = null;
            },
            resolvePendingTurn: (aborted, reason) => this.resolvePendingTurn(aborted, reason),
        });

        logger.debug('[CodexAppServer] Disconnected');
    }

    async disconnect(): Promise<void> {
        await this.disconnectInternal();
    }

    async listModels(opts: { includeHidden?: boolean } = {}): Promise<CodexModel[]> {
        return fetchAllCodexModels({
            includeHidden: opts.includeHidden ?? false,
            fetchPage: async (params) => this.request('model/list', params) as Promise<ModelListResponse>,
        });
    }

    // ─── Thread management ──────────────────────────────────────

    async startThread(opts: {
        model?: string;
        cwd?: string;
        approvalPolicy?: ApprovalPolicy;
        sandbox?: SandboxMode;
        mcpServers?: Record<string, unknown>;
    }): Promise<{ threadId: string; model: string }> {
        const params = buildStartThreadParams(opts, process.cwd());

        const result = await this.request('thread/start', params) as NewConversationResponse;
        const projected = applyCodexStartedThread({
            result,
            options: opts,
            setThreadId: (threadId) => { this._threadId = threadId; },
            setTurnId: (turnId) => { this._turnId = turnId; },
            setDefaults: (defaults) => { this.threadDefaults = defaults; },
        });
        logger.debug('[CodexAppServer] Thread started:', this._threadId);
        return projected;
    }

    async resumeThread(opts?: {
        threadId?: string;
        model?: string;
        cwd?: string;
        approvalPolicy?: ApprovalPolicy;
        sandbox?: SandboxMode;
        mcpServers?: Record<string, unknown>;
    }): Promise<{ threadId: string; model: string }> {
        const threadId = opts?.threadId ?? this._threadId;
        if (!threadId) {
            throw new Error('No thread available to resume.');
        }

        const defaults = this.threadDefaults ?? {};
        const params = buildResumeThreadParams(threadId, opts ?? {}, defaults, process.cwd());

        const result = await this.request('thread/resume', params) as ResumeConversationResponse;
        const projected = applyCodexResumedThread({
            result,
            options: opts ?? {},
            existingDefaults: defaults,
            setThreadId: (nextThreadId) => { this._threadId = nextThreadId; },
            setTurnId: (turnId) => { this._turnId = turnId; },
            setDefaults: (nextDefaults) => { this.threadDefaults = nextDefaults; },
        });
        logger.debug('[CodexAppServer] Thread resumed:', this._threadId);
        return projected;
    }

    async forkThread(opts: {
        threadId: string;
        model?: string;
        cwd?: string;
        approvalPolicy?: ApprovalPolicy;
        sandbox?: SandboxMode;
        mcpServers?: Record<string, unknown>;
    }): Promise<{ threadId: string; model: string; thread: Thread }> {
        const defaults = this.threadDefaults ?? {};
        const params = buildForkThreadParams(opts.threadId, opts, defaults, process.cwd());

        const result = await this.request('thread/fork', params) as ForkConversationResponse;
        const projected = applyCodexForkedThread({
            result,
            options: opts,
            existingDefaults: defaults,
            setThreadId: (nextThreadId) => { this._threadId = nextThreadId; },
            setTurnId: (turnId) => { this._turnId = turnId; },
            setDefaults: (nextDefaults) => { this.threadDefaults = nextDefaults; },
        });
        logger.debug('[CodexAppServer] Thread forked:', opts.threadId, '->', this._threadId);
        return projected;
    }

    async readThread(opts: {
        threadId: string;
        includeTurns?: boolean;
    }): Promise<ReadConversationResponse> {
        return readCodexThread({
            ...opts,
            request: (method, params) => this.request(method, params),
        });
    }

    async rollbackThread(opts: {
        threadId: string;
        numTurns: number;
    }): Promise<RollbackConversationResponse> {
        return rollbackCodexThread({
            ...opts,
            request: (method, params) => this.request(method, params),
        });
    }

    async injectItems(opts: {
        threadId: string;
        items: unknown[];
    }): Promise<InjectItemsResponse> {
        return injectCodexItems({
            ...opts,
            request: (method, params) => this.request(method, params),
        });
    }

    async reconnectAndResumeThread(): Promise<boolean> {
        return reconnectAndResumeCodexThread({
            threadId: this._threadId,
            clearRecoveredTurns: () => this.recoveredTurnIds.clear(),
            disconnect: (preserveThreadState) => this.disconnectInternal({ preserveThreadState }),
            connect: () => this.connect(),
            resume: (threadId) => this.resumeThread({ threadId }).then(() => undefined),
            reconcile: (threadId) => this.reconcileDisconnectedTurns(threadId),
            clearThreadState: () => {
                this._threadId = null;
                this.threadDefaults = null;
            },
            onResumeFailure: (error) => logger.warn('[CodexAppServer] Failed to resume thread after reconnect', error),
        });
    }

    /**
     * Recover a turn that may have completed while the app-server transport was
     * down. `thread/read` is the durable source of truth; live notifications are
     * not guaranteed to be replayed after a process restart.
     */
    private async reconcileDisconnectedTurns(threadId: string): Promise<void> {
        await reconcileDisconnectedCodexTurns({
            threadId,
            disconnectedTurnIds: this.disconnectedTurnIds,
            completedTurnIds: this.completedTurnIds,
            readThread: async (id) => {
                const response = await this.readThread({ threadId: id, includeTurns: true });
                return { thread: response.thread };
            },
            emitEvent: (event) => this.eventHandler?.(event),
            markRecoveredTurnId: (turnId) => this.recoveredTurnIds.add(turnId),
            rememberCompletedTurnId: (turnId) => {
                this.rememberCompletedTurnId(turnId);
            },
            onError: (error) => {
                // Older app-server versions may not support thread/read. Keep the
                // existing abort fallback and leave the turn pending for a future
                // reconnect attempt.
                logger.warn('[CodexAppServer] Failed to reconcile turns after reconnect', error);
            },
        });
    }

    async setGoal(opts: ThreadGoalSetOptions): Promise<ThreadGoalSetResponse> {
        return setCodexThreadGoal({
            ...opts,
            request: (method, params) => this.request(method, params),
        });
    }

    async clearGoal(opts: {
        threadId: string;
    }): Promise<ThreadGoalClearResponse> {
        return clearCodexThreadGoal({
            ...opts,
            request: (method, params) => this.request(method, params),
        });
    }

    // ─── Turn management ────────────────────────────────────────

    /** Default grace period after interrupt before forcing a restart (ms). */
    private static readonly ABORT_GRACE_MS = 3_000;

    private hasPendingTurnCompletion(): boolean {
        return this.pendingTurnCompletion !== null;
    }

    private resolvePendingTurn(aborted: boolean, reason?: TurnCompletionResult['reason']): void {
        resolveCodexPendingTurn({
            pending: this.pendingTurnCompletion,
            aborted,
            reason,
            cancelApprovals: () => this.cancelPendingApprovals(),
            clearPending: () => {
                this.pendingTurnCompletion = null;
            },
        });
    }

    private markPendingTurnStarted(turnId?: string | null): void {
        if (!this.pendingTurnCompletion) return;
        if (turnId) {
            this.pendingTurnCompletion.turnId = turnId;
        }
    }

    private tryResolvePendingTurn(aborted: boolean, turnId: string | null, source: string): void {
        const pending = this.pendingTurnCompletion;
        resolveCodexPendingTurnLifecycle({
            pendingTurnId: pending?.turnId,
            notificationTurnId: turnId,
            aborted,
            source,
            resolve: (nextAborted, reason) => this.resolvePendingTurn(nextAborted, reason),
            logStale: (staleSource, notificationTurnId, pendingTurnId) => logger.debug(
                `[CodexAppServer] Ignoring ${staleSource} for turn ${notificationTurnId}; awaiting ${pendingTurnId}`,
            ),
        });
    }

    private async waitForTurnCompletion(timeoutMs: number): Promise<boolean> {
        return waitForCodexTurnCompletion({
            hasPending: () => this.hasPendingTurnCompletion(),
            timeoutMs,
        });
    }

    /**
     * Request turn interruption and optionally force-restart the app-server if
     * the turn does not settle within a short grace period.
     */
    async abortTurnWithFallback(opts?: {
        gracePeriodMs?: number;
        forceRestartOnTimeout?: boolean;
    }): Promise<{ hadActiveTurn: boolean; aborted: boolean; forcedRestart: boolean; resumedThread: boolean }> {
        return abortCodexTurnWithFallback({
            hasActiveTurn: () => this.hasPendingTurnCompletion(),
            interrupt: () => this.interruptTurn(),
            waitForCompletion: (gracePeriodMs) => this.waitForTurnCompletion(gracePeriodMs),
            defaultGracePeriodMs: CodexAppServerClient.ABORT_GRACE_MS,
            gracePeriodMs: opts?.gracePeriodMs,
            forceRestartOnTimeout: opts?.forceRestartOnTimeout,
            getPendingTurnId: () => this.pendingTurnCompletion?.turnId ?? this._turnId,
            reconnectAndResumeThread: () => this.reconnectAndResumeThread(),
            isRecoveredTurn: (turnId) => this.recoveredTurnIds.has(turnId),
            emitEvent: (event) => this.eventHandler?.(event),
            onForceRestart: (gracePeriodMs) => {
                logger.warn(`[CodexAppServer] interrupt did not settle turn in ${gracePeriodMs}ms; force-restarting app-server`);
            },
        });
    }

    /**
     * Send a user turn and wait for it to complete.
     * Returns when task_complete or turn_aborted is received.
     */
    async sendTurn(prompt: string, opts?: {
        clientUserMessageId?: string;
        model?: string;
        cwd?: string;
        approvalPolicy?: ApprovalPolicy;
        sandbox?: SandboxMode;
        effort?: ReasoningEffort;
        extraInputItems?: InputItem[];
    }): Promise<void> {
        await sendCodexTurn({
            threadId: this._threadId,
            buildParams: () => buildTurnStartParams(this._threadId!, prompt, opts),
            request: (params) => this.request('turn/start', params) as Promise<{ turn?: { id?: unknown } }>,
            setTurnId: (turnId) => { this._turnId = turnId; },
            setPendingTurnId: (turnId) => {
                if (this.pendingTurnCompletion) {
                    this.pendingTurnCompletion.turnId = turnId;
                }
            },
        });
    }

    /** Default timeout for waiting on turn completion (ms). 10 minutes. */
    private static readonly TURN_TIMEOUT_MS = 10 * 60 * 1000;

    /**
     * Send a user turn and wait for it to complete (task_complete or turn_aborted).
     * Returns { aborted: true } if the turn was aborted (user cancel, permission reject, etc.).
     */
    async sendTurnAndWait(prompt: string, opts?: {
        clientUserMessageId?: string;
        model?: string;
        cwd?: string;
        approvalPolicy?: ApprovalPolicy;
        sandbox?: SandboxMode;
        effort?: ReasoningEffort;
        extraInputItems?: InputItem[];
        turnTimeoutMs?: number;
    }): Promise<TurnCompletionResult> {
        const timeoutMs = opts?.turnTimeoutMs ?? CodexAppServerClient.TURN_TIMEOUT_MS;
        return runCodexSendTurnAndWait({
            pendingInterrupt: this.pendingInterrupt,
            timeoutMs,
            setPendingTurn: (resolve) => {
                this.pendingTurnCompletion = {
                    resolve,
                    turnId: null,
                };
            },
            clearPendingTurn: () => {
                this.pendingTurnCompletion = null;
            },
            resolveOnTimeout: () => {
                if (this.pendingTurnCompletion) {
                    logger.warn(`[CodexAppServer] Turn timed out after ${timeoutMs}ms — treating as abort`);
                    this.resolvePendingTurn(true, 'timeout');
                }
            },
            sendTurn: () => this.sendTurn(prompt, opts),
        });
    }

    async interruptTurn(): Promise<void> {
        if (!this._threadId) return;
        if (!this._turnId) {
            logger.debug('[CodexAppServer] interruptTurn: no active turnId, skipping');
            return;
        }
        this.pendingInterrupt = interruptCodexTurn({
            threadId: this._threadId,
            turnId: this._turnId,
            request: (params: InterruptConversationParams) => this.request('turn/interrupt', params),
            onError: (error) => {
                // Ignore if no turn is active
                logger.debug('[CodexAppServer] interruptTurn error (may be expected):', error);
            },
            onFinally: () => {
                this.pendingInterrupt = null;
            },
        });
        return this.pendingInterrupt;
    }

    hasSteerableActiveTurn(): boolean {
        return !!this._threadId && !!this._turnId && this.hasPendingTurnCompletion();
    }

    async steerActiveTurn(prompt: string, opts?: {
        clientUserMessageId?: string | null;
    }): Promise<{ steered: true; turnId: string } | { steered: false; reason: 'no-active-turn' | 'rejected'; error?: unknown }> {
        return steerCodexActiveTurn({
            threadId: this._threadId,
            turnId: this._turnId,
            hasPendingTurn: this.hasPendingTurnCompletion(),
            prompt,
            clientUserMessageId: opts?.clientUserMessageId,
            request: (params: SteerConversationParams) => this.request('turn/steer', params) as Promise<SteerConversationResponse>,
            onError: (error) => {
                logger.debug('[CodexAppServer] steerActiveTurn rejected, falling back to queued turn', error);
            },
        });
    }

    // ─── State queries ──────────────────────────────────────────

    hasActiveThread(): boolean {
        return this._threadId !== null;
    }

    /** Forget the current conversation so the next prompt creates a new thread. */
    clearThreadState(): void {
        clearCodexThreadState({
            threadId: this._threadId,
            turnId: this._turnId,
            resolvePendingTurn: (aborted, reason) => this.resolvePendingTurn(aborted, reason),
            setThreadId: (threadId) => { this._threadId = threadId; },
            setTurnId: (turnId) => { this._turnId = turnId; },
            setThreadDefaults: (defaults) => { this.threadDefaults = defaults; },
            completedTurnIds: this.completedTurnIds,
            disconnectedTurnIds: this.disconnectedTurnIds,
            recoveredTurnIds: this.recoveredTurnIds,
            rawFileChangesByItemId: this.rawFileChangesByItemId,
            onLog: (threadId, turnId) => logger.debug(
                `[CodexAppServer] Clearing thread state: thread=${threadId} turn=${turnId}`,
            ),
        });
    }

    // ─── JSON-RPC transport ─────────────────────────────────────

    /** Default timeout for RPC requests (ms). */
    private static readonly REQUEST_TIMEOUT_MS = 30_000;

    private request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown> {
        const timeout = timeoutMs ?? CodexAppServerClient.REQUEST_TIMEOUT_MS;
        return dispatchCodexRequest({
            method,
            params,
            timeoutMs: timeout,
            processEpoch: this.processEpoch,
            stdin: this.process?.stdin,
            nextId: () => this.nextId++,
            pending: this.pending,
            onWrite: (requestMethod, id) => logger.debug(`[CodexAppServer] → ${requestMethod} (id=${id})`),
        });
    }

    private notify(method: string, params?: unknown): void {
        dispatchCodexNotification({
            stdin: this.process?.stdin,
            method,
            params,
            onWrite: (writtenMethod) => logger.debug(`[CodexAppServer] → ${writtenMethod} (notification)`),
        });
    }

    private respond(id: number, result: unknown): void {
        dispatchCodexResponse({
            stdin: this.process?.stdin,
            id,
            result,
            onWrite: (responseId) => logger.debug(`[CodexAppServer] → response (id=${responseId})`),
        });
    }

    private handleLine(line: string, sourceEpoch: number = this.processEpoch): void {
        routeCodexInboundTransportLine({
            line,
            sourceEpoch,
            currentEpoch: this.processEpoch,
            pending: this.pending,
            onInvalidJson: (rawLine) => logger.debug('[CodexAppServer] Non-JSON line:', rawLine.substring(0, 200)),
            onIgnored: (rawLine) => logger.debug('[CodexAppServer] Unhandled transport message:', rawLine.substring(0, 300)),
            onStaleResponse: (id) => logger.debug(`[CodexAppServer] Ignoring response from stale epoch for id=${id}`),
            onServerRequest: (id, method, params) => this.handleServerRequest(id, method, params),
            onServerRequestError: (error) => logger.debug('[CodexAppServer] Error handling server request:', error),
            onNotification: (method, params) => this.handleNotification(method, params),
        });
    }

    private createApprovalResponder(id: number, cancelResult: unknown): (result: unknown) => void {
        return createPendingApprovalResponder({
            id,
            cancelResult,
            pending: this.pendingApprovalResponses,
            respond: (responseId, result) => this.respond(responseId, result),
        });
    }

    private cancelPendingApprovals(): void {
        const cancelled = cancelPendingApprovalResponses(this.pendingApprovalResponses);
        if (cancelled > 0) {
            logger.debug(`[CodexAppServer] Cancelled ${cancelled} pending approval(s)`);
        }
    }

    private async handleServerRequest(id: number, method: string, params: any): Promise<void> {
        await handleCodexServerRequestLifecycle({
            id,
            method,
            params,
            rawFileChangesByItemId: this.rawFileChangesByItemId,
            createApprovalResponder: (responseId, cancelResult) => this.createApprovalResponder(responseId, cancelResult),
            handleApproval: (approval) => this.handleApproval(approval),
            respondUnknown: (requestId, requestMethod) => {
                logger.debug(`[CodexAppServer] Unknown server request: ${requestMethod}`);
                this.respond(requestId, {});
            },
        });
    }

    private async handleApproval(params: Parameters<ApprovalHandler>[0]): Promise<ReviewDecision> {
        return resolveCodexApproval(
            this.approvalHandler,
            params,
            (error) => logger.debug('[CodexAppServer] Approval handler error:', error),
        );
    }

    private handleNotification(method: string, params: any): void {
        handleCodexNotificationLifecycle({
            method,
            params,
            getProtocol: () => this.notificationProtocol,
            setProtocol: (protocol) => { this.notificationProtocol = protocol; },
            getTurnId: () => this._turnId,
            setTurnId: (turnId) => { this._turnId = turnId; },
            hasPendingTurn: () => this.pendingTurnCompletion !== null,
            markPendingTurnStarted: (turnId) => this.markPendingTurnStarted(turnId),
            emitRawTurnCompletion: (turnId, status, error, source) => this.emitRawTurnCompletion(turnId, status, error, source),
            rememberCompletedTurnId: (turnId) => this.rememberCompletedTurnId(turnId),
            tryResolvePendingTurn: (aborted, turnId, source) => this.tryResolvePendingTurn(aborted, turnId, source),
            rawFileChangesByItemId: this.rawFileChangesByItemId,
            emit: (event) => this.eventHandler?.(event),
            logLifecycle: (lifecycleMethod) => logger.debug(`[CodexAppServer] Lifecycle notification: ${lifecycleMethod}`),
            logMcp: (payload) => logger.debug(`[CodexAppServer] mcpServer startup status:`, payload),
            logUnhandled: (notificationMethod) => logger.debug(`[CodexAppServer] Notification: ${notificationMethod}`),
            logRaw: (rawMethod) => logger.debug(`[CodexAppServer] Raw notification: ${rawMethod}`),
        });
    }
}
