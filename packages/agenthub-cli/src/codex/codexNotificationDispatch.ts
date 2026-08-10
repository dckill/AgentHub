import { buildCodexNotification } from './codexTransportEnvelope';
import { writeCodexTransportMessage } from './codexTransportWrite';

export type CodexNotificationStdin = {
    writable?: boolean;
    write: (line: string) => void;
};

export type CodexNotificationDispatchParams = {
    stdin?: CodexNotificationStdin | null;
    method: string;
    params?: unknown;
    onWrite: (method: string) => void;
};

/** Write one JSON-RPC notification and report success only after stdin accepts it. */
export function dispatchCodexNotification(params: CodexNotificationDispatchParams): boolean {
    const message = buildCodexNotification(params.method, params.params);
    if (!writeCodexTransportMessage({ stdin: params.stdin, message })) {
        return false;
    }
    params.onWrite(params.method);
    return true;
}
