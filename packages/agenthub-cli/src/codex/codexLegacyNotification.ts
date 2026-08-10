import type { EventMsg } from './codexAppServerTypes';

export type CodexLegacyNotification =
    | { handled: false }
    | {
        handled: true;
        message?: EventMsg;
        startedTurnId: string | null;
        turnId: string | null;
        isTaskStarted: boolean;
        isTerminal: boolean;
        aborted: boolean;
    };

export function parseCodexLegacyNotification(method: string, params: any): CodexLegacyNotification {
    if (method !== 'codex/event' && !method.startsWith('codex/event/')) {
        return { handled: false };
    }

    const message = params?.msg;
    if (!message || typeof message !== 'object') {
        return {
            handled: true,
            startedTurnId: null,
            turnId: null,
            isTaskStarted: false,
            isTerminal: false,
            aborted: false,
        };
    }

    const eventMessage = message as EventMsg;
    const type = typeof eventMessage.type === 'string' ? eventMessage.type : '';
    const turnId = typeof eventMessage.turn_id === 'string'
        ? eventMessage.turn_id
        : typeof eventMessage.turnId === 'string'
            ? eventMessage.turnId
            : null;
    const isTaskStarted = type === 'task_started';
    const aborted = type === 'turn_aborted';

    return {
        handled: true,
        message: eventMessage,
        startedTurnId: isTaskStarted && typeof eventMessage.turn_id === 'string' ? eventMessage.turn_id : null,
        turnId,
        isTaskStarted,
        isTerminal: type === 'task_complete' || aborted,
        aborted,
    };
}
