import { logger } from '@/ui/logger';
import { exec, execFile, ExecOptions } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, readdir, stat, lstat, mkdir, open, unlink } from 'fs/promises';
import { createHash } from 'crypto';
import { join } from 'path';
import { run as runRipgrep } from '@/modules/ripgrep/index';
import { run as runDifftastic } from '@/modules/difftastic/index';
import { RpcHandlerManager } from '../../api/rpc/RpcHandlerManager';
import { validatePath } from './pathSecurity';
import type {
    RpcCreateDirectoryRequest as CreateDirectoryRequest,
    RpcCreateDirectoryResponse as CreateDirectoryResponse,
    RpcDeleteFileRequest as DeleteFileRequest,
    RpcDeleteFileResponse as DeleteFileResponse,
    RpcDirectoryEntry as DirectoryEntry,
    RpcGetDirectoryTreeRequest as GetDirectoryTreeRequest,
    RpcGetDirectoryTreeResponse as GetDirectoryTreeResponse,
    RpcListDirectoryRequest as ListDirectoryRequest,
    RpcListDirectoryResponse as ListDirectoryResponse,
    RpcReadFileRequest as ReadFileRequest,
    RpcReadFileResponse as ReadFileResponse,
    RpcRipgrepRequest as RipgrepRequest,
    RpcRipgrepResponse as RipgrepResponse,
    RpcTreeNode as TreeNode,
    RpcWriteFileRequest as WriteFileRequest,
    RpcWriteFileResponse as WriteFileResponse,
} from '@artsum/agenthub-wire';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

interface BashRequest {
    command: string;
    cwd?: string;
    timeout?: number; // timeout in milliseconds
}

interface BashResponse {
    success: boolean;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    error?: string;
}

interface StructuredExecRequest {
    executable: string;
    args: string[];
    cwd?: string;
    timeout?: number;
}

const DEFAULT_READ_FILE_MAX_SIZE = 2 * 1024 * 1024; // 2MB

type ResolvedFilesystemEntry = {
    type: 'file' | 'directory' | 'other';
    size?: number;
    modified?: number;
};

interface DifftasticRequest {
    args: string[];
    cwd?: string;
}

interface DifftasticResponse {
    success: boolean;
    exitCode?: number;
    stdout?: string;
    stderr?: string;
    error?: string;
}

/*
 * Spawn Session Options and Result
 * This rpc type is used by the daemon, all other RPCs here are for sessions
*/

export interface SpawnSessionOptions {
    machineId?: string;
    directory: string;
    sessionId?: string;
    approvedNewDirectoryCreation?: boolean;
    agent?: 'claude' | 'codex';
    permissionMode?: string;
    model?: string;
    environmentVariables?: Record<string, string>;
    token?: string;
    resumeClaudeSessionId?: string;
    resumeCodexThreadId?: string;
    officialMirrorClaudeSessionId?: string;
    officialMirrorCodexThreadId?: string;
    parentSessionId?: string;
    forkedFromMessageId?: string;
    isSideChat?: boolean;
}

export type SpawnSessionResult =
    | { type: 'success'; sessionId: string }
    | { type: 'requestToApproveDirectoryCreation'; directory: string }
    | { type: 'error'; errorMessage: string };

/**
 * Register all RPC handlers with the session
 * @param rpcHandlerManager The RPC handler manager to register handlers on
 * @param workingDirectory The working directory for path validation
 * @param restrictPaths When false, allows access to any path the user can read (used for machine-level handlers)
 */
export function registerCommonHandlers(rpcHandlerManager: RpcHandlerManager, workingDirectory: string, restrictPaths: boolean = true) {

    const maybeValidatePath = (targetPath: string): { valid: boolean; resolvedPath?: string; error?: string } => {
        if (!restrictPaths) {
            return { valid: true, resolvedPath: targetPath };
        }
        return validatePath(targetPath, workingDirectory);
    };

    const resolveFilesystemEntry = async (path: string): Promise<ResolvedFilesystemEntry> => {
        try {
            const stats = await stat(path);
            return {
                type: stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other',
                size: stats.size,
                modified: stats.mtime.getTime()
            };
        } catch (error) {
            logger.debug(`Failed to stat ${path}:`, error);
            return { type: 'other' };
        }
    };

    // Shell command handler - executes commands in the default shell
    rpcHandlerManager.registerHandler<BashRequest, BashResponse>('bash', async (data) => {
        logger.debug('Shell command request:', data.command);

        // Validate cwd if provided
        // Special case: "/" means "use shell's default cwd" (used by CLI detection)
        // Security: Still validate all other paths to prevent directory traversal
        if (data.cwd && data.cwd !== '/') {
            const validation = maybeValidatePath(data.cwd);
            if (!validation.valid) {
                return { success: false, error: validation.error };
            }
            data.cwd = validation.resolvedPath;
        }

        try {
            // Build options with shell enabled by default
            // Note: ExecOptions doesn't support boolean for shell, but exec() uses the default shell when shell is undefined
            // If cwd is "/", use undefined to let shell use its default (respects user's PATH)
            const options: ExecOptions = {
                cwd: data.cwd === '/' ? undefined : data.cwd,
                timeout: data.timeout || 30000, // Default 30 seconds timeout
                windowsHide: true, // Prevent cmd.exe popup on Windows for every RPC bash call
            };

            logger.debug('Shell command executing...', { cwd: options.cwd, timeout: options.timeout });
            const { stdout, stderr } = await execAsync(data.command, options);
            logger.debug('Shell command executed, processing result...');

            const result = {
                success: true,
                stdout: stdout ? stdout.toString() : '',
                stderr: stderr ? stderr.toString() : '',
                exitCode: 0
            };
            logger.debug('Shell command result:', {
                success: true,
                exitCode: 0,
                stdoutLen: result.stdout.length,
                stderrLen: result.stderr.length
            });
            return result;
        } catch (error) {
            const execError = error as NodeJS.ErrnoException & {
                stdout?: string;
                stderr?: string;
                code?: number | string;
                killed?: boolean;
            };

            // Check if the error was due to timeout
            if (execError.code === 'ETIMEDOUT' || execError.killed) {
                const result = {
                    success: false,
                    stdout: execError.stdout || '',
                    stderr: execError.stderr || '',
                    exitCode: typeof execError.code === 'number' ? execError.code : -1,
                    error: 'Command timed out'
                };
                logger.debug('Shell command timed out:', {
                    success: false,
                    exitCode: result.exitCode,
                    error: 'Command timed out'
                });
                return result;
            }

            // If exec fails, it includes stdout/stderr in the error
            const result = {
                success: false,
                stdout: execError.stdout ? execError.stdout.toString() : '',
                stderr: execError.stderr ? execError.stderr.toString() : execError.message || 'Command failed',
                exitCode: typeof execError.code === 'number' ? execError.code : 1,
                error: execError.message || 'Command failed'
            };
            logger.debug('Shell command failed:', {
                success: false,
                exitCode: result.exitCode,
                error: result.error,
                stdoutLen: result.stdout.length,
                stderrLen: result.stderr.length
            });
            return result;
        }
    });

    // Product-internal command handler. Arguments are passed directly to the
    // executable and are never parsed by a shell; keep `bash` only for the
    // explicit user-facing terminal capability.
    rpcHandlerManager.registerHandler<StructuredExecRequest, BashResponse>('exec', async (data) => {
        if (data.cwd && data.cwd !== '/') {
            const validation = maybeValidatePath(data.cwd);
            if (!validation.valid) return { success: false, error: validation.error };
            data.cwd = validation.resolvedPath;
        }

        try {
            const { stdout, stderr } = await execFileAsync(data.executable, data.args, {
                cwd: data.cwd === '/' ? undefined : data.cwd,
                timeout: data.timeout || 30_000,
                windowsHide: true,
                maxBuffer: 8 * 1024 * 1024,
                encoding: 'utf8',
            });
            return { success: true, stdout, stderr, exitCode: 0 };
        } catch (error) {
            const execError = error as NodeJS.ErrnoException & {
                stdout?: string;
                stderr?: string;
                code?: number | string;
                killed?: boolean;
            };
            return {
                success: false,
                stdout: execError.stdout || '',
                stderr: execError.stderr || '',
                exitCode: typeof execError.code === 'number' ? execError.code : -1,
                error: execError.code === 'ETIMEDOUT' || execError.killed
                    ? 'Command timed out'
                    : execError.message,
            };
        }
    });

    // Read file handler - returns base64 encoded content with size limit
    rpcHandlerManager.registerHandler<ReadFileRequest, ReadFileResponse>('readFile', async (data) => {
        logger.debug('Read file request:', data.path);

        const validation = maybeValidatePath(data.path);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }

        try {
            const maxSize = data.maxSize ?? DEFAULT_READ_FILE_MAX_SIZE;
            const fileStat = await stat(validation.resolvedPath!);
            const totalSize = fileStat.size;
            const hasRange = data.offset !== undefined || data.length !== undefined;

            if (hasRange) {
                const offset = Math.max(0, Math.floor(data.offset ?? 0));
                const requestedLength = Math.max(0, Math.floor(data.length ?? maxSize));
                if (offset >= totalSize || requestedLength === 0) {
                    return {
                        success: true,
                        content: '',
                        totalSize,
                        offset,
                        bytesRead: 0,
                        truncated: offset < totalSize,
                    };
                }

                const bytesToRead = Math.min(requestedLength, totalSize - offset);
                const fd = await open(validation.resolvedPath!, 'r');
                try {
                    const buffer = Buffer.alloc(bytesToRead);
                    const { bytesRead } = await fd.read(buffer, 0, bytesToRead, offset);
                    const chunk = buffer.subarray(0, bytesRead);
                    return {
                        success: true,
                        content: chunk.toString('base64'),
                        totalSize,
                        offset,
                        bytesRead,
                        truncated: offset + bytesRead < totalSize,
                    };
                } finally {
                    await fd.close();
                }
            }

            if (totalSize <= maxSize) {
                const buffer = await readFile(validation.resolvedPath!);
                return { success: true, content: buffer.toString('base64'), totalSize, truncated: false };
            }

            // File exceeds maxSize — read only the first chunk, cut at last newline
            const fd = await open(validation.resolvedPath!, 'r');
            try {
                const buffer = Buffer.alloc(maxSize);
                await fd.read(buffer, 0, maxSize, 0);
                const lastNewline = buffer.lastIndexOf('\n');
                const truncatedBuffer = lastNewline > 0 ? buffer.subarray(0, lastNewline) : buffer;
                return { success: true, content: truncatedBuffer.toString('base64'), totalSize, truncated: true };
            } finally {
                await fd.close();
            }
        } catch (error) {
            logger.debug('Failed to read file:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Failed to read file' };
        }
    });

    // Write file handler - with hash verification
    rpcHandlerManager.registerHandler<WriteFileRequest, WriteFileResponse>('writeFile', async (data) => {
        logger.debug('Write file request:', data.path);

        // Validate path is within working directory
        const validation = maybeValidatePath(data.path);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }

        try {
            // If expectedHash is provided (not null), verify existing file
            if (data.expectedHash !== null && data.expectedHash !== undefined) {
                try {
                    const existingBuffer = await readFile(validation.resolvedPath!);
                    const existingHash = createHash('sha256').update(existingBuffer).digest('hex');

                    if (existingHash !== data.expectedHash) {
                        return {
                            success: false,
                            error: `File hash mismatch. Expected: ${data.expectedHash}, Actual: ${existingHash}`
                        };
                    }
                } catch (error) {
                    const nodeError = error as NodeJS.ErrnoException;
                    if (nodeError.code !== 'ENOENT') {
                        throw error;
                    }
                    // File doesn't exist but hash was provided
                    return {
                        success: false,
                        error: 'File does not exist but hash was provided'
                    };
                }
            } else {
                // expectedHash is null - expecting new file
                try {
                    await stat(validation.resolvedPath!);
                    // File exists but we expected it to be new
                    return {
                        success: false,
                        error: 'File already exists but was expected to be new'
                    };
                } catch (error) {
                    const nodeError = error as NodeJS.ErrnoException;
                    if (nodeError.code !== 'ENOENT') {
                        throw error;
                    }
                    // File doesn't exist - this is expected
                }
            }

            // Write the file
            const buffer = Buffer.from(data.content, 'base64');
            await writeFile(validation.resolvedPath!, buffer);

            // Calculate and return hash of written file
            const hash = createHash('sha256').update(buffer).digest('hex');

            return { success: true, hash };
        } catch (error) {
            logger.debug('Failed to write file:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Failed to write file' };
        }
    });

    rpcHandlerManager.registerHandler<DeleteFileRequest, DeleteFileResponse>('deleteFile', async (data) => {
        logger.debug('Delete file request:', data.path);

        const validation = maybeValidatePath(data.path);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }

        try {
            const fileStat = await stat(validation.resolvedPath!);
            if (!fileStat.isFile()) {
                return { success: false, error: 'Only files can be deleted through this action.' };
            }
            await unlink(validation.resolvedPath!);
            return { success: true };
        } catch (error) {
            logger.debug('Failed to delete file:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Failed to delete file' };
        }
    });

    // List directory handler
    rpcHandlerManager.registerHandler<ListDirectoryRequest, ListDirectoryResponse>('listDirectory', async (data) => {
        logger.debug('List directory request:', data.path);

        // Validate path is within working directory
        const validation = maybeValidatePath(data.path);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }

        try {
            const directoryPath = validation.resolvedPath!;
            const entries = await readdir(directoryPath, { withFileTypes: true });

            const directoryEntries: DirectoryEntry[] = await Promise.all(
                entries.map(async (entry) => {
                    const fullPath = join(directoryPath, entry.name);
                    const info = await resolveFilesystemEntry(fullPath);

                    return {
                        name: entry.name,
                        type: info.type,
                        size: info.size,
                        modified: info.modified
                    };
                })
            );

            // Sort entries: directories first, then files, alphabetically
            directoryEntries.sort((a, b) => {
                if (a.type === 'directory' && b.type !== 'directory') return -1;
                if (a.type !== 'directory' && b.type === 'directory') return 1;
                return a.name.localeCompare(b.name);
            });

            return { success: true, entries: directoryEntries };
        } catch (error) {
            logger.debug('Failed to list directory:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Failed to list directory' };
        }
    });

    // Create directory handler
    rpcHandlerManager.registerHandler<CreateDirectoryRequest, CreateDirectoryResponse>('createDirectory', async (data) => {
        logger.debug('Create directory request:', data.path);

        const validation = maybeValidatePath(data.path);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }

        try {
            await mkdir(validation.resolvedPath!);
            return { success: true };
        } catch (error: any) {
            if (error.code === 'EEXIST') {
                return { success: false, error: 'Directory already exists' };
            }
            if (error.code === 'EACCES') {
                return { success: false, error: 'Permission denied' };
            }
            if (error.code === 'ENOSPC') {
                return { success: false, error: 'No space left on device' };
            }
            return { success: false, error: error.message || 'Failed to create directory' };
        }
    });

    // Get directory tree handler - recursive with depth control
    rpcHandlerManager.registerHandler<GetDirectoryTreeRequest, GetDirectoryTreeResponse>('getDirectoryTree', async (data) => {
        logger.debug('Get directory tree request:', data.path, 'maxDepth:', data.maxDepth);

        // Validate path is within working directory
        const validation = maybeValidatePath(data.path);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }

        // Helper function to build tree recursively
        async function buildTree(path: string, name: string, currentDepth: number): Promise<TreeNode | null> {
            try {
                const linkStats = await lstat(path);
                const stats = await stat(path);
                const type = stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other';

                if (type === 'other') {
                    return null;
                }

                // Base node information
                const node: TreeNode = {
                    name,
                    path,
                    type,
                    size: stats.size,
                    modified: stats.mtime.getTime()
                };

                // If it's a directory and we haven't reached max depth, get children
                if (type === 'directory' && !linkStats.isSymbolicLink() && currentDepth < data.maxDepth) {
                    const entries = await readdir(path, { withFileTypes: true });
                    const children: TreeNode[] = [];

                    await Promise.all(
                        entries.map(async (entry) => {
                            const childPath = join(path, entry.name);
                            const childNode = await buildTree(childPath, entry.name, currentDepth + 1);
                            if (childNode) {
                                children.push(childNode);
                            }
                        })
                    );

                    // Sort children: directories first, then files, alphabetically
                    children.sort((a, b) => {
                        if (a.type === 'directory' && b.type !== 'directory') return -1;
                        if (a.type !== 'directory' && b.type === 'directory') return 1;
                        return a.name.localeCompare(b.name);
                    });

                    node.children = children;
                }

                return node;
            } catch (error) {
                // Log error but continue traversal
                logger.debug(`Failed to process ${path}:`, error instanceof Error ? error.message : String(error));
                return null;
            }
        }

        try {
            // Validate maxDepth
            if (data.maxDepth < 0) {
                return { success: false, error: 'maxDepth must be non-negative' };
            }

            // Get the base name for the root node
            const rootPath = validation.resolvedPath!;
            const baseName = rootPath === '/' ? '/' : rootPath.split('/').pop() || rootPath;
            const tree = await buildTree(rootPath, baseName, 0);

            if (!tree) {
                return { success: false, error: 'Failed to access the specified path' };
            }

            return { success: true, tree };
        } catch (error) {
            logger.debug('Failed to get directory tree:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Failed to get directory tree' };
        }
    });

    // Ripgrep handler - raw interface to ripgrep
    rpcHandlerManager.registerHandler<RipgrepRequest, RipgrepResponse>('ripgrep', async (data) => {
        logger.debug('Ripgrep request with args:', data.args, 'cwd:', data.cwd);

        const targetCwd = data.cwd || workingDirectory;
        const validation = maybeValidatePath(targetCwd);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }
        data.cwd = validation.resolvedPath;

        try {
            const result = await runRipgrep(data.args, { cwd: data.cwd });
            return {
                success: true,
                exitCode: result.exitCode,
                stdout: result.stdout.toString(),
                stderr: result.stderr.toString()
            };
        } catch (error) {
            logger.debug('Failed to run ripgrep:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to run ripgrep'
            };
        }
    });

    // Difftastic handler - raw interface to difftastic
    rpcHandlerManager.registerHandler<DifftasticRequest, DifftasticResponse>('difftastic', async (data) => {
        logger.debug('Difftastic request with args:', data.args, 'cwd:', data.cwd);

        const targetCwd = data.cwd || workingDirectory;
        const validation = maybeValidatePath(targetCwd);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }
        data.cwd = validation.resolvedPath;

        try {
            const result = await runDifftastic(data.args, { cwd: data.cwd });
            return {
                success: true,
                exitCode: result.exitCode,
                stdout: result.stdout.toString(),
                stderr: result.stderr.toString()
            };
        } catch (error) {
            logger.debug('Failed to run difftastic:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to run difftastic'
            };
        }
    });
}
