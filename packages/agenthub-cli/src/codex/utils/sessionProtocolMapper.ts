import { randomUUID } from 'node:crypto';
import { createId } from '@paralleldrive/cuid2';
import type { ReasoningOutput } from './reasoningProcessor';
import type { DiffToolCall, DiffToolResult } from './diffProcessor';
import {
    createEnvelope,
    stripLeadingTaskNotificationWrappers,
    type CreateEnvelopeOptions,
    type SessionEnvelope,
} from '@artsum/agenthub-wire';
import type { Thread, ThreadItem, ThreadTurn } from '../codexAppServerTypes';

export type CodexTurnState = {
    currentTurnId: string | null;
    finalAnswerMessageId?: string | null;
    startedSubagents?: Set<string>;
    activeSubagents?: Set<string>;
    providerSubagentToSessionSubagent?: Map<string, string>;
};

type CodexMapperResult = {
    currentTurnId: string | null;
    finalAnswerMessageId?: string | null;
    startedSubagents: Set<string>;
    activeSubagents: Set<string>;
    providerSubagentToSessionSubagent: Map<string, string>;
    envelopes: SessionEnvelope[];
};

type LegacyToolLikeMessage = {
    type: 'tool-call' | 'tool-call-result';
    callId: string;
    name?: string;
    input?: unknown;
    output?: {
        content?: string;
        status?: 'completed' | 'canceled';
    };
};

type TurnEndStatus = 'completed' | 'failed' | 'cancelled';

type CollabTracking = {
    receiverThreadIdsByCall: Map<string, string[]>;
    toolByCall: Map<string, string>;
};

const collabTrackingByProviderMap = new WeakMap<Map<string, string>, CollabTracking>();

function getCollabTracking(providerMap: Map<string, string>): CollabTracking {
    const existing = collabTrackingByProviderMap.get(providerMap);
    if (existing) return existing;
    const created: CollabTracking = {
        receiverThreadIdsByCall: new Map(),
        toolByCall: new Map(),
    };
    collabTrackingByProviderMap.set(providerMap, created);
    return created;
}

function getStartedSubagents(state: CodexTurnState): Set<string> {
    return state.startedSubagents ?? new Set<string>();
}

function getActiveSubagents(state: CodexTurnState): Set<string> {
    return state.activeSubagents ?? new Set<string>();
}

function getProviderSubagentToSessionSubagent(state: CodexTurnState): Map<string, string> {
    return state.providerSubagentToSessionSubagent ?? new Map<string, string>();
}

function providerTurnId(message: Record<string, unknown>): string | null {
    const value = message.turn_id ?? message.turnId;
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function providerItemId(message: Record<string, unknown>): string | null {
    const value = message.item_id ?? message.itemId;
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function maybeEmitSubagentStart(
    subagent: string | undefined,
    opts: CreateEnvelopeOptions,
    startedSubagents: Set<string>,
    activeSubagents: Set<string>,
    envelopes: SessionEnvelope[],
    title?: string,
): void {
    if (!subagent || startedSubagents.has(subagent)) {
        return;
    }

    envelopes.push(createEnvelope('agent', {
        t: 'start',
        ...(title ? { title } : {}),
    }, { ...opts, subagent }));
    startedSubagents.add(subagent);
    activeSubagents.add(subagent);
}

function maybeEmitSubagentStop(
    subagent: string | undefined,
    opts: CreateEnvelopeOptions,
    activeSubagents: Set<string>,
    envelopes: SessionEnvelope[],
): void {
    if (!subagent || !activeSubagents.has(subagent)) return;
    envelopes.push(createEnvelope('agent', { t: 'stop' }, { ...opts, subagent }));
    activeSubagents.delete(subagent);
}

function emitSubagentStops(
    opts: CreateEnvelopeOptions,
    startedSubagents: Set<string>,
    activeSubagents: Set<string>,
): SessionEnvelope[] {
    const envelopes: SessionEnvelope[] = [];
    for (const subagent of activeSubagents) {
        envelopes.push(createEnvelope('agent', { t: 'stop' }, { ...opts, subagent }));
    }
    activeSubagents.clear();
    startedSubagents.clear();
    return envelopes;
}

function buildEnvelopeOptions(currentTurnId: string | null, subagent?: string): CreateEnvelopeOptions {
    return {
        ...(currentTurnId ? { turn: currentTurnId } : {}),
        ...(subagent ? { subagent } : {}),
    };
}

function pickProviderSubagent(message: Record<string, unknown>): string | undefined {
    const candidates = [
        message.subagent,
        message.agent_thread_id,
        message.agentThreadId,
        message.parent_call_id,
        message.parentCallId,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.length > 0) {
            return candidate;
        }
    }
    return undefined;
}

function pickString(message: Record<string, unknown>, ...keys: string[]): string | undefined {
    for (const key of keys) {
        const value = message[key];
        if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    }
    return undefined;
}

function pickStringArray(message: Record<string, unknown>, ...keys: string[]): string[] {
    for (const key of keys) {
        const value = message[key];
        if (Array.isArray(value)) {
            return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
        }
    }
    return [];
}

function ensureSessionSubagent(
    providerId: string,
    providerMap: Map<string, string>,
): string {
    const existing = providerMap.get(providerId);
    if (existing) return existing;
    const created = createId();
    providerMap.set(providerId, created);
    return created;
}

function resolveSessionSubagent(
    message: Record<string, unknown>,
    providerSubagentToSessionSubagent: Map<string, string>,
): string | undefined {
    const providerSubagent = pickProviderSubagent(message);
    if (!providerSubagent) {
        return undefined;
    }

    const existing = providerSubagentToSessionSubagent.get(providerSubagent);
    if (existing) {
        return existing;
    }

    const created = createId();
    providerSubagentToSessionSubagent.set(providerSubagent, created);
    return created;
}

function visibleCodexMessageText(text: string): string | null {
    const visible = stripLeadingTaskNotificationWrappers(text);
    return visible.trim().length > 0 ? visible : null;
}

function pickCallId(message: Record<string, unknown>): string {
    const callId = message.call_id ?? message.callId;
    if (typeof callId === 'string' && callId.length > 0) {
        return callId;
    }
    return randomUUID();
}

function summarizeCommand(command: unknown): string | null {
    if (typeof command === 'string' && command.trim().length > 0) {
        return command;
    }
    if (Array.isArray(command)) {
        const cmd = command.map(v => String(v)).join(' ').trim();
        return cmd.length > 0 ? cmd : null;
    }
    return null;
}

function commandToTitle(command: string | null): string {
    if (!command) {
        return 'Run command';
    }
    const short = command.length > 80 ? `${command.slice(0, 77)}...` : command;
    return `Run \`${short}\``;
}

export function turnTimestampMs(turn: ThreadTurn): number {
    const seconds = turn.startedAt ?? turn.completedAt;
    return typeof seconds === 'number' && Number.isFinite(seconds)
        ? seconds * 1000
        : Date.now();
}

export function completedTimestampMs(turn: ThreadTurn): number {
    const seconds = turn.completedAt ?? turn.startedAt;
    return typeof seconds === 'number' && Number.isFinite(seconds)
        ? seconds * 1000
        : Date.now();
}

function textFromInputItems(items: unknown): string | null {
    if (!Array.isArray(items)) {
        return null;
    }
    const text = items
        .filter((item): item is { type: 'text'; text: string } => (
            Boolean(item)
            && typeof item === 'object'
            && (item as { type?: unknown }).type === 'text'
            && typeof (item as { text?: unknown }).text === 'string'
        ))
        .map((item) => item.text)
        .join('\n')
        .trim();
    return text.length > 0 ? text : null;
}

function reasoningText(item: ThreadItem): string | null {
    const summary = (item as { summary?: unknown }).summary;
    const content = (item as { content?: unknown }).content;
    const parts = [
        ...(Array.isArray(summary) ? summary : []),
        ...(Array.isArray(content) ? content : []),
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    const text = parts.join('\n').trim();
    return text.length > 0 ? text : null;
}

export function turnStatus(turn: ThreadTurn): TurnEndStatus {
    const status = typeof turn.status === 'string' ? turn.status : null;
    if (status === 'failed') {
        return 'failed';
    }
    if (status === 'cancelled' || status === 'canceled' || status === 'aborted' || status === 'interrupted') {
        return 'cancelled';
    }
    return 'completed';
}

function emitHistoricalToolCall(
    envelopes: SessionEnvelope[],
    turn: ThreadTurn,
    item: ThreadItem,
    name: string,
    title: string,
    args: Record<string, unknown>,
    output: string | null,
    timestamps?: {
        startedAt: number;
        completedAt: number;
    },
): void {
    const time = timestamps?.startedAt ?? turnTimestampMs(turn);
    const opts = { turn: turn.id, time } satisfies CreateEnvelopeOptions;
    envelopes.push(createEnvelope('agent', {
        t: 'tool-call-start',
        call: item.id,
        name,
        title,
        description: title,
        args,
    }, {
        ...opts,
        id: `${item.id}:start`,
    }));

    if (output && output.trim().length > 0) {
        envelopes.push(createEnvelope('agent', {
            t: 'text',
            text: output,
            thinking: true,
        }, {
            ...opts,
            id: `${item.id}:output`,
        }));
    }

    envelopes.push(createEnvelope('agent', {
        t: 'tool-call-end',
        call: item.id,
    }, {
        ...opts,
        id: `${item.id}:end`,
        time: timestamps?.completedAt ?? completedTimestampMs(turn),
    }));
}

export function mapCodexThreadItemToSessionEnvelopes(
    turn: ThreadTurn,
    item: ThreadItem,
    timestamps?: {
        startedAt: number;
        completedAt: number;
    },
): SessionEnvelope[] {
    const startedAt = timestamps?.startedAt ?? turnTimestampMs(turn);
    const completedAt = timestamps?.completedAt ?? completedTimestampMs(turn);

    switch (item.type) {
        case 'userMessage': {
            const text = textFromInputItems(item.content);
            const visibleText = text ? visibleCodexMessageText(text) : null;
            return visibleText
                ? [createEnvelope('user', { t: 'text', text: visibleText }, {
                    id: item.id,
                    codexItemId: item.id,
                    time: startedAt,
                })]
                : [];
        }
        case 'agentMessage': {
            const text = typeof item.text === 'string' ? item.text.trim() : '';
            const visibleText = visibleCodexMessageText(text);
            return visibleText
                ? [createEnvelope('agent', { t: 'text', text: visibleText }, {
                    id: item.id,
                    codexItemId: item.id,
                    turn: turn.id,
                    time: completedAt,
                })]
                : [];
        }
        case 'reasoning': {
            const text = reasoningText(item);
            return text
                ? [createEnvelope('agent', { t: 'text', text, thinking: true }, {
                    id: item.id,
                    turn: turn.id,
                    time: startedAt,
                })]
                : [];
        }
        case 'commandExecution': {
            const envelopes: SessionEnvelope[] = [];
            const command = typeof item.command === 'string' ? item.command : '';
            emitHistoricalToolCall(
                envelopes,
                turn,
                item,
                'CodexBash',
                commandToTitle(command),
                { command, cwd: item.cwd },
                typeof item.aggregatedOutput === 'string' ? item.aggregatedOutput : null,
                { startedAt, completedAt },
            );
            return envelopes;
        }
        case 'fileChange': {
            const envelopes: SessionEnvelope[] = [];
            emitHistoricalToolCall(
                envelopes,
                turn,
                item,
                'CodexPatch',
                'Apply patch',
                { changes: item.changes, status: item.status },
                null,
                { startedAt, completedAt },
            );
            return envelopes;
        }
        case 'mcpToolCall': {
            const envelopes: SessionEnvelope[] = [];
            const title = `${item.server}.${item.tool}`;
            const output = item.error !== undefined && item.error !== null
                ? String(item.error)
                : (item.result !== undefined && item.result !== null ? String(item.result) : null);
            emitHistoricalToolCall(
                envelopes,
                turn,
                item,
                'McpTool',
                title,
                {
                    server: item.server,
                    tool: item.tool,
                    arguments: item.arguments,
                },
                output,
                { startedAt, completedAt },
            );
            return envelopes;
        }
        default:
            return [];
    }
}

export function mapCodexThreadToSessionEnvelopes(thread: Pick<Thread, 'turns'>): SessionEnvelope[] {
    const envelopes: SessionEnvelope[] = [];

    for (const turn of thread.turns ?? []) {
        const startedAt = turnTimestampMs(turn);
        const completedAt = completedTimestampMs(turn);
        envelopes.push(createEnvelope('agent', { t: 'turn-start' }, {
            id: `${turn.id}:start`,
            turn: turn.id,
            time: startedAt,
        }));

        const timestamps = { startedAt, completedAt };
        for (const item of turn.items ?? []) {
            envelopes.push(...mapCodexThreadItemToSessionEnvelopes(turn, item, timestamps));
        }

        const status = turnStatus(turn);
        const finalTextId = status === 'completed'
            ? turn.items?.find((item) => item.type === 'agentMessage' && item.phase === 'final_answer')?.id
            : undefined;
        envelopes.push(createEnvelope('agent', {
            t: 'turn-end',
            status,
            ...(finalTextId ? { finalTextId } : {}),
        }, {
            id: `${turn.id}:end`,
            turn: turn.id,
            time: completedAt,
        }));
    }

    return envelopes;
}

function toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    return null;
}

function buildExecCommandResult(message: Record<string, unknown>): { output: Record<string, unknown>; isError: boolean } {
    const output = typeof message.output === 'string' ? message.output : '';
    const stderr = typeof message.stderr === 'string' ? message.stderr : '';
    const error = typeof message.error === 'string' ? message.error : '';
    const exitCode = toNumber(message.exit_code ?? message.exitCode);
    const durationMs = toNumber(message.duration_ms ?? message.durationMs);
    const status = typeof message.status === 'string' ? message.status : undefined;
    const isError = Boolean(error)
        || (exitCode !== null && exitCode !== 0)
        || status === 'failed'
        || status === 'error';

    return {
        output: {
            stdout: output,
            stderr,
            ...(error ? { error } : {}),
            ...(exitCode !== null ? { exit_code: exitCode } : {}),
            ...(durationMs !== null ? { duration_ms: durationMs } : {}),
            ...(status ? { status } : {}),
        },
        isError,
    };
}

function patchDescription(changes: unknown): string {
    if (!changes || typeof changes !== 'object') {
        return 'Applying patch';
    }
    const fileCount = Object.keys(changes as Record<string, unknown>).length;
    if (fileCount === 1) {
        return 'Applying patch to 1 file';
    }
    return `Applying patch to ${fileCount} files`;
}

function pickTurnEndStatus(message: Record<string, unknown>, type: unknown): TurnEndStatus {
    const rawStatus = message.status;
    if (rawStatus === 'completed' || rawStatus === 'failed' || rawStatus === 'cancelled') {
        return rawStatus;
    }
    if (rawStatus === 'canceled') {
        return 'cancelled';
    }

    // Abort events are treated as cancelled unless they explicitly look like failures.
    if (type === 'turn_aborted') {
        const reason = message.reason;
        const error = message.error;
        if ((typeof reason === 'string' && /(fail|error)/i.test(reason))
            || (typeof error === 'string' && error.length > 0)
            || (error !== undefined && error !== null && typeof error === 'object')) {
            return 'failed';
        }
        return 'cancelled';
    }

    if (message.error !== undefined && message.error !== null) {
        return 'failed';
    }

    return 'completed';
}

export function mapCodexMcpMessageToSessionEnvelopes(message: Record<string, unknown>, state: CodexTurnState): CodexMapperResult {
    const type = message.type;
    const startedSubagents = getStartedSubagents(state);
    const activeSubagents = getActiveSubagents(state);
    const providerSubagentToSessionSubagent = getProviderSubagentToSessionSubagent(state);

    if (type === 'task_started') {
        const turnId = providerTurnId(message) ?? createId();
        const turnStart = createEnvelope('agent', { t: 'turn-start' }, {
            id: `${turnId}:start`,
            turn: turnId,
        });
        startedSubagents.clear();
        activeSubagents.clear();
        const tracking = getCollabTracking(providerSubagentToSessionSubagent);
        tracking.receiverThreadIdsByCall.clear();
        tracking.toolByCall.clear();
        return {
            currentTurnId: turnId,
            finalAnswerMessageId: null,
            startedSubagents,
            activeSubagents,
            providerSubagentToSessionSubagent,
            envelopes: [turnStart],
        };
    }

    if (type === 'task_complete' || type === 'turn_aborted') {
        if (!state.currentTurnId) {
            return {
                currentTurnId: null,
                startedSubagents,
                activeSubagents,
                providerSubagentToSessionSubagent,
                envelopes: [],
            };
        }

        const turnId = state.currentTurnId ?? providerTurnId(message);
        if (!turnId) {
            return {
                currentTurnId: null,
                startedSubagents,
                activeSubagents,
                providerSubagentToSessionSubagent,
                envelopes: [],
            };
        }
        const lifecycleOpts = { turn: turnId } satisfies CreateEnvelopeOptions;
        const status = pickTurnEndStatus(message, type);
        const tracking = getCollabTracking(providerSubagentToSessionSubagent);
        tracking.receiverThreadIdsByCall.clear();
        tracking.toolByCall.clear();
        return {
            currentTurnId: null,
            finalAnswerMessageId: null,
            startedSubagents,
            activeSubagents,
            providerSubagentToSessionSubagent,
            envelopes: [
                ...emitSubagentStops(lifecycleOpts, startedSubagents, activeSubagents),
                createEnvelope('agent', {
                    t: 'turn-end',
                    status,
                    ...(status === 'completed' && state.finalAnswerMessageId
                        ? { finalTextId: state.finalAnswerMessageId }
                        : {}),
                }, { ...lifecycleOpts, id: `${turnId}:end` }),
            ],
        };
    }

    if (type === 'token_count') {
        return {
            currentTurnId: state.currentTurnId,
            startedSubagents,
            activeSubagents,
            providerSubagentToSessionSubagent,
            envelopes: [],
        };
    }

    if (type === 'collab_agent_begin' || type === 'collab_agent_end') {
        const call = pickCallId(message);
        const tracking = getCollabTracking(providerSubagentToSessionSubagent);
        const payloadReceivers = pickStringArray(message, 'receiver_thread_ids', 'receiverThreadIds');
        const receivers = payloadReceivers.length > 0
            ? payloadReceivers
            : (tracking.receiverThreadIdsByCall.get(call) ?? []);
        const payloadTool = pickString(message, 'tool');
        const tool = payloadTool ?? tracking.toolByCall.get(call) ?? 'subagent';
        const prompt = pickString(message, 'prompt');
        const model = pickString(message, 'model');
        const status = pickString(message, 'status');
        const sessionSubagents = receivers.map((receiver) => (
            ensureSessionSubagent(receiver, providerSubagentToSessionSubagent)
        ));
        const lifecycleOpts = buildEnvelopeOptions(state.currentTurnId);
        const envelopes: SessionEnvelope[] = [];

        if (type === 'collab_agent_begin') {
            tracking.receiverThreadIdsByCall.set(call, receivers);
            tracking.toolByCall.set(call, tool);
            const primary = sessionSubagents[0];
            const title = prompt ?? (tool === 'spawnAgent' ? 'Spawn Codex subagent' : `Codex subagent: ${tool}`);
            envelopes.push(createEnvelope('agent', {
                t: 'tool-call-start',
                call,
                name: 'CodexSubagent',
                title,
                description: title,
                args: {
                    ...(prompt ? { prompt } : {}),
                    ...(model ? { model } : {}),
                    ...(status ? { status } : {}),
                    ...(primary ? { sessionSubagent: primary } : {}),
                    sessionSubagents,
                    agentStates: [],
                },
            }, { ...lifecycleOpts, id: `${call}:start` }));
            for (let index = 0; index < sessionSubagents.length; index += 1) {
                maybeEmitSubagentStart(
                    sessionSubagents[index],
                    lifecycleOpts,
                    startedSubagents,
                    activeSubagents,
                    envelopes,
                    prompt,
                );
            }
        } else {
            const rawStates = message.agents_states ?? message.agentsStates;
            const terminalSubagents = new Set<string>();
            if (rawStates && typeof rawStates === 'object' && !Array.isArray(rawStates)) {
                for (const [providerId, rawState] of Object.entries(rawStates as Record<string, unknown>)) {
                    if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) continue;
                    const stateRecord = rawState as Record<string, unknown>;
                    const subagent = ensureSessionSubagent(providerId, providerSubagentToSessionSubagent);
                    const childStatus = pickString(stateRecord, 'status');
                    const childMessage = pickString(stateRecord, 'message');
                    if (childStatus === 'completed' || childStatus === 'failed'
                        || childStatus === 'cancelled' || childStatus === 'canceled'
                        || childStatus === 'interrupted' || childStatus === 'closed') {
                        terminalSubagents.add(subagent);
                    }
                    const text = `Codex subagent${childStatus ? ` ${childStatus}` : ''}${childMessage ? `: ${childMessage}` : ''}`;
                    envelopes.push(createEnvelope('agent', { t: 'service', text }, {
                        ...lifecycleOpts,
                        subagent,
                    }));
                }
            }
            if (tool === 'closeAgent') {
                sessionSubagents.forEach((subagent) => terminalSubagents.add(subagent));
            }
            for (const subagent of terminalSubagents) {
                maybeEmitSubagentStop(subagent, lifecycleOpts, activeSubagents, envelopes);
            }
            envelopes.push(createEnvelope('agent', {
                t: 'tool-call-end',
                call,
                ...(status === 'failed' ? { isError: true } : {}),
            }, { ...lifecycleOpts, id: `${call}:end` }));
            tracking.receiverThreadIdsByCall.delete(call);
            tracking.toolByCall.delete(call);
        }

        return {
            currentTurnId: state.currentTurnId,
            finalAnswerMessageId: state.finalAnswerMessageId,
            startedSubagents,
            activeSubagents,
            providerSubagentToSessionSubagent,
            envelopes,
        };
    }

    if (type === 'subagent_activity') {
        const subagent = resolveSessionSubagent(message, providerSubagentToSessionSubagent);
        if (!subagent) {
            return {
                currentTurnId: state.currentTurnId,
                startedSubagents,
                activeSubagents,
                providerSubagentToSessionSubagent,
                envelopes: [],
            };
        }
        const kind = pickString(message, 'kind');
        const path = pickString(message, 'agent_path', 'agentPath');
        const opts = buildEnvelopeOptions(state.currentTurnId, subagent);
        const envelopes: SessionEnvelope[] = [];
        if (kind === 'started') {
            maybeEmitSubagentStart(subagent, opts, startedSubagents, activeSubagents, envelopes, path);
            envelopes.push(createEnvelope('agent', {
                t: 'service',
                text: path ? `Codex subagent started: ${path}` : 'Codex subagent started',
            }, opts));
        } else if (kind === 'interrupted' || kind === 'completed' || kind === 'failed') {
            envelopes.push(createEnvelope('agent', {
                t: 'service',
                text: `Codex subagent ${kind}`,
            }, opts));
            maybeEmitSubagentStop(subagent, opts, activeSubagents, envelopes);
        }
        return {
            currentTurnId: state.currentTurnId,
            finalAnswerMessageId: state.finalAnswerMessageId,
            startedSubagents,
            activeSubagents,
            providerSubagentToSessionSubagent,
            envelopes,
        };
    }

    const subagent = resolveSessionSubagent(message, providerSubagentToSessionSubagent);
    const opts = buildEnvelopeOptions(state.currentTurnId, subagent);

    if (type === 'agent_message') {
        if (typeof message.message !== 'string') {
            return {
                currentTurnId: state.currentTurnId,
                startedSubagents,
                activeSubagents,
                providerSubagentToSessionSubagent,
                envelopes: [],
            };
        }

        const visibleText = visibleCodexMessageText(message.message);
        if (!visibleText) {
            return {
                currentTurnId: state.currentTurnId,
                finalAnswerMessageId: state.finalAnswerMessageId,
                startedSubagents,
                activeSubagents,
                providerSubagentToSessionSubagent,
                envelopes: [],
            };
        }

        const envelopes: SessionEnvelope[] = [];
        maybeEmitSubagentStart(subagent, opts, startedSubagents, activeSubagents, envelopes);
        const itemId = providerItemId(message);
        const textEnvelope = createEnvelope('agent', { t: 'text', text: visibleText }, {
            ...opts,
            ...(itemId ? { id: itemId } : {}),
        });
        envelopes.push(textEnvelope);
        return {
            currentTurnId: state.currentTurnId,
            finalAnswerMessageId: !subagent && message.phase === 'final_answer'
                ? textEnvelope.id
                : state.finalAnswerMessageId,
            startedSubagents,
            activeSubagents,
            providerSubagentToSessionSubagent,
            envelopes,
        };
    }

    if (type === 'agent_reasoning' || type === 'agent_reasoning_delta') {
        const text = typeof message.text === 'string'
            ? message.text
            : (typeof message.delta === 'string' ? message.delta : null);

        if (!text) {
            return {
                currentTurnId: state.currentTurnId,
                startedSubagents,
                activeSubagents,
                providerSubagentToSessionSubagent,
                envelopes: [],
            };
        }

        const envelopes: SessionEnvelope[] = [];
        maybeEmitSubagentStart(subagent, opts, startedSubagents, activeSubagents, envelopes);
        const itemId = providerItemId(message);
        envelopes.push(createEnvelope('agent', { t: 'text', text, thinking: true }, {
            ...opts,
            ...(itemId ? { id: itemId } : {}),
        }));
        return {
            currentTurnId: state.currentTurnId,
            startedSubagents,
            activeSubagents,
            providerSubagentToSessionSubagent,
            envelopes,
        };
    }

    // exec_approval_request is intentionally NOT mapped here — the permission
    // handler already renders the approval UI via agent state.  Mapping it to
    // tool-call-start too would create a duplicate tool call card.
    if (type === 'exec_command_begin') {
        const call = pickCallId(message);
        const { call_id: _callIdSnake, callId: _callIdCamel, type: _type, ...args } = message;

        const command = summarizeCommand((args as Record<string, unknown>).command);
        const description = typeof (args as Record<string, unknown>).description === 'string'
            ? ((args as Record<string, string>).description)
            : (command ?? 'Execute command');

        const envelopes: SessionEnvelope[] = [];
        maybeEmitSubagentStart(subagent, opts, startedSubagents, activeSubagents, envelopes);
        envelopes.push(
            createEnvelope('agent', {
                t: 'tool-call-start',
                call,
                name: 'CodexBash',
                title: commandToTitle(command),
                description,
                args: args as Record<string, unknown>,
            }, { ...opts, id: `${call}:start` })
        );
        return {
            currentTurnId: state.currentTurnId,
            startedSubagents,
            activeSubagents,
            providerSubagentToSessionSubagent,
            envelopes,
        };
    }

    if (type === 'exec_command_end') {
        const call = pickCallId(message);
        const result = buildExecCommandResult(message);
        const envelopes: SessionEnvelope[] = [];
        maybeEmitSubagentStart(subagent, opts, startedSubagents, activeSubagents, envelopes);
        envelopes.push(createEnvelope('agent', {
            t: 'tool-call-end',
            call,
            output: result.output,
            ...(result.isError ? { isError: true } : {}),
        }, { ...opts, id: `${call}:end` }));
        return {
            currentTurnId: state.currentTurnId,
            startedSubagents,
            activeSubagents,
            providerSubagentToSessionSubagent,
            envelopes,
        };
    }

    if (type === 'patch_apply_begin') {
        const call = pickCallId(message);
        const autoApproved = (message as { auto_approved?: unknown }).auto_approved;
        const changes = (message as { changes?: unknown }).changes;

        const envelopes: SessionEnvelope[] = [];
        maybeEmitSubagentStart(subagent, opts, startedSubagents, activeSubagents, envelopes);
        envelopes.push(
            createEnvelope('agent', {
                t: 'tool-call-start',
                call,
                name: 'CodexPatch',
                title: 'Apply patch',
                description: patchDescription(changes),
                args: {
                    auto_approved: autoApproved,
                    changes,
                },
            }, { ...opts, id: `${call}:start` })
        );
        return {
            currentTurnId: state.currentTurnId,
            startedSubagents,
            activeSubagents,
            providerSubagentToSessionSubagent,
            envelopes,
        };
    }

    if (type === 'patch_apply_end') {
        const call = pickCallId(message);
        const envelopes: SessionEnvelope[] = [];
        maybeEmitSubagentStart(subagent, opts, startedSubagents, activeSubagents, envelopes);
        envelopes.push(createEnvelope('agent', { t: 'tool-call-end', call }, {
            ...opts,
            id: `${call}:end`,
        }));
        return {
            currentTurnId: state.currentTurnId,
            startedSubagents,
            activeSubagents,
            providerSubagentToSessionSubagent,
            envelopes,
        };
    }

    return {
        currentTurnId: state.currentTurnId,
        startedSubagents,
        activeSubagents,
        providerSubagentToSessionSubagent,
        envelopes: [],
    };
}

export function closeCodexTurnWithStatus(
    state: CodexTurnState,
    status: TurnEndStatus = 'cancelled',
): CodexMapperResult {
    const result = mapCodexMcpMessageToSessionEnvelopes(
        {
            type: status === 'completed' ? 'task_complete' : 'turn_aborted',
            status,
        },
        state,
    );
    // Runner shutdown is terminal for the session; unlike a normal turn end,
    // no later turn can reuse provider identities.
    result.providerSubagentToSessionSubagent.clear();
    return result;
}

export function mapCodexProcessorMessageToSessionEnvelopes(
    message: ReasoningOutput | DiffToolCall | DiffToolResult,
    state: CodexTurnState,
): SessionEnvelope[] {
    const toolLikeMessage = message as LegacyToolLikeMessage;
    const opts = buildEnvelopeOptions(state.currentTurnId);

    if (message.type === 'reasoning') {
        return [createEnvelope('agent', {
            t: 'text',
            text: message.message,
            thinking: true,
        }, opts)];
    }

    if (message.type === 'tool-call') {
        const title = typeof (toolLikeMessage.input as { title?: unknown } | undefined)?.title === 'string'
            ? (toolLikeMessage.input as { title: string }).title
            : `${toolLikeMessage.name || 'Tool'} call`;

        return [createEnvelope('agent', {
            t: 'tool-call-start',
            call: toolLikeMessage.callId,
            name: toolLikeMessage.name || 'unknown',
            title,
            description: title,
            args: (toolLikeMessage.input && typeof toolLikeMessage.input === 'object'
                ? toolLikeMessage.input
                : {}) as Record<string, unknown>,
        }, opts)];
    }

    if (message.type === 'tool-call-result') {
        const envelopes: SessionEnvelope[] = [];
        const content = toolLikeMessage.output?.content;
        if (typeof content === 'string' && content.trim().length > 0) {
            envelopes.push(createEnvelope('agent', {
                t: 'text',
                text: content,
                thinking: true,
            }, opts));
        }
        envelopes.push(createEnvelope('agent', {
            t: 'tool-call-end',
            call: toolLikeMessage.callId,
        }, opts));
        return envelopes;
    }

    return [];
}
