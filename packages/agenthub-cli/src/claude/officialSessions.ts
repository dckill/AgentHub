import { createReadStream } from 'node:fs';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

import { logger } from '@/ui/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OfficialClaudeSession = {
    id: string;
    machineId: string;
    cwd: string;
    title: string;
    updatedAt: number;
    createdAt?: number;
    archived: false;
    gitBranch?: string | null;
    preview?: string;
    provider: 'claude';
};

type ClaudeSessionScanResult = {
    cwd: string | null;
    title: string | null;
    preview: string | null;
    createdAt: number | null;
    updatedAt: number | null;
    gitBranch: string | null;
};

function claudeConfigDir(): string {
    return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

function normalizeText(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > 0 ? normalized : null;
}

function parseTimestamp(value: unknown): number | null {
    if (typeof value !== 'string') {
        return null;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function textFromClaudeContent(content: unknown): string | null {
    if (typeof content === 'string') {
        return normalizeText(content);
    }
    if (!Array.isArray(content)) {
        return null;
    }

    const parts = content
        .map((entry) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                return null;
            }
            const record = entry as Record<string, unknown>;
            if (typeof record.text === 'string') {
                return record.text;
            }
            if (typeof record.content === 'string') {
                return record.content;
            }
            return null;
        })
        .filter((part): part is string => !!part);

    return normalizeText(parts.join(' '));
}

function titleFromClaudeEvent(event: Record<string, unknown>): string | null {
    if (event.type === 'ai-title') {
        return normalizeText(event.title)
            ?? normalizeText(event.summary)
            ?? normalizeText(event.text)
            ?? normalizeText((event.message as Record<string, unknown> | undefined)?.content);
    }

    if (event.type !== 'user') {
        return null;
    }
    if (event.isMeta === true) {
        return null;
    }

    const message = event.message;
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
        return null;
    }
    return textFromClaudeContent((message as Record<string, unknown>).content);
}

async function scanClaudeSessionFile(filePath: string): Promise<ClaudeSessionScanResult> {
    const result: ClaudeSessionScanResult = {
        cwd: null,
        title: null,
        preview: null,
        createdAt: null,
        updatedAt: null,
        gitBranch: null,
    };

    try {
        const rl = createInterface({
            input: createReadStream(filePath, { encoding: 'utf8' }),
            crlfDelay: Infinity,
        });

        for await (const line of rl) {
            if (!line.trim()) {
                continue;
            }

            let parsed: unknown;
            try {
                parsed = JSON.parse(line);
            } catch {
                continue;
            }
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                continue;
            }

            const event = parsed as Record<string, unknown>;
            if (!result.cwd && typeof event.cwd === 'string' && event.cwd.length > 0) {
                result.cwd = event.cwd;
            }
            if (!result.gitBranch && typeof event.gitBranch === 'string' && event.gitBranch.length > 0) {
                result.gitBranch = event.gitBranch;
            }

            const timestamp = parseTimestamp(event.timestamp);
            if (timestamp !== null) {
                result.createdAt ??= timestamp;
                result.updatedAt = timestamp;
            }

            const title = titleFromClaudeEvent(event);
            if (title) {
                result.title = title;
                result.preview = title;
            }
        }
    } catch (error) {
        logger.debug('[API MACHINE] Failed to scan Claude official session file', { filePath, error });
    }

    return result;
}

export async function listOfficialClaudeSessionsForMachine(
    machineId: string,
    ignoredIds: Set<string>,
): Promise<OfficialClaudeSession[]> {
    const projectsRoot = join(claudeConfigDir(), 'projects');
    const sessions: OfficialClaudeSession[] = [];

    let projectDirs: string[];
    try {
        await mkdir(projectsRoot, { recursive: true });
        const entries = await readdir(projectsRoot, { withFileTypes: true });
        projectDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => join(projectsRoot, entry.name));
    } catch (error) {
        logger.debug('[API MACHINE] Failed to list Claude projects root', { projectsRoot, error });
        return [];
    }

    for (const projectDir of projectDirs) {
        let entries;
        try {
            entries = await readdir(projectDir, { withFileTypes: true });
        } catch {
            continue;
        }

        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith('.jsonl')) {
                continue;
            }

            const id = basename(entry.name, '.jsonl');
            if (!UUID_RE.test(id) || ignoredIds.has(`claude:${id}`) || ignoredIds.has(id)) {
                continue;
            }

            const filePath = join(projectDir, entry.name);
            let fileStat: Awaited<ReturnType<typeof stat>>;
            try {
                fileStat = await stat(filePath);
            } catch {
                continue;
            }

            const scanned = await scanClaudeSessionFile(filePath);
            if (!scanned.cwd) {
                continue;
            }

            const fallbackTitle = normalizeText(basename(scanned.cwd)) ?? id;
            sessions.push({
                id,
                machineId,
                cwd: scanned.cwd,
                title: scanned.title ?? fallbackTitle,
                updatedAt: scanned.updatedAt ?? fileStat.mtimeMs,
                createdAt: scanned.createdAt ?? fileStat.birthtimeMs,
                archived: false,
                gitBranch: scanned.gitBranch,
                preview: scanned.preview ?? undefined,
                provider: 'claude',
            });
        }
    }

    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    return sessions.slice(0, 200);
}
