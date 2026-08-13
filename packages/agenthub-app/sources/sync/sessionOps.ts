/** Session-scoped RPC, lifecycle, and archive operations. */
import { apiSocket } from './apiSocket';
import type { RpcCallOptions } from './apiSocket';
import { sync } from './sync';
import type { Session } from './storageTypes';
import { httpClient } from './authenticatedHttpClient';
import type {
    RpcGetDirectoryTreeRequest as SessionGetDirectoryTreeRequest,
    RpcGetDirectoryTreeResponse as SessionGetDirectoryTreeResponse,
    RpcListDirectoryRequest as SessionListDirectoryRequest,
    RpcListDirectoryResponse as SessionListDirectoryResponse,
    RpcReadFileRequest as SessionReadFileRequest,
    RpcReadFileResponse as SessionReadFileResponse,
    RpcRipgrepRequest as SessionRipgrepRequest,
    RpcRipgrepResponse as SessionRipgrepResponse,
    RpcWriteFileRequest as SessionWriteFileRequest,
    RpcWriteFileResponse as SessionWriteFileResponse,
    RpcRequestFor,
    RpcResponseFor,
} from '@artsum/agenthub-wire';

interface SessionPermissionRequest {
    id: string;
    approved: boolean;
    reason?: string;
    mode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
    allowTools?: string[];
    updatedInput?: Record<string, unknown>;
    decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort';
}
interface SessionModeChangeRequest { to: 'remote' | 'local' }
interface SessionGoalActionRequest { action: 'clear' | 'stop' | 'edit'; objective?: string }
interface SessionBashRequest { command: string; cwd?: string; timeout?: number }
interface SessionBashResponse {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    error?: string;
}
interface SessionKillResponse { success: boolean; message: string }

export async function sessionAbort(sessionId: string): Promise<void> {
    await apiSocket.sessionRPC(sessionId, 'abort', {
        reason: `The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.`
    });
}

/**
 * Allow a permission request
 */
export async function sessionAllow(sessionId: string, id: string, mode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan', allowedTools?: string[], decision?: 'approved' | 'approved_for_session', updatedInput?: Record<string, unknown>): Promise<void> {
    const request: SessionPermissionRequest = { id, approved: true, mode, allowTools: allowedTools, decision, updatedInput };
    await apiSocket.sessionRPC(sessionId, 'permission', request);
}

/**
 * Deny a permission request
 */
export async function sessionDeny(sessionId: string, id: string, mode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan', allowedTools?: string[], decision?: 'denied' | 'abort'): Promise<void> {
    const request: SessionPermissionRequest = { id, approved: false, mode, allowTools: allowedTools, decision };
    await apiSocket.sessionRPC(sessionId, 'permission', request);
}

/**
 * Push a permission-mode change to the agent's in-flight turn.
 *
 * Normally a mode toggle only rides along as metadata on the next user message.
 * This RPC applies the new mode to the currently running query immediately (e.g.
 * switching to yolo mid-turn). Fire-and-forget: only meaningful while the agent
 * is remote and actively thinking; a local/idle session simply has no handler.
 */
export async function sessionPermissionMode(sessionId: string, mode: string): Promise<boolean> {
    try {
        const response = await apiSocket.sessionRPC<{ applied: boolean }, { mode: string }>(
            sessionId,
            'permission-mode',
            { mode },
        );
        return !!response?.applied;
    } catch {
        // No handler (local/idle session) or RPC failure — the mode is still
        // persisted locally and will apply on the next message.
        return false;
    }
}

/**
 * Request mode change for a session
 */
export async function sessionSwitch(sessionId: string, to: 'remote' | 'local'): Promise<boolean> {
    const request: SessionModeChangeRequest = { to };
    const response = await apiSocket.sessionRPC<boolean, SessionModeChangeRequest>(
        sessionId,
        'switch',
        request,
    );
    return response === true;
}

/**
 * Request an agent-owned goal action.
 */
export async function sessionGoalAction(
    sessionId: string,
    action: SessionGoalActionRequest['action'],
    objective?: string,
): Promise<void> {
    await apiSocket.sessionRPC(sessionId, 'goal-action', {
        action,
        ...(objective !== undefined ? { objective } : {}),
    } satisfies SessionGoalActionRequest);
}

/**
 * Execute a bash command in the session
 */
export async function sessionBash(sessionId: string, request: SessionBashRequest): Promise<SessionBashResponse> {
    try {
        const response = await apiSocket.sessionRPC<SessionBashResponse, SessionBashRequest>(
            sessionId,
            'bash',
            request
        );
        return response;
    } catch (error) {
        return {
            success: false,
            stdout: '',
            stderr: error instanceof Error ? error.message : 'Unknown error',
            exitCode: -1,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

export async function sessionExec(
    sessionId: string,
    request: RpcRequestFor<'exec'>,
): Promise<RpcResponseFor<'exec'>> {
    try {
        return await apiSocket.sessionRPC<RpcResponseFor<'exec'>, RpcRequestFor<'exec'>>(
            sessionId,
            'exec',
            request,
        );
    } catch (error) {
        return {
            success: false,
            stdout: '',
            stderr: error instanceof Error ? error.message : 'Unknown error',
            exitCode: -1,
        };
    }
}

/**
 * Read a file from the session
 */
export async function sessionReadFile(
    sessionId: string,
    path: string,
    options?: number | { maxSize?: number; offset?: number; length?: number; signal?: AbortSignal },
): Promise<SessionReadFileResponse> {
    try {
        const request: SessionReadFileRequest = typeof options === 'number'
            ? { path, maxSize: options }
            : {
                path,
                ...(options?.maxSize !== undefined ? { maxSize: options.maxSize } : {}),
                ...(options?.offset !== undefined ? { offset: options.offset } : {}),
                ...(options?.length !== undefined ? { length: options.length } : {}),
                ...(!options ? { maxSize: 2 * 1024 * 1024 } : {}),
            };
        const signal = typeof options === 'object' ? options.signal : undefined;
        const response = signal
            ? await apiSocket.sessionRPC<SessionReadFileResponse, SessionReadFileRequest>(
                sessionId, 'readFile', request, { signal },
            )
            : await apiSocket.sessionRPC<SessionReadFileResponse, SessionReadFileRequest>(
                sessionId, 'readFile', request,
            );
        return response;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Write a file to the session
 */
export async function sessionWriteFile(
    sessionId: string,
    path: string,
    content: string,
    expectedHash?: string | null
): Promise<SessionWriteFileResponse> {
    try {
        const request: SessionWriteFileRequest = { path, content, expectedHash };
        const response = await apiSocket.sessionRPC<SessionWriteFileResponse, SessionWriteFileRequest>(
            sessionId,
            'writeFile',
            request
        );
        return response;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * List directory contents in the session
 */
export async function sessionListDirectory(sessionId: string, path: string): Promise<SessionListDirectoryResponse> {
    try {
        const request: SessionListDirectoryRequest = { path };
        const response = await apiSocket.sessionRPC<SessionListDirectoryResponse, SessionListDirectoryRequest>(
            sessionId,
            'listDirectory',
            request
        );
        return response;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Get directory tree from the session
 */
export async function sessionGetDirectoryTree(
    sessionId: string,
    path: string,
    maxDepth: number
): Promise<SessionGetDirectoryTreeResponse> {
    try {
        const request: SessionGetDirectoryTreeRequest = { path, maxDepth };
        const response = await apiSocket.sessionRPC<SessionGetDirectoryTreeResponse, SessionGetDirectoryTreeRequest>(
            sessionId,
            'getDirectoryTree',
            request
        );
        return response;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

export async function sessionRPCAvailable(sessionId: string, method: string): Promise<boolean> {
    try {
        return await apiSocket.sessionRPCAvailable(sessionId, method);
    } catch {
        return false;
    }
}

/**
 * Request a daemon-managed session stop and preserve its structured lifecycle
 * state for the caller. Unlike `sessionKill`, this path reports
 * `stopping`/`exited`/`timeout` instead of reducing the result to a boolean.
 */
export async function machineStopSession(
    machineId: string,
    sessionId: string,
    options?: RpcCallOptions,
): Promise<RpcResponseFor<'stop-session'>> {
    const params: RpcRequestFor<'stop-session'> = { sessionId };
    return options
        ? await apiSocket.machineRPC<RpcResponseFor<'stop-session'>, RpcRequestFor<'stop-session'>>(
            machineId,
            'stop-session',
            params,
            options,
        )
        : await apiSocket.machineRPC<RpcResponseFor<'stop-session'>, RpcRequestFor<'stop-session'>>(
            machineId,
            'stop-session',
            params,
        );
}

export type SessionArchiveStopResult =
    | { state: 'stopping' | 'exited' | 'timeout' | 'not-found'; source: 'daemon' }
    | { state: 'exited'; source: 'session-rpc' }
    | { state: 'archived'; source: 'server' };

type DaemonArchiveStopResult = Extract<SessionArchiveStopResult, { source: 'daemon' }>;

export interface SessionArchiveStopOptions {
    onDaemonState?: (result: DaemonArchiveStopResult) => void;
}

const DAEMON_STOP_OBSERVATION_INTERVAL_MS = 250;
const DAEMON_STOP_OBSERVATION_POLL_TIMEOUT_MS = 1_500;
const DAEMON_STOP_OBSERVATION_TIMEOUT_MS = 15_000;

/**
 * Project a daemon stop observation while the authoritative Server archive is
 * still pending. This intentionally leaves active/thinking untouched: only a
 * runner or the completed archive action may claim those terminal facts.
 */
export function applyArchiveStopObservation(
    session: Session,
    result: DaemonArchiveStopResult,
    now = Date.now(),
): Session {
    const lifecycleState = result.state === 'stopping' ? 'archiveRequested' : result.state;
    return {
        ...session,
        metadata: session.metadata
            ? { ...session.metadata, lifecycleState, lifecycleStateSince: now }
            : session.metadata,
    };
}

/**
 * Apply the local projection after an intentional archive action completes.
 * `requestSessionArchiveStop` only returns after the Server archive endpoint
 * succeeds, so the workspace lifecycle is terminal `archived` even when the
 * separately returned daemon stop observation was stopping/timeout/not-found.
 * Runner-owned metadata is copied rather than mutated.
 */
export function applyArchiveStopProjection(
    session: Session,
    _result: SessionArchiveStopResult,
    now = Date.now(),
): Session {
    return {
        ...session,
        active: false,
        activeAt: now,
        thinking: false,
        thinkingAt: now,
        metadata: session.metadata
            ? { ...session.metadata, lifecycleState: 'archived', lifecycleStateSince: now }
            : session.metadata,
    };
}

/**
 * Stop a session through the daemon when its machine is known, preserving the
 * structured state. Older/offline runners fall back to the legacy kill and
 * server archive path so existing sessions remain operable.
 */
export async function requestSessionArchiveStop(
    sessionId: string,
    machineId?: string,
    options: SessionArchiveStopOptions = {},
): Promise<SessionArchiveStopResult> {
    if (machineId) {
        let result: RpcResponseFor<'stop-session'> | undefined;
        try {
            result = await machineStopSession(machineId, sessionId);
        } catch {
            // Fall through to the legacy session RPC for offline/old daemons.
            result = undefined;
        }
        if (result && (
            result.state === 'stopping'
            || result.state === 'exited'
            || result.state === 'timeout'
            || result.state === 'not-found'
        )) {
            let daemonState: DaemonArchiveStopResult = { state: result.state, source: 'daemon' };
            options.onDaemonState?.(daemonState);

            // The first daemon response normally reports `stopping`. UI
            // consumers need the later terminal observation as well, so keep
            // polling the machine-scoped RPC while the graceful-stop window is
            // active. Calls without an observer retain the existing one-shot
            // behavior, and an offline daemon falls through to Server archive.
            if (daemonState.state === 'stopping' && options.onDaemonState) {
                const observationDeadline = Date.now() + DAEMON_STOP_OBSERVATION_TIMEOUT_MS;
                while (daemonState.state === 'stopping' && Date.now() < observationDeadline) {
                    await new Promise<void>((resolve) => {
                        setTimeout(resolve, DAEMON_STOP_OBSERVATION_INTERVAL_MS);
                    });

                    let nextResult: RpcResponseFor<'stop-session'>;
                    try {
                        nextResult = await machineStopSession(machineId, sessionId, {
                            timeoutMs: DAEMON_STOP_OBSERVATION_POLL_TIMEOUT_MS,
                        });
                    } catch {
                        // A reconnect or tunnel can lose one acknowledgement at
                        // the exact terminal boundary. Keep retrying within the
                        // existing total deadline instead of letting a single
                        // transport failure hide the daemon's terminal state.
                        continue;
                    }

                    if (
                        nextResult.state !== 'stopping'
                        && nextResult.state !== 'exited'
                        && nextResult.state !== 'timeout'
                        && nextResult.state !== 'not-found'
                    ) {
                        break;
                    }

                    const nextDaemonState: DaemonArchiveStopResult = {
                        state: nextResult.state,
                        source: 'daemon',
                    };
                    if (nextDaemonState.state !== daemonState.state) {
                        options.onDaemonState(nextDaemonState);
                    }
                    daemonState = nextDaemonState;
                }
            }

            // The archive action is user-intentional: make the server
            // projection inactive after the bounded graceful-stop observation.
            // The daemon/runner's own final event remains idempotent and can
            // converge metadata if the App disappears during that window.
            const archiveResult = await sessionArchive(sessionId);
            if (!archiveResult.success) {
                throw new Error(archiveResult.message || 'Failed to archive session');
            }
            return daemonState;
        }
    }

    const killResult = await sessionKill(sessionId);
    if (killResult.success) {
        const archiveResult = await sessionArchive(sessionId);
        if (!archiveResult.success) {
            throw new Error(archiveResult.message || 'Failed to archive session');
        }
        return { state: 'exited', source: 'session-rpc' };
    }

    const archiveResult = await sessionArchive(sessionId);
    if (!archiveResult.success) {
        throw new Error(archiveResult.message || 'Failed to archive session');
    }
    return { state: 'archived', source: 'server' };
}

/**
 * Run ripgrep in the session
 */
export async function sessionRipgrep(
    sessionId: string,
    args: string[],
    cwd?: string
): Promise<SessionRipgrepResponse> {
    try {
        const request: SessionRipgrepRequest = { args, cwd };
        const response = await apiSocket.sessionRPC<SessionRipgrepResponse, SessionRipgrepRequest>(
            sessionId,
            'ripgrep',
            request
        );
        return response;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Kill the session process immediately
 */
export async function sessionKill(sessionId: string): Promise<SessionKillResponse> {
    try {
        const response = await apiSocket.sessionRPC<SessionKillResponse, {}>(
            sessionId,
            'killSession',
            {}
        );
        return response;
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Archive a session by deactivating it on the server.
 * Use this when the CLI process is already dead and sessionKill can't reach it.
 */
export async function sessionArchive(sessionId: string): Promise<{ success: boolean; message?: string }> {
    try {
        const credentials = sync.getCredentials();
        if (!credentials) return { success: false, message: 'Not authenticated' };
        await httpClient.request(credentials, `/v1/sessions/${encodeURIComponent(sessionId)}/archive`, { method: 'POST' });
        return { success: true };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Permanently delete a session from the server
 * This will remove the session and all its associated data (messages, usage reports, access keys)
 * The session should be inactive/archived before deletion
 */
export async function sessionDelete(sessionId: string): Promise<{ success: boolean; message?: string }> {
    try {
        const credentials = sync.getCredentials();
        if (!credentials) return { success: false, message: 'Not authenticated' };
        await httpClient.request(credentials, `/v1/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
        return { success: true };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
