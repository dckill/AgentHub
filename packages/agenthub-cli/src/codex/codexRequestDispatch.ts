import { buildCodexRequest } from './codexTransportEnvelope';
import { createCodexPendingRequest } from './codexRequestLifecycle';
import { writeCodexTransportMessage } from './codexTransportWrite';
import type { PendingCodexRequest } from './codexResponseResolution';

type WritableStdin = {
    writable?: boolean;
    write: (line: string) => void;
};

export interface DispatchCodexRequestOptions {
    method: string;
    params?: unknown;
    timeoutMs: number;
    processEpoch: number;
    stdin?: WritableStdin | null;
    nextId: () => number;
    pending: Map<number, PendingCodexRequest>;
    onWrite?: (method: string, id: number) => void;
}

/** Register a pending JSON-RPC request and write its transport envelope. */
export function dispatchCodexRequest(options: DispatchCodexRequestOptions): Promise<unknown> {
    return new Promise((resolve, reject) => {
        if (!options.stdin?.writable) {
            reject(new Error(`Cannot send ${options.method}: stdin not writable`));
            return;
        }

        const id = options.nextId();
        options.pending.set(id, createCodexPendingRequest({
            method: options.method,
            epoch: options.processEpoch,
            timeoutMs: options.timeoutMs,
            timeoutMessage: `${options.method} timed out after ${options.timeoutMs}ms (id=${id})`,
            resolve,
            reject,
            remove: () => options.pending.delete(id),
        }));

        const message = buildCodexRequest(id, options.method, options.params);
        options.onWrite?.(options.method, id);
        writeCodexTransportMessage({ stdin: options.stdin, message });
    });
}
