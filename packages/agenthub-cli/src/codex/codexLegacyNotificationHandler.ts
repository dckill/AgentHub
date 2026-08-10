import type { EventMsg } from './codexAppServerTypes';
import { parseCodexLegacyNotification } from './codexLegacyNotification';

export interface CodexLegacyNotificationHandlerOptions {
    method: string;
    params: any;
    emitEvent: (event: EventMsg) => void;
    setTurnId: (turnId: string | null) => void;
    markPendingTurnStarted: (turnId?: string | null) => void;
    rememberCompletedTurnId: (turnId: string) => void;
    tryResolvePendingTurn: (aborted: boolean, turnId: string | null, source: string) => void;
}

export function handleCodexLegacyNotification(options: CodexLegacyNotificationHandlerOptions): boolean {
    const legacy = parseCodexLegacyNotification(options.method, options.params);
    if (!legacy.handled) {
        return false;
    }

    if (!legacy.message) {
        return true;
    }

    if (legacy.startedTurnId) {
        options.setTurnId(legacy.startedTurnId);
    }
    if (legacy.isTaskStarted) {
        options.markPendingTurnStarted(legacy.turnId);
    }

    options.emitEvent(legacy.message);

    if (legacy.isTerminal) {
        if (legacy.turnId) {
            options.rememberCompletedTurnId(legacy.turnId);
        }
        options.tryResolvePendingTurn(
            legacy.aborted,
            legacy.turnId,
            `codex/event/${legacy.aborted ? 'turn_aborted' : 'task_complete'}`,
        );
        options.setTurnId(null);
    }

    return true;
}
