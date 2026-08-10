import { parseCodexTransportLine } from './codexTransportMessage';
import { settleCodexResponse, type PendingCodexRequest } from './codexResponseResolution';

export type CodexTransportLineDispatchOptions = {
    line: string;
    sourceEpoch: number;
    currentEpoch: number;
    pending: Map<number, PendingCodexRequest>;
    onInvalidJson: (line: string) => void;
    onIgnored: (line: string) => void;
    onStaleResponse: (id: number) => void;
    onServerRequest: (id: number, method: string, params?: unknown) => Promise<void>;
    onServerRequestError: (error: unknown) => void;
    onNotification: (method: string, params?: unknown) => void;
};

/** Dispatch one app-server stdout line without owning client lifecycle state. */
export function dispatchCodexTransportLine({
    line,
    sourceEpoch,
    currentEpoch,
    pending,
    onInvalidJson,
    onIgnored,
    onStaleResponse,
    onServerRequest,
    onServerRequestError,
    onNotification,
}: CodexTransportLineDispatchOptions): void {
    if (sourceEpoch !== currentEpoch) {
        return;
    }

    const parsed = parseCodexTransportLine(line);
    if (parsed.kind === 'empty') {
        return;
    }
    if (parsed.kind === 'invalid-json') {
        onInvalidJson(line);
        return;
    }
    if (parsed.kind === 'ignored') {
        onIgnored(line);
        return;
    }

    if (parsed.kind === 'response') {
        const result = settleCodexResponse({
            pending,
            id: parsed.id,
            sourceEpoch,
            result: parsed.result,
            error: parsed.error,
        });
        if (result === 'stale') {
            onStaleResponse(parsed.id);
        }
        return;
    }

    if (parsed.kind === 'server-request') {
        try {
            onServerRequest(parsed.id, parsed.method, parsed.params).catch(onServerRequestError);
        } catch (error) {
            onServerRequestError(error);
        }
        return;
    }

    onNotification(parsed.method, parsed.params);
}
