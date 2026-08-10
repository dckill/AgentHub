import type { JsonRpcRequest, JsonRpcResponse } from './codexAppServerTypes';

/** Build a JSON-RPC request envelope; pending bookkeeping stays with the client. */
export function buildCodexRequest(id: number, method: string, params?: unknown): JsonRpcRequest {
    return {
        jsonrpc: '2.0',
        id,
        method,
        ...(params === undefined ? {} : { params }),
    };
}

/** Build a JSON-RPC notification without coupling callers to wire literals. */
export function buildCodexNotification(method: string, params?: unknown): JsonRpcRequest {
    return {
        jsonrpc: '2.0',
        method,
        ...(params === undefined ? {} : { params }),
    };
}

/** Build the success response sent to an app-server request. */
export function buildCodexResponse(id: number, result?: unknown): JsonRpcResponse {
    return {
        jsonrpc: '2.0',
        id,
        ...(result === undefined ? {} : { result }),
    };
}
