import type { Message } from '@/sync/typesMessage';

type ThinkingState = boolean | null;

type ThinkingSource = {
    active?: boolean;
    activeAt?: number;
    thinking?: boolean | null;
    thinkingAt?: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function resolveSessionThinkingState(
    existing: ThinkingSource | null | undefined,
    incoming: ThinkingSource,
): { thinking: boolean; thinkingAt: number } {
    const incomingThinkingAt = typeof incoming.thinkingAt === 'number'
        ? incoming.thinkingAt
        : incoming.thinking === true
            ? incoming.activeAt ?? 0
            : incoming.active === false
                ? incoming.activeAt ?? 0
            : 0;
    const incomingState = {
        thinking: incoming.active !== false && incoming.thinking === true,
        thinkingAt: incomingThinkingAt,
    };

    if (incoming.active === false) {
        return incomingState;
    }

    if (!existing) {
        return incomingState;
    }

    const existingThinkingAt = typeof existing.thinkingAt === 'number' ? existing.thinkingAt : 0;
    if (existingThinkingAt > incomingThinkingAt) {
        return {
            thinking: existing.active !== false && existing.thinking === true,
            thinkingAt: existingThinkingAt,
        };
    }

    return incomingState;
}

export function resolveActivityThinkingState(
    existing: ThinkingSource | null | undefined,
    incoming: ThinkingSource,
): { thinking: boolean; thinkingAt: number } {
    const incomingThinkingAt = incoming.activeAt ?? (
        typeof incoming.thinkingAt === 'number' ? incoming.thinkingAt : 0
    );

    if (incoming.active === false) {
        return { thinking: false, thinkingAt: incomingThinkingAt };
    }

    if (incoming.thinking === true) {
        return { thinking: true, thinkingAt: incomingThinkingAt };
    }

    if (existing?.active !== false && existing?.thinking === true) {
        return {
            thinking: true,
            thinkingAt: typeof existing.thinkingAt === 'number' ? existing.thinkingAt : incomingThinkingAt,
        };
    }

    return { thinking: false, thinkingAt: incomingThinkingAt };
}

export function getLifecycleThinkingStateFromRawContent(content: unknown): ThinkingState {
    if (!isRecord(content)) {
        return null;
    }

    const payload = isRecord(content.content) ? content.content : null;
    const data = payload && isRecord(payload.data) ? payload.data : null;
    const ev = data && isRecord(data.ev) ? data.ev : null;

    const contentType = typeof payload?.type === 'string' ? payload.type : null;
    const dataType = typeof data?.type === 'string' ? data.type : null;
    const sessionEventType = typeof ev?.t === 'string' ? ev.t : null;

    if (
        ((contentType === 'acp' || contentType === 'codex') && dataType === 'task_started') ||
        (contentType === 'session' && sessionEventType === 'turn-start')
    ) {
        return true;
    }

    if (
        ((contentType === 'acp' || contentType === 'codex') && (dataType === 'task_complete' || dataType === 'turn_aborted')) ||
        (contentType === 'session' && sessionEventType === 'turn-end')
    ) {
        return false;
    }

    return null;
}

export function inferThinkingFromMessages(messages: Message[]): boolean {
    const stack = [...messages];
    while (stack.length > 0) {
        const message = stack.pop();
        if (!message) continue;
        if (message.kind === 'tool-call') {
            if (message.tool.state === 'running') {
                return true;
            }
            stack.push(...message.children);
        }
    }
    return false;
}
