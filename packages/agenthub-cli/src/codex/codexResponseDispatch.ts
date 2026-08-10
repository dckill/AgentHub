import { buildCodexResponse } from './codexTransportEnvelope';
import { writeCodexTransportMessage } from './codexTransportWrite';
import type { CodexNotificationStdin } from './codexNotificationDispatch';

export type CodexResponseDispatchParams = {
    stdin?: CodexNotificationStdin | null;
    id: number;
    result: unknown;
    onWrite: (id: number) => void;
};

/** Write one JSON-RPC response and report success only after stdin accepts it. */
export function dispatchCodexResponse(params: CodexResponseDispatchParams): boolean {
    const message = buildCodexResponse(params.id, params.result);
    if (!writeCodexTransportMessage({ stdin: params.stdin, message })) {
        return false;
    }
    params.onWrite(params.id);
    return true;
}
