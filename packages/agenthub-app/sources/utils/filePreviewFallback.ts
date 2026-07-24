type SessionExecRunner = (
    sessionId: string,
    request: { executable: string; args: string[]; cwd?: string; timeout?: number },
) => Promise<{ success: boolean; stdout?: string; stderr?: string; exitCode?: number; error?: string }>;

type SessionReadFileRunner = (
    sessionId: string,
    path: string,
    options: { offset: number; length: number; signal?: AbortSignal },
) => Promise<{
    success: boolean;
    content?: string;
    totalSize?: number;
    offset?: number;
    bytesRead?: number;
    truncated?: boolean;
    error?: string;
}>;

export const FILE_PREVIEW_RPC_CHUNK_BYTES = 1536 * 1024;

export function buildFileByteSizeExec(filePath: string) {
    return { executable: 'wc', args: ['-c', '--', filePath] };
}

export function buildReadFileBase64Exec(filePath: string) {
    return { executable: 'base64', args: [filePath] };
}

export function parseByteSizeOutput(output: string): number | null {
    const parsed = Number.parseInt(output.trim(), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function getBase64DecodedByteLength(base64: string): number {
    const normalized = base64.trim();
    if (!normalized) return 0;
    const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

export async function readSessionFileBase64ContentInChunks(
    sessionId: string,
    filePath: string,
    maxBytes: number,
    runSessionReadFile?: SessionReadFileRunner,
    signal?: AbortSignal,
): Promise<{ success: boolean; content?: string; totalSize?: number; truncated?: boolean; error?: string }> {
    const runner = runSessionReadFile ?? (await import('@/sync/ops')).sessionReadFile;
    const readLimit = Math.max(0, Math.floor(maxBytes));
    const chunks: string[] = [];
    let offset = 0;
    let totalSize: number | undefined;

    if (readLimit === 0) {
        return { success: true, content: '', truncated: true };
    }

    while (offset < readLimit) {
        if (signal?.aborted) {
            throw new DOMException('File preview read aborted', 'AbortError');
        }
        const length = Math.min(FILE_PREVIEW_RPC_CHUNK_BYTES, readLimit - offset);
        const response = await runner(sessionId, filePath, { offset, length, ...(signal ? { signal } : {}) });

        if (!response.success || typeof response.content !== 'string') {
            return {
                success: false,
                error: response.error ?? 'Failed to read file',
                totalSize: response.totalSize ?? totalSize,
                truncated: response.truncated ?? true,
            };
        }

        totalSize = typeof response.totalSize === 'number' ? response.totalSize : totalSize;
        chunks.push(response.content);

        const bytesRead = typeof response.bytesRead === 'number'
            ? response.bytesRead
            : getBase64DecodedByteLength(response.content);
        if (bytesRead <= 0) {
            return {
                success: true,
                content: chunks.join(''),
                totalSize,
                truncated: typeof totalSize === 'number' ? offset < totalSize : response.truncated === true,
            };
        }

        offset += bytesRead;
        if (typeof totalSize === 'number' && offset >= totalSize) {
            return { success: true, content: chunks.join(''), totalSize, truncated: false };
        }
        if (response.truncated === false) {
            return { success: true, content: chunks.join(''), totalSize, truncated: false };
        }
    }

    return {
        success: true,
        content: chunks.join(''),
        totalSize,
        truncated: typeof totalSize === 'number' ? offset < totalSize : true,
    };
}

export async function readSessionFileBase64ViaShell(
    sessionId: string,
    filePath: string,
    cwd: string | null,
    runSessionExec?: SessionExecRunner,
): Promise<{ content: string; totalSize: number | null }> {
    const runner = runSessionExec ?? (await import('@/sync/ops')).sessionExec;
    const totalSize = await getSessionFileByteSizeViaShell(sessionId, filePath, cwd, runner);
    const content = await readSessionFileBase64ContentViaShell(sessionId, filePath, cwd, runner);

    return {
        content,
        totalSize,
    };
}

export async function getSessionFileByteSizeViaShell(
    sessionId: string,
    filePath: string,
    cwd: string | null,
    runSessionExec?: SessionExecRunner,
): Promise<number | null> {
    const runner = runSessionExec ?? (await import('@/sync/ops')).sessionExec;
    const sizeResult = await runner(sessionId, {
        ...buildFileByteSizeExec(filePath),
        cwd: cwd ?? undefined,
        timeout: 5000,
    });

    return sizeResult.success && typeof sizeResult.stdout === 'string' ? parseByteSizeOutput(sizeResult.stdout) : null;
}

export async function readSessionFileBase64ContentViaShell(
    sessionId: string,
    filePath: string,
    cwd: string | null,
    runSessionExec?: SessionExecRunner,
): Promise<string> {
    const runner = runSessionExec ?? (await import('@/sync/ops')).sessionExec;
    const readResult = await runner(sessionId, {
        ...buildReadFileBase64Exec(filePath),
        cwd: cwd ?? undefined,
        timeout: 10000,
    });

    if (!readResult.success || readResult.exitCode !== 0) {
        throw new Error(readResult.stderr || readResult.error || 'Failed to read file');
    }

    return (readResult.stdout ?? '').trim();
}
