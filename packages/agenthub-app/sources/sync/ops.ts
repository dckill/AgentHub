/**
 * Session operations for remote procedure calls
 * Provides strictly typed functions for all session-related RPC operations
 */

import { apiSocket } from './apiSocket';
import type { RpcCallOptions } from './apiSocket';
import { sync } from './sync';
import type { MachineMetadata, Session } from './storageTypes';
import type { SupportedClientAgent } from './agentTypes';
import { httpClient } from './authenticatedHttpClient';
import type {
    RpcCreateDirectoryRequest as CreateDirectoryRequest,
    RpcCreateDirectoryResponse as CreateDirectoryResponse,
    RpcDeleteFileRequest as DeleteFileRequest,
    RpcDeleteFileResponse as DeleteFileResponse,
    RpcDirectoryEntry as DirectoryEntry,
    RpcGetDirectoryTreeRequest as SessionGetDirectoryTreeRequest,
    RpcGetDirectoryTreeResponse as SessionGetDirectoryTreeResponse,
    RpcListDirectoryRequest as SessionListDirectoryRequest,
    RpcListDirectoryResponse as SessionListDirectoryResponse,
    RpcReadFileRequest as SessionReadFileRequest,
    RpcReadFileResponse as SessionReadFileResponse,
    RpcRipgrepRequest as SessionRipgrepRequest,
    RpcRipgrepResponse as SessionRipgrepResponse,
    RpcTreeNode as TreeNode,
    RpcWriteFileRequest as SessionWriteFileRequest,
    RpcWriteFileResponse as SessionWriteFileResponse,
    RpcRequestFor,
    RpcResponseFor,
    RpcSpawnSessionResult,
    RpcClaudeForkResult,
    RpcClaudeRewindPoint,
    RpcClaudeRewindResult,
    RpcCodexForkResult,
    RpcCodexRewindPoint,
    RpcCodexRewindResult,
    RpcCodexModelsResult,
} from '@artsum/agenthub-wire';

// Strict type definitions for all operations

// Permission operation types
interface SessionPermissionRequest {
    id: string;
    approved: boolean;
    reason?: string;
    mode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
    allowTools?: string[];
    updatedInput?: Record<string, unknown>;
    decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort';
}

// Mode change operation types
interface SessionModeChangeRequest {
    to: 'remote' | 'local';
}

interface SessionGoalActionRequest {
    action: 'clear' | 'stop' | 'edit';
    objective?: string;
}

// Bash operation types
interface SessionBashRequest {
    command: string;
    cwd?: string;
    timeout?: number;
}

interface SessionBashResponse {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    error?: string;
}

// Kill session operation types
interface SessionKillRequest {
    // No parameters needed
}

interface SessionKillResponse {
    success: boolean;
    message: string;
}

// Response types for spawn session
export type SpawnSessionResult = RpcSpawnSessionResult;

// Options for spawning a session
export interface SpawnSessionOptions {
    machineId: string;
    directory: string;
    approvedNewDirectoryCreation?: boolean;
    token?: string;
    agent?: SupportedClientAgent;
    permissionMode?: string;
    model?: string;
    environmentVariables?: Record<string, string>;
    /**
     * If set, the daemon spawns the agent with `--resume <id>` so the new
     * AgentHub session attaches to a pre-existing on-disk Claude conversation
     * file. Used by the session fork / duplicate flow.
     */
    resumeClaudeSessionId?: string;
    /**
     * If set, the daemon spawns Codex with `--resume <id>` so the new AgentHub
     * session attaches to an app-server thread created by fork / duplicate.
     */
    resumeCodexThreadId?: string;
    /** Mirror an official Claude Code transcript first; resume only when the user sends a message. */
    officialMirrorClaudeSessionId?: string;
    /** Mirror an official Codex thread first; resume only when the user sends a message. */
    officialMirrorCodexThreadId?: string;
    /** AgentHub session id this fork was branched from. */
    parentSessionId?: string;
    /** AgentHub message id used as the rewind point. */
    forkedFromMessageId?: string;
    /** Marks the spawned fork as a hidden side chat of parentSessionId. */
    isSideChat?: boolean;
}

export interface ClaudeForkSessionOptions {
    machineId: string;
    directory: string;
    claudeSessionId: string;
}

export type ClaudeForkSessionResult = RpcClaudeForkResult;

export type ClaudeRewindPoint = RpcClaudeRewindPoint;

export type ClaudeListRewindPointsResult = RpcClaudeRewindResult;

export interface CodexForkThreadOptions {
    machineId: string;
    directory: string;
    codexThreadId: string;
}

export type CodexForkThreadResult = RpcCodexForkResult;

export type CodexRewindPoint = RpcCodexRewindPoint;

export type CodexListRewindPointsResult = RpcCodexRewindResult;

export interface ResumeSessionOptions {
    machineId: string;
    sessionId: string;
}

// Exported session operation functions

/**
 * Spawn a new remote session on a specific machine
 */
export async function machineSpawnNewSession(options: SpawnSessionOptions): Promise<SpawnSessionResult> {

    const {
        machineId,
        directory,
        approvedNewDirectoryCreation = false,
        token,
        agent,
        permissionMode,
        model,
        environmentVariables,
        resumeClaudeSessionId,
        resumeCodexThreadId,
        officialMirrorClaudeSessionId,
        officialMirrorCodexThreadId,
        parentSessionId,
        forkedFromMessageId,
        isSideChat,
    } = options;

    try {
        const result = await apiSocket.machineRPC<SpawnSessionResult, {
            type: 'spawn-in-directory'
            directory: string
            approvedNewDirectoryCreation?: boolean,
            token?: string,
            agent?: SupportedClientAgent,
            permissionMode?: string,
            model?: string,
            environmentVariables?: Record<string, string>,
            resumeClaudeSessionId?: string,
            resumeCodexThreadId?: string,
            officialMirrorClaudeSessionId?: string,
            officialMirrorCodexThreadId?: string,
            parentSessionId?: string,
            forkedFromMessageId?: string,
            isSideChat?: boolean,
        }>(
            machineId,
            'spawn-agenthub-session',
            {
                type: 'spawn-in-directory',
                directory,
                approvedNewDirectoryCreation,
                token,
                agent,
                permissionMode,
                model,
                environmentVariables,
                resumeClaudeSessionId,
                resumeCodexThreadId,
                officialMirrorClaudeSessionId,
                officialMirrorCodexThreadId,
                parentSessionId,
                forkedFromMessageId,
                isSideChat,
            }
        );
        return result;
    } catch (error) {
        // Handle RPC errors
        return {
            type: 'error',
            errorMessage: error instanceof Error ? error.message : 'Failed to spawn session'
        };
    }
}

export async function machineListCodexModels(
    machineId: string,
    directory: string,
    environmentVariables?: Record<string, string>,
): Promise<RpcCodexModelsResult> {
    return apiSocket.machineRPC(
        machineId,
        'codex-list-models',
        {
            directory,
            ...(environmentVariables ? { environmentVariables } : {}),
        },
        { timeoutMs: 20_000 },
    );
}

export async function claudeForkSession(options: ClaudeForkSessionOptions): Promise<ClaudeForkSessionResult> {
    const { machineId, directory, claudeSessionId } = options;
    try {
        const result = await apiSocket.machineRPC<ClaudeForkSessionResult, {
            directory: string;
            claudeSessionId: string;
        }>(
            machineId,
            'claude-fork-session',
            { directory, claudeSessionId },
        );
        return result;
    } catch (error) {
        return {
            type: 'error',
            errorMessage: error instanceof Error ? error.message : 'Failed to fork session',
        };
    }
}

export async function claudeListRewindPoints(
    options: ClaudeForkSessionOptions,
): Promise<ClaudeListRewindPointsResult> {
    const { machineId, directory, claudeSessionId } = options;
    try {
        const result = await apiSocket.machineRPC<ClaudeListRewindPointsResult, {
            directory: string;
            claudeSessionId: string;
        }>(
            machineId,
            'claude-list-rewind-points',
            { directory, claudeSessionId },
        );
        return result;
    } catch (error) {
        return {
            type: 'error',
            errorMessage: error instanceof Error ? error.message : 'Failed to list rewind points',
        };
    }
}

export async function claudeDuplicateSession(
    options: ClaudeForkSessionOptions & { cutAfterUuid: string },
): Promise<ClaudeForkSessionResult> {
    const { machineId, directory, claudeSessionId, cutAfterUuid } = options;
    try {
        const result = await apiSocket.machineRPC<ClaudeForkSessionResult, {
            directory: string;
            claudeSessionId: string;
            cutAfterUuid: string;
        }>(
            machineId,
            'claude-duplicate-session',
            { directory, claudeSessionId, cutAfterUuid },
        );
        return result;
    } catch (error) {
        return {
            type: 'error',
            errorMessage: error instanceof Error ? error.message : 'Failed to duplicate session',
        };
    }
}

export async function codexForkThread(options: CodexForkThreadOptions): Promise<CodexForkThreadResult> {
    const { machineId, directory, codexThreadId } = options;
    try {
        const result = await apiSocket.machineRPC<CodexForkThreadResult, {
            directory: string;
            codexThreadId: string;
        }>(
            machineId,
            'codex-fork-thread',
            { directory, codexThreadId },
        );
        return result;
    } catch (error) {
        return {
            type: 'error',
            errorMessage: error instanceof Error ? error.message : 'Failed to fork Codex thread',
        };
    }
}

export async function codexDuplicateThread(
    options: CodexForkThreadOptions & { cutAfterItemId: string },
): Promise<CodexForkThreadResult> {
    const { machineId, directory, codexThreadId, cutAfterItemId } = options;
    try {
        const result = await apiSocket.machineRPC<CodexForkThreadResult, {
            directory: string;
            codexThreadId: string;
            cutAfterItemId: string;
        }>(
            machineId,
            'codex-duplicate-thread',
            { directory, codexThreadId, cutAfterItemId },
        );
        return result;
    } catch (error) {
        return {
            type: 'error',
            errorMessage: error instanceof Error ? error.message : 'Failed to duplicate Codex thread',
        };
    }
}

export async function codexListRewindPoints(
    options: CodexForkThreadOptions,
): Promise<CodexListRewindPointsResult> {
    const { machineId, directory, codexThreadId } = options;
    try {
        const result = await apiSocket.machineRPC<CodexListRewindPointsResult, {
            directory: string;
            codexThreadId: string;
        }>(
            machineId,
            'codex-list-rewind-points',
            { directory, codexThreadId },
        );
        return result;
    } catch (error) {
        return {
            type: 'error',
            errorMessage: error instanceof Error ? error.message : 'Failed to list Codex rewind points',
        };
    }
}

export async function machineResumeSession(options: ResumeSessionOptions & { model?: string; permissionMode?: string }): Promise<SpawnSessionResult> {
    const { machineId, sessionId, model, permissionMode } = options;

    try {
        const result = await apiSocket.machineRPC<SpawnSessionResult, { sessionId: string; model?: string; permissionMode?: string }>(
            machineId,
            'resume-agenthub-session',
            { sessionId, model, permissionMode },
        );
        return result;
    } catch (error) {
        return {
            type: 'error',
            errorMessage: error instanceof Error ? error.message : 'Failed to resume session',
        };
    }
}

/**
 * Permanently remove a machine from the server. Sessions spawned by the
 * machine are preserved; only the Machine row and its AccessKeys are deleted.
 */
export async function machineDelete(machineId: string): Promise<{ success: boolean; message?: string }> {
    try {
        const credentials = sync.getCredentials();
        if (!credentials) return { success: false, message: 'Not authenticated' };
        await httpClient.request(credentials, `/v1/machines/${encodeURIComponent(machineId)}`, { method: 'DELETE' });
        return { success: true };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Stop the daemon on a specific machine
 */
export async function machineStopDaemon(machineId: string): Promise<{ message: string }> {
    const result = await apiSocket.machineRPC<{ message: string }, {}>(
        machineId,
        'stop-daemon',
        {}
    );
    return result;
}

export async function machineCheckCliUpdate(machineId: string): Promise<RpcResponseFor<'check-cli-update'>> {
    return apiSocket.machineRPC(machineId, 'check-cli-update', {});
}

export async function machineUpdateCli(
    machineId: string,
    version?: string,
): Promise<RpcResponseFor<'update-cli'>> {
    return apiSocket.machineRPC(machineId, 'update-cli', version ? { version } : {});
}

export async function machineRollbackCli(machineId: string): Promise<RpcResponseFor<'rollback-cli'>> {
    return apiSocket.machineRPC(machineId, 'rollback-cli', {});
}

export async function machineGetSystemMetrics(
    machineId: string,
    options?: RpcCallOptions,
): Promise<RpcResponseFor<'get-system-metrics'>> {
    return apiSocket.machineRPC(machineId, 'get-system-metrics', {}, options);
}

/**
 * Execute a bash command on a specific machine
 */
export async function machineBash(
    machineId: string,
    command: string,
    cwd: string
): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
}> {
    try {
        const result = await apiSocket.machineRPC<{
            success: boolean;
            stdout: string;
            stderr: string;
            exitCode: number;
        }, {
            command: string;
            cwd: string;
        }>(
            machineId,
            'bash',
            { command, cwd }
        );
        return result;
    } catch (error) {
        return {
            success: false,
            stdout: '',
            stderr: error instanceof Error ? error.message : 'Unknown error',
            exitCode: -1
        };
    }
}

export async function machineExec(
    machineId: string,
    request: RpcRequestFor<'exec'>,
): Promise<RpcResponseFor<'exec'>> {
    try {
        return await apiSocket.machineRPC<RpcResponseFor<'exec'>, RpcRequestFor<'exec'>>(
            machineId,
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
 * List directory contents on a remote machine (machine-scoped, no session required)
 */
export async function machineListDirectory(
    machineId: string,
    path: string
): Promise<SessionListDirectoryResponse> {
    try {
        const result = await apiSocket.machineRPC<SessionListDirectoryResponse, SessionListDirectoryRequest>(
            machineId,
            'listDirectory',
            { path }
        );
        return result;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

export async function machineCreateDirectory(
    machineId: string,
    path: string
): Promise<CreateDirectoryResponse> {
    try {
        const result = await apiSocket.machineRPC<CreateDirectoryResponse, CreateDirectoryRequest>(
            machineId,
            'createDirectory',
            { path }
        );
        return result;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Get directory tree on a remote machine (machine-scoped, no session required)
 */
export async function machineGetDirectoryTree(
    machineId: string,
    path: string,
    maxDepth: number
): Promise<SessionGetDirectoryTreeResponse> {
    try {
        const result = await apiSocket.machineRPC<SessionGetDirectoryTreeResponse, SessionGetDirectoryTreeRequest>(
            machineId,
            'getDirectoryTree',
            { path, maxDepth }
        );
        return result;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

export async function machineRPCAvailable(machineId: string, method: string): Promise<boolean> {
    try {
        return await apiSocket.machineRPCAvailable(machineId, method);
    } catch {
        return false;
    }
}

export async function machineReadFile(
    machineId: string,
    path: string,
    options?: { maxSize?: number; offset?: number; length?: number; signal?: AbortSignal }
): Promise<SessionReadFileResponse> {
    try {
        const request: SessionReadFileRequest = {
            path,
            ...(options?.maxSize !== undefined ? { maxSize: options.maxSize } : {}),
            ...(options?.offset !== undefined ? { offset: options.offset } : {}),
            ...(options?.length !== undefined ? { length: options.length } : {}),
        };
        const result = options?.signal
            ? await apiSocket.machineRPC<SessionReadFileResponse, SessionReadFileRequest>(
                machineId, 'readFile', request, { signal: options.signal },
            )
            : await apiSocket.machineRPC<SessionReadFileResponse, SessionReadFileRequest>(
                machineId, 'readFile', request,
            );
        return result;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

export async function machineDeleteFile(
    machineId: string,
    path: string,
): Promise<DeleteFileResponse> {
    try {
        const result = await apiSocket.machineRPC<DeleteFileResponse, DeleteFileRequest>(
            machineId,
            'deleteFile',
            { path }
        );
        return result;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Update machine metadata with optimistic concurrency control and automatic retry
 */
export async function machineUpdateMetadata(
    machineId: string,
    metadata: MachineMetadata,
    expectedVersion: number,
    maxRetries: number = 3
): Promise<{ version: number; metadata: string }> {
    let currentVersion = expectedVersion;
    let currentMetadata = { ...metadata };
    let retryCount = 0;

    const machineEncryption = sync.encryption.getMachineEncryption(machineId);
    if (!machineEncryption) {
        throw new Error(`Machine encryption not found for ${machineId}`);
    }

    while (retryCount < maxRetries) {
        const encryptedMetadata = await machineEncryption.encryptRaw(currentMetadata);

        const result = await apiSocket.emitWithAck<{
            result: 'success' | 'version-mismatch' | 'error';
            version?: number;
            metadata?: string;
            message?: string;
        }>('machine-update-metadata', {
            machineId,
            metadata: encryptedMetadata,
            expectedVersion: currentVersion
        });

        if (result.result === 'success') {
            return {
                version: result.version!,
                metadata: result.metadata!
            };
        } else if (result.result === 'version-mismatch') {
            // Get the latest version and metadata from the response
            currentVersion = result.version!;
            const latestMetadata = await machineEncryption.decryptRaw(result.metadata!) as MachineMetadata;

            // Merge our changes with the latest metadata
            // Preserve the displayName we're trying to set, but use latest values for other fields
            currentMetadata = {
                ...latestMetadata,
                displayName: metadata.displayName // Keep our intended displayName change
            };

            retryCount++;

            // If we've exhausted retries, throw error
            if (retryCount >= maxRetries) {
                throw new Error(`Failed to update after ${maxRetries} retries due to version conflicts`);
            }

            // Otherwise, loop will retry with updated version and merged metadata
        } else {
            throw new Error(result.message || 'Failed to update machine metadata');
        }
    }

    throw new Error('Unexpected error in machineUpdateMetadata');
}

/**
 * Abort the current session operation
 */

export * from './sessionOps';

type ClaudeForkSource = {
    kind?: 'claude';
    sessionId: string;
    machineId: string;
    directory: string;
    claudeSessionId: string;
};

type CodexForkSource = {
    kind: 'codex';
    sessionId: string;
    machineId: string;
    directory: string;
    codexThreadId: string;
};

export type ForkSource = ClaudeForkSource | CodexForkSource;

type ForkOptions = {
    cutAfterUuid?: string;
    cutAfterItemId?: string;
    forkedFromMessageId?: string;
    isSideChat?: boolean;
};

export async function forkAndSpawn(
    source: ForkSource,
    opts: ForkOptions = {},
): Promise<SpawnSessionResult> {
    if (source.kind === 'codex') {
        const forkResult = opts.cutAfterItemId
            ? await codexDuplicateThread({
                machineId: source.machineId,
                directory: source.directory,
                codexThreadId: source.codexThreadId,
                cutAfterItemId: opts.cutAfterItemId,
            })
            : await codexForkThread({
                machineId: source.machineId,
                directory: source.directory,
                codexThreadId: source.codexThreadId,
            });

        if (forkResult.type !== 'success') {
            return { type: 'error', errorMessage: forkResult.errorMessage };
        }

        const spawnResult = await machineSpawnNewSession({
            machineId: source.machineId,
            directory: source.directory,
            agent: 'codex',
            approvedNewDirectoryCreation: false,
            resumeCodexThreadId: forkResult.newCodexThreadId,
            parentSessionId: source.sessionId,
            forkedFromMessageId: opts.forkedFromMessageId,
            isSideChat: opts.isSideChat,
        });

        if (spawnResult.type === 'success') {
            try {
                await sync.refreshSessions();
            } catch {
                // Broadcast sync will still hydrate the session shortly.
            }
        }

        return spawnResult;
    }

    const forkResult = opts.cutAfterUuid
        ? await claudeDuplicateSession({
            machineId: source.machineId,
            directory: source.directory,
            claudeSessionId: source.claudeSessionId,
            cutAfterUuid: opts.cutAfterUuid,
        })
        : await claudeForkSession({
            machineId: source.machineId,
            directory: source.directory,
            claudeSessionId: source.claudeSessionId,
        });

    if (forkResult.type !== 'success') {
        return { type: 'error', errorMessage: forkResult.errorMessage };
    }

    const spawnResult = await machineSpawnNewSession({
        machineId: source.machineId,
        directory: source.directory,
        agent: 'claude',
        approvedNewDirectoryCreation: false,
        resumeClaudeSessionId: forkResult.newClaudeSessionId,
        parentSessionId: source.sessionId,
        forkedFromMessageId: opts.forkedFromMessageId,
        isSideChat: opts.isSideChat,
    });

    if (spawnResult.type === 'success') {
        try {
            await sync.refreshSessions();
        } catch {
            // Broadcast sync will still hydrate the session shortly.
        }
    }

    return spawnResult;
}

export async function spawnSideChat(source: ForkSource): Promise<SpawnSessionResult> {
    return forkAndSpawn(source, { isSideChat: true });
}

// Export types for external use
export type {
    SessionBashRequest,
    SessionBashResponse,
    SessionReadFileResponse,
    SessionWriteFileResponse,
    SessionListDirectoryResponse,
    DirectoryEntry,
    SessionGetDirectoryTreeResponse,
    TreeNode,
    SessionRipgrepResponse,
    SessionKillResponse
};
