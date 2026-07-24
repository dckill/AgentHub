import * as React from 'react';
import { Message } from '@/sync/typesMessage';
import { knownTools } from '@/components/tools/knownTools';
import { t } from '@/text';

// Display item types for the grouped message list
export type TextItem = {
    type: 'message';
    id: string;
    message: Message;
};

export type ToolGroupItem = {
    type: 'tool-group';
    id: string;
    messages: Message[];
    hasRunning: boolean;
    hasPendingPermission: boolean;
};

export type AgentWorkGroupItem = {
    type: 'agent-work-group';
    id: string;
    messages: Message[];
    hasRunning: boolean;
    hasPendingPermission: boolean;
    startedAt: number;
    completedAt: number | null;
};

export type ToolDisplayItem = TextItem | ToolGroupItem;
export type DisplayItem = TextItem | ToolGroupItem | AgentWorkGroupItem;

/**
 * The messages array is newest-first for the inverted FlatList.
 *
 * When enabled, intermediate agent work in a turn is collapsed into an
 * AgentWorkGroupItem while the final agent text remains visible. Tool calls
 * that remain outside a work group are collapsed only when adjacent visible
 * tool calls form a run. When disabled, every message passes through.
 */
export function useGroupedMessages(
    messages: Message[],
    enabled: boolean = true,
    options: { collapseCurrentTurn?: boolean } = {},
): DisplayItem[] {
    const collapseCurrentTurn = options.collapseCurrentTurn ?? true;
    const grouperRef = React.useRef<ReturnType<typeof createIncrementalMessageGrouper> | null>(null);
    if (!grouperRef.current) {
        grouperRef.current = createIncrementalMessageGrouper();
    }
    return React.useMemo(() => {
        return grouperRef.current!.group(messages, enabled, { collapseCurrentTurn });
    }, [messages, enabled, collapseCurrentTurn]);
}

export function createIncrementalMessageGrouper() {
    const cachedTurns = new Map<string, { source: Message[]; display: DisplayItem[]; collapseCurrentTurn: boolean }>();

    return {
        group(
            messages: Message[],
            enabled: boolean = true,
            options: { collapseCurrentTurn?: boolean } = {},
        ): DisplayItem[] {
            const collapseCurrentTurn = options.collapseCurrentTurn ?? true;
            if (!enabled) {
                cachedTurns.clear();
                return groupMessagesForDisplay(messages, false, options);
            }

            const segments: Message[][] = [];
            let current: Message[] = [];
            for (const message of messages) {
                current.push(message);
                if (message.kind === 'user-text') {
                    segments.push(current);
                    current = [];
                }
            }
            if (current.length > 0) segments.push(current);

            const activeKeys = new Set<string>();
            const result: DisplayItem[] = [];
            segments.forEach((segment, index) => {
                const userBoundary = segment.find((message) => message.kind === 'user-text');
                const key = userBoundary?.id ?? `open:${segment.at(-1)?.id ?? 'empty'}`;
                activeKeys.add(key);
                const cached = cachedTurns.get(key);
                const unchanged = cached
                    && cached.collapseCurrentTurn === (index === 0 ? collapseCurrentTurn : true)
                    && cached.source.length === segment.length
                    && cached.source.every((message, messageIndex) => message === segment[messageIndex]);
                if (unchanged) {
                    result.push(...cached.display);
                    return;
                }
                const display = groupMessagesForDisplay(segment, true, {
                    collapseCurrentTurn: index === 0
                        ? collapseCurrentTurn
                        : true,
                });
                cachedTurns.set(key, {
                    source: segment,
                    display,
                    collapseCurrentTurn: index === 0 ? collapseCurrentTurn : true,
                });
                result.push(...display);
            });
            for (const key of cachedTurns.keys()) {
                if (!activeKeys.has(key)) cachedTurns.delete(key);
            }
            return result;
        },
    };
}

export function groupMessagesForDisplay(
    messages: Message[],
    enabled: boolean = true,
    options: { collapseCurrentTurn?: boolean } = {},
): DisplayItem[] {
    if (!enabled) {
        return messages.map((msg) => ({ type: 'message', id: msg.id, message: msg } as TextItem));
    }

    const collapseCurrentTurn = options.collapseCurrentTurn ?? true;
    const turnOf = getTurnAssignments(messages);
    const workGroups = collectAgentWorkGroups(messages, turnOf, collapseCurrentTurn);
    const hiddenWorkIndexes = new Set<number>();
    const workGroupByOldestIndex = new Map<number, AgentWorkGroupItem>();

    for (const group of workGroups) {
        workGroupByOldestIndex.set(group.oldestIdx, group.item);
        for (const index of group.hiddenIndexes) {
            hiddenWorkIndexes.add(index);
        }
    }

    const visibleForToolGrouping = (msg: Message, index: number): boolean => {
        if (hiddenWorkIndexes.has(index)) return false;
        if (isInvisibleMessage(msg) || isUserAttachment(msg)) return false;
        if (turnOf[index] === 0 && !collapseCurrentTurn) return false;
        return msg.kind === 'tool-call';
    };

    const toolRuns = collectToolRuns(messages, visibleForToolGrouping);

    // Build display items — groups are emitted at their oldest hidden member
    // so the visual order remains user message → collapsed work → final answer.
    const result: DisplayItem[] = [];
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];

        if (isInvisibleMessage(msg)) continue;

        if (hiddenWorkIndexes.has(i)) {
            const workGroup = workGroupByOldestIndex.get(i);
            if (workGroup) {
                result.push(workGroup);
            }
            continue;
        }

        if (isUserAttachment(msg)) {
            result.push({ type: 'message', id: msg.id, message: msg });
            continue;
        }

        if (msg.kind === 'tool-call') {
            const info = toolRuns.get(i);
            if (info && info.msgs.length > 1 && i === info.oldestIdx) {
                let hasRunning = false;
                for (const m of info.msgs) {
                    if (m.kind === 'tool-call' && m.tool.state === 'running') {
                        hasRunning = true;
                        break;
                    }
                }
                const chronologicalMessages = [...info.msgs].reverse();
                result.push({
                    type: 'tool-group',
                    id: `group-${info.msgs[0].id}`,
                    messages: chronologicalMessages,
                    hasRunning,
                    hasPendingPermission: hasPendingPermission(info.msgs),
                });
            }
            if (info && info.msgs.length > 1) {
                continue;
            }
        }

        // Standalone messages (user text, agent text, events)
        result.push({ type: 'message', id: msg.id, message: msg });
    }

    return result;
}

export function groupToolCallsForDisplay(
    messages: Message[],
    enabled: boolean = true,
    options: { groupSingleToolCalls?: boolean } = {},
): ToolDisplayItem[] {
    if (!enabled) {
        return messages.map((msg) => ({ type: 'message', id: msg.id, message: msg } as TextItem));
    }

    const groupSingleToolCalls = options.groupSingleToolCalls ?? false;
    const toolRuns = collectToolRuns(messages, (msg) => {
        if (msg.kind !== 'tool-call') return false;
        if (isInvisibleMessage(msg) || isUserAttachment(msg)) return false;
        return true;
    });

    const result: ToolDisplayItem[] = [];
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];

        if (isInvisibleMessage(msg)) continue;

        if (isUserAttachment(msg)) {
            result.push({ type: 'message', id: msg.id, message: msg });
            continue;
        }

        if (msg.kind === 'tool-call') {
            const info = toolRuns.get(i);
            const shouldGroupRun = info && (info.msgs.length > 1 || groupSingleToolCalls);
            if (shouldGroupRun && i === info.oldestIdx) {
                let hasRunning = false;
                for (const m of info.msgs) {
                    if (m.kind === 'tool-call' && m.tool.state === 'running') {
                        hasRunning = true;
                        break;
                    }
                }
                const chronologicalMessages = [...info.msgs].reverse();
                result.push({
                    type: 'tool-group',
                    id: `group-${info.msgs[0].id}`,
                    messages: chronologicalMessages,
                    hasRunning,
                    hasPendingPermission: hasPendingPermission(info.msgs),
                });
            }
            if (shouldGroupRun) {
                continue;
            }
        }

        result.push({ type: 'message', id: msg.id, message: msg });
    }

    return result;
}

function getTurnAssignments(messages: Message[]): number[] {
    // Newest-first → turn 0 is the current assistant turn.
    const turnOf = new Array<number>(messages.length);
    let turn = 0;
    for (let i = 0; i < messages.length; i++) {
        turnOf[i] = turn;
        if (messages[i].kind === 'user-text') turn++;
    }
    return turnOf;
}

function collectToolRuns(
    messages: Message[],
    shouldInclude: (msg: Message, index: number) => boolean,
): Map<number, { msgs: Message[]; oldestIdx: number }> {
    const runsByIndex = new Map<number, { msgs: Message[]; oldestIdx: number }>();
    let current: { indexes: number[]; msgs: Message[] } | null = null;

    const flush = () => {
        if (!current || current.msgs.length === 0) {
            current = null;
            return;
        }
        const oldestIdx = current.indexes[current.indexes.length - 1];
        const run = { msgs: current.msgs, oldestIdx };
        for (const index of current.indexes) {
            runsByIndex.set(index, run);
        }
        current = null;
    };

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (!shouldInclude(msg, i)) {
            if (!isInvisibleMessage(msg)) {
                flush();
            }
            continue;
        }
        if (!current) {
            current = { indexes: [], msgs: [] };
        }
        current.indexes.push(i);
        current.msgs.push(msg);
    }
    flush();

    return runsByIndex;
}

function collectAgentWorkGroups(messages: Message[], turnOf: number[], collapseCurrentTurn: boolean): Array<{
    item: AgentWorkGroupItem;
    hiddenIndexes: number[];
    oldestIdx: number;
}> {
    const segments = new Map<number, number[]>();
    for (let i = 0; i < messages.length; i++) {
        const turn = turnOf[i];
        if (!segments.has(turn)) {
            segments.set(turn, []);
        }
        segments.get(turn)!.push(i);
    }

    const groups: Array<{
        item: AgentWorkGroupItem;
        hiddenIndexes: number[];
        oldestIdx: number;
    }> = [];

    for (const [turn, indexes] of segments) {
        if (turn === 0 && !collapseCurrentTurn) {
            continue;
        }

        const completionMarker = indexes
            .map((index) => messages[index])
            .find((message) => (
                message.kind === 'agent-event'
                && message.event.type === 'ready'
                && message.meta?.turnStatus === 'completed'
                && typeof message.meta.finalTextId === 'string'
            ));
        const finalTextId = completionMarker?.meta?.finalTextId;
        if (!finalTextId) continue;

        const visibleAgentIndexes = indexes.filter((index) => {
            const msg = messages[index];
            if (msg.kind === 'user-text') return false;
            if (isInvisibleMessage(msg) || isUserAttachment(msg)) return false;
            if (isPendingUserAction(msg)) return false;
            return true;
        });

        const finalTextIndex = visibleAgentIndexes.find((index) => (
            messages[index].kind === 'agent-text' && messages[index].id === finalTextId
        ));
        if (finalTextIndex === undefined) continue;

        const hiddenIndexes = visibleAgentIndexes.filter((index) => index > finalTextIndex);
        if (hiddenIndexes.length === 0) continue;

        const oldestIdx = Math.max(...hiddenIndexes);
        const hiddenMessages = hiddenIndexes.map((index) => messages[index]);
        const startedAt = Math.min(...hiddenMessages.map((msg) => msg.createdAt));
        const completedAt = completionMarker.createdAt;
        const hasRunning = hiddenMessages.some((msg) => msg.kind === 'tool-call' && msg.tool.state === 'running');

        groups.push({
            hiddenIndexes,
            oldestIdx,
            item: {
                type: 'agent-work-group',
                id: `work-${completionMarker.id}`,
                messages: hiddenMessages,
                hasRunning,
                hasPendingPermission: hasPendingPermission(hiddenMessages),
                startedAt,
                completedAt,
            },
        });
    }

    return groups;
}

/** Returns true for messages that render as null and should be excluded entirely */
function isInvisibleMessage(msg: Message): boolean {
    if (msg.kind === 'agent-event' && msg.event.type === 'ready') {
        return true;
    }
    // Hidden tools (ToolSearch, CodexReasoning, etc.)
    if (msg.kind === 'tool-call') {
        const known = knownTools[msg.tool.name as keyof typeof knownTools] as any;
        return known?.hidden === true;
    }
    // Thinking messages render as null in MessageView
    if (msg.kind === 'agent-text') {
        if (msg.isThinking) return true;
        if (msg.text.trim().length === 0) return true;
    }
    return false;
}

/** User-sent file/image attachments should never be collapsed into a group */
function isUserAttachment(msg: Message): boolean {
    return msg.kind === 'tool-call' && msg.tool.name === 'file';
}

function hasPendingPermission(messages: Message[]): boolean {
    return messages.some((msg) => (
        msg.kind === 'tool-call'
        && msg.tool.permission?.status === 'pending'
    ));
}

function isPendingUserAction(message: Message): boolean {
    return message.kind === 'tool-call'
        && message.tool.name === 'AskUserQuestion'
        && message.tool.state === 'running';
}

const FILE_EDIT_TOOLS = new Set([
    'Edit',
    'MultiEdit',
    'Write',
    'CodexPatch',
    'edit',
    'NotebookEdit',
]);

export type AgentWorkSummary = {
    toolCount: number;
    editedFileCount: number;
    errorCount: number;
    durationMs: number;
};

export function getAgentWorkSummary(
    messages: Message[],
    startedAt: number,
    completedAt: number | null,
): AgentWorkSummary {
    let toolCount = 0;
    let errorCount = 0;
    let editsWithoutPath = 0;
    const editedFiles = new Set<string>();

    for (const message of messages) {
        if (message.kind !== 'tool-call') continue;
        toolCount += 1;
        if (message.tool.state === 'error') errorCount += 1;
        if (!FILE_EDIT_TOOLS.has(message.tool.name)) continue;

        const paths = getEditedPaths(message.tool.input);
        if (paths.length === 0) editsWithoutPath += 1;
        else paths.forEach((path) => editedFiles.add(path));
    }

    return {
        toolCount,
        editedFileCount: editedFiles.size + editsWithoutPath,
        errorCount,
        durationMs: Math.max(0, (completedAt ?? Date.now()) - startedAt),
    };
}

export function formatAgentWorkSummaryLabel(summary: AgentWorkSummary, duration: string): string {
    return [
        t('toolGroup.usedTools', { count: summary.toolCount }),
        t('toolGroup.editedFiles', { count: summary.editedFileCount }),
        t('toolGroup.errors', { count: summary.errorCount }),
        t('toolGroup.workedFor', { duration }),
    ].join(' · ');
}

function getEditedPaths(input: any): string[] {
    const directPath = typeof input?.file_path === 'string'
        ? input.file_path
        : typeof input?.notebook_path === 'string'
            ? input.notebook_path
        : typeof input?.path === 'string'
            ? input.path
            : null;
    if (directPath?.trim()) return [directPath.trim()];

    const changes = input?.changes ?? input?.fileChanges;
    if (changes && typeof changes === 'object' && !Array.isArray(changes)) {
        return Object.keys(changes);
    }
    if (Array.isArray(changes)) {
        return changes.flatMap((change: unknown) => {
            if (!change || typeof change !== 'object' || Array.isArray(change)) return [];
            const path = (change as { path?: unknown }).path;
            return typeof path === 'string' && path.trim() ? [path.trim()] : [];
        });
    }
    return [];
}

// Tool name → category mapping for summary generation
const TOOL_CATEGORIES: Record<string, string> = {
    Edit: 'edit', MultiEdit: 'edit', Write: 'edit',
    CodexPatch: 'edit', edit: 'edit', NotebookEdit: 'edit',
    Read: 'read', read: 'read', NotebookRead: 'read',
    Bash: 'terminal', CodexBash: 'terminal',
    shell: 'terminal', execute: 'terminal',
    Grep: 'search', Glob: 'search', LS: 'search', search: 'search', WebSearch: 'search',
    WebFetch: 'web',
    Task: 'task', Agent: 'task',
};

/** Generate a human-readable summary of tools in a group */
export function generateGroupSummary(messages: Message[]): string {
    const counts: Record<string, number> = {};

    for (const msg of messages) {
        if (msg.kind === 'tool-call') {
            const category = TOOL_CATEGORIES[msg.tool.name] || 'other';
            counts[category] = (counts[category] || 0) + 1;
        }
    }

    const parts: string[] = [];

    if (counts.edit) parts.push(t('toolGroup.editedFiles', { count: counts.edit }));
    if (counts.read) parts.push(t('toolGroup.readFiles', { count: counts.read }));
    if (counts.terminal) parts.push(t('toolGroup.ranCommands', { count: counts.terminal }));
    if (counts.search) parts.push(t('toolGroup.searched', { count: counts.search }));
    if (counts.web) parts.push(t('toolGroup.fetchedUrls', { count: counts.web }));
    if (counts.task) parts.push(t('toolGroup.ranTasks', { count: counts.task }));
    if (counts.other) parts.push(t('toolGroup.usedTools', { count: counts.other }));

    return parts.join(', ') || t('toolGroup.usedTools', { count: messages.length });
}

export function formatWorkDuration(durationMs: number): string {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h${minutes}m`;
    }
    if (minutes > 0) {
        return `${minutes}m${seconds}s`;
    }
    return `${seconds}s`;
}
