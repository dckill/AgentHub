import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve as resolvePath } from 'node:path';

import { logger } from '@/ui/logger';

export type OfficialCodexThread = {
    id: string;
    machineId: string;
    cwd: string;
    title: string;
    updatedAt: number;
    createdAt?: number;
    archived: boolean;
    gitBranch?: string | null;
    preview?: string;
    provider: 'codex';
};

export type OfficialCodexThreadState = {
    id: string;
    archived: boolean;
};

function sqliteString(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

async function readCodexSessionMeta(filePath: string): Promise<{ cwd?: string; createdAt?: number } | null> {
    try {
        const rl = createInterface({
            input: createReadStream(filePath, { encoding: 'utf8' }),
            crlfDelay: Infinity,
        });

        for await (const line of rl) {
            if (!line.trim()) continue;
            const parsed = JSON.parse(line);
            if (parsed?.type === 'session_meta' && parsed?.payload && typeof parsed.payload === 'object') {
                const cwd = typeof parsed.payload.cwd === 'string' ? parsed.payload.cwd : undefined;
                const timestamp = typeof parsed.payload.timestamp === 'string'
                    ? Date.parse(parsed.payload.timestamp)
                    : Number.NaN;
                return {
                    cwd,
                    createdAt: Number.isFinite(timestamp) ? timestamp : undefined,
                };
            }
        }
    } catch (error) {
        logger.debug('[API MACHINE] Failed to read Codex session meta', { filePath, error });
    }
    return null;
}

function normalizeTitle(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > 0 ? normalized : null;
}

function pathBasename(path: string): string | null {
    const parts = path.split(/[\\/]+/).filter(Boolean);
    return parts[parts.length - 1] ?? null;
}

function isProjectNameTitle(title: string, cwd: string): boolean {
    return title === pathBasename(cwd);
}

function extractCodexUserText(value: unknown): string | null {
    if (typeof value === 'string') {
        return normalizeTitle(value);
    }
    if (Array.isArray(value)) {
        const parts = value
            .map((entry) => {
                if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                    return null;
                }
                const text = (entry as Record<string, unknown>).text;
                return typeof text === 'string' ? text : null;
            })
            .filter((text): text is string => !!text);
        return normalizeTitle(parts.join(' '));
    }
    return null;
}

function extractCodexJsonlUserMessage(parsed: unknown): string | null {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
    }

    const record = parsed as Record<string, unknown>;
    if (record.type === 'user' && record.message && typeof record.message === 'object' && !Array.isArray(record.message)) {
        const content = (record.message as Record<string, unknown>).content;
        return extractCodexUserText(content);
    }
    if (record.type === 'userMessage') {
        return extractCodexUserText(record.content);
    }
    if (record.type === 'item' && record.item && typeof record.item === 'object' && !Array.isArray(record.item)) {
        const item = record.item as Record<string, unknown>;
        if (item.type === 'userMessage') {
            return extractCodexUserText(item.content);
        }
    }

    return null;
}

async function readLatestCodexUserMessage(filePath: string): Promise<string | null> {
    let latest: string | null = null;
    try {
        const rl = createInterface({
            input: createReadStream(filePath, { encoding: 'utf8' }),
            crlfDelay: Infinity,
        });

        for await (const line of rl) {
            if (!line.trim()) continue;
            const title = extractCodexJsonlUserMessage(JSON.parse(line));
            if (title) {
                latest = title;
            }
        }
    } catch (error) {
        logger.debug('[API MACHINE] Failed to read Codex user message title', { filePath, error });
    }
    return latest;
}

async function findCodexThreadSessionFile(sessionsRoot: string, threadId: string): Promise<string | null> {
    const { execFile } = await import('node:child_process');
    return await new Promise<string | null>((resolve) => {
        execFile(
            'bash',
            ['-lc', `find ${JSON.stringify(sessionsRoot)} -type f -name '*${threadId}*.jsonl' | head -n 1`],
            { encoding: 'utf8', windowsHide: true },
            (_error, stdout) => resolve(stdout.trim() || null),
        );
    });
}

function isPathInsideRoot(root: string, filePath: string): boolean {
    const rel = relative(resolvePath(root), resolvePath(filePath));
    return rel.length === 0 || (!rel.startsWith('..') && !isAbsolute(rel));
}

function resolveCodexRolloutPath(codexHome: string, sessionsRoot: string, rolloutPath: unknown): string | null {
    if (typeof rolloutPath !== 'string' || rolloutPath.trim().length === 0) {
        return null;
    }

    const trimmed = rolloutPath.trim();
    if (isAbsolute(trimmed)) {
        return trimmed;
    }
    if (trimmed === 'sessions' || trimmed.startsWith('sessions/')) {
        return join(codexHome, trimmed);
    }
    if (trimmed === 'archived_sessions' || trimmed.startsWith('archived_sessions/')) {
        return join(codexHome, trimmed);
    }
    return join(sessionsRoot, trimmed);
}

async function resolveExistingActiveCodexSessionFile(
    codexHome: string,
    sessionsRoot: string,
    threadId: string,
    rolloutPath: unknown,
): Promise<string | null> {
    const resolvedRolloutPath = resolveCodexRolloutPath(codexHome, sessionsRoot, rolloutPath);
    if (resolvedRolloutPath) {
        if (!isPathInsideRoot(sessionsRoot, resolvedRolloutPath)) {
            return null;
        }
        try {
            const fileStat = await stat(resolvedRolloutPath);
            return fileStat.isFile() ? resolvedRolloutPath : null;
        } catch {
            return null;
        }
    }

    const found = await findCodexThreadSessionFile(sessionsRoot, threadId);
    if (!found || !isPathInsideRoot(sessionsRoot, found)) {
        return null;
    }
    return found;
}

export async function listOfficialCodexThreadsForMachine(
    machineId: string,
    ignoredThreadIds: Set<string>,
): Promise<OfficialCodexThread[]> {
    const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex');
    const stateDbPath = join(codexHome, 'state_5.sqlite');
    const sessionsRoot = join(codexHome, 'sessions');

    const { execFile } = await import('node:child_process');
    const query = `
SELECT id, cwd, title, archived, git_branch, preview, created_at_ms, updated_at_ms, rollout_path
FROM threads
WHERE archived = 0
ORDER BY recency_at_ms DESC, updated_at_ms DESC
LIMIT 200;
`;

    const rows = await new Promise<string>((resolve, reject) => {
        execFile(
            'sqlite3',
            ['-json', stateDbPath, query],
            { encoding: 'utf8', windowsHide: true },
            (error, stdout) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(stdout);
            },
        );
    }).catch((error) => {
        logger.debug('[API MACHINE] Failed to query Codex thread index', { error });
        return '[]';
    });

    let parsedRows: Array<Record<string, unknown>> = [];
    try {
        parsedRows = JSON.parse(rows);
    } catch (error) {
        logger.debug('[API MACHINE] Failed to parse Codex thread index JSON', { error });
    }

    const threads: OfficialCodexThread[] = [];
    for (const row of parsedRows) {
        const id = typeof row.id === 'string' ? row.id : null;
        if (!id) continue;
        if (ignoredThreadIds.has(id) || ignoredThreadIds.has(`codex:${id}`)) continue;

        const sessionFile = await resolveExistingActiveCodexSessionFile(codexHome, sessionsRoot, id, row.rollout_path);
        if (!sessionFile) {
            continue;
        }

        let cwd = typeof row.cwd === 'string' && row.cwd.length > 0 ? row.cwd : '';
        let createdAt = typeof row.created_at_ms === 'number' ? row.created_at_ms : undefined;
        const updatedAt = typeof row.updated_at_ms === 'number' ? row.updated_at_ms : Date.now();
        if (!cwd) {
            const meta = await readCodexSessionMeta(sessionFile);
            if (meta?.cwd) cwd = meta.cwd;
            if (!createdAt && meta?.createdAt) createdAt = meta.createdAt;
        }

        if (!cwd) continue;

        const officialTitle = normalizeTitle(row.title);
        let title = officialTitle && !isProjectNameTitle(officialTitle, cwd) ? officialTitle : null;
        if (!title) {
            title = await readLatestCodexUserMessage(sessionFile);
        }

        threads.push({
            id,
            machineId,
            cwd,
            title: title ?? officialTitle ?? id,
            updatedAt,
            createdAt,
            archived: row.archived === 1,
            gitBranch: typeof row.git_branch === 'string' ? row.git_branch : null,
            preview: typeof row.preview === 'string' ? row.preview : undefined,
            provider: 'codex',
        });
    }

    return threads;
}

export async function listOfficialCodexThreadStatesForMachine(threadIds: string[]): Promise<OfficialCodexThreadState[]> {
    const uniqueThreadIds = Array.from(new Set(
        threadIds.filter((threadId): threadId is string => typeof threadId === 'string' && threadId.length > 0),
    ));
    if (uniqueThreadIds.length === 0) {
        return [];
    }

    const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex');
    const stateDbPath = join(codexHome, 'state_5.sqlite');
    const query = `
SELECT id, archived
FROM threads
WHERE id IN (${uniqueThreadIds.map(sqliteString).join(', ')});
`;

    const { execFile } = await import('node:child_process');
    const rows = await new Promise<string>((resolve, reject) => {
        execFile(
            'sqlite3',
            ['-json', stateDbPath, query],
            { encoding: 'utf8', windowsHide: true },
            (error, stdout) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(stdout);
            },
        );
    }).catch((error) => {
        logger.debug('[API MACHINE] Failed to query Codex thread states', { error });
        throw error;
    });

    let parsedRows: Array<Record<string, unknown>>;
    try {
        parsedRows = JSON.parse(rows);
    } catch (error) {
        logger.debug('[API MACHINE] Failed to parse Codex thread states JSON', { error });
        throw error;
    }

    return parsedRows.flatMap((row) => {
        const id = typeof row.id === 'string' ? row.id : null;
        if (!id) {
            return [];
        }
        return [{ id, archived: row.archived === 1 }];
    });
}
