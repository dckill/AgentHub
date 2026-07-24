import { io, Socket } from 'socket.io-client';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { Encryption } from './encryption/encryption';
import { storage } from './storage';
import { parseRpcFailure, parseRpcRequest, parseRpcResponse } from '@artsum/agenthub-wire';
import type { RpcMethodName, RpcRequestFor, RpcResponseFor } from '@artsum/agenthub-wire';

export function getAgentHubClientId(): string {
    let platform: string = Platform.OS; // 'ios' | 'android' | 'web'
    if (platform === 'web' && typeof window !== 'undefined' && '__TAURI__' in window) {
        platform = 'desktop';
    }
    const version = Constants.expoConfig?.version || '0.0.0';
    return `${platform}/${version}`;
}

//
// Types
//

export interface SyncSocketConfig {
    endpoint: string;
    token: string;
}

export interface SyncSocketState {
    isConnected: boolean;
    connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
    lastError: Error | null;
}

export type SyncSocketListener = (state: SyncSocketState) => void;
export type FileTransferChunkHandler = (data: { transferId: string; metadata?: unknown; bytes?: unknown }) => Promise<void>;

const DEFAULT_RPC_TIMEOUT_MS = 15_000;

export type RpcErrorCode =
    | 'ABORTED'
    | 'NOT_CONNECTED'
    | 'ENCRYPTION_UNAVAILABLE'
    | 'TIMEOUT'
    | 'REMOTE_ERROR'
    | 'INVALID_REQUEST'
    | 'INVALID_RESPONSE'
    | 'TRANSPORT_ERROR';

export class RpcError extends Error {
    readonly code: RpcErrorCode;
    readonly method: string;
    readonly cause?: unknown;
    readonly remoteCode?: string;

    constructor(code: RpcErrorCode, method: string, message: string, cause?: unknown, remoteCode?: string) {
        super(message);
        this.name = 'RpcError';
        this.code = code;
        this.method = method;
        this.cause = cause;
        this.remoteCode = remoteCode;
    }
}

export interface RpcCallOptions {
    signal?: AbortSignal;
    /** Shorten the transport acknowledgement deadline for bounded workflows. */
    timeoutMs?: number;
}

function resolveRpcTimeoutMs(timeoutMs?: number): number {
    if (timeoutMs === undefined || !Number.isFinite(timeoutMs)) return DEFAULT_RPC_TIMEOUT_MS;
    return Math.min(DEFAULT_RPC_TIMEOUT_MS, Math.max(250, Math.floor(timeoutMs)));
}

function abortError(method: string): RpcError {
    return new RpcError('ABORTED', method, `RPC call aborted: ${method}`);
}

async function withCallerAbort<T>(method: string, operation: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return operation;
    if (signal.aborted) throw abortError(method);

    return await new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(abortError(method));
        signal.addEventListener('abort', onAbort, { once: true });
        operation.then(
            (value) => {
                signal.removeEventListener('abort', onAbort);
                resolve(value);
            },
            (error) => {
                signal.removeEventListener('abort', onAbort);
                reject(error);
            },
        );
    });
}

function transportError(method: string, error: unknown): RpcError {
    if (error instanceof RpcError) return error;
    const message = error instanceof Error ? error.message : 'RPC transport failed';
    const code = /timeout/i.test(message) ? 'TIMEOUT' : 'TRANSPORT_ERROR';
    return new RpcError(code, method, message, error);
}

//
// Main Class
//

class ApiSocket {

    // State
    private socket: Socket | null = null;
    private config: SyncSocketConfig | null = null;
    private encryption: Encryption | null = null;
    private messageHandlers: Map<string, (data: any) => void> = new Map();
    private fileTransferChunkHandlers: Map<string, FileTransferChunkHandler> = new Map();
    private reconnectedListeners: Set<() => void> = new Set();
    private statusListeners: Set<(status: 'disconnected' | 'connecting' | 'connected' | 'error') => void> = new Set();
    private currentStatus: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';

    //
    // Initialization
    //

    initialize(config: SyncSocketConfig, encryption: Encryption) {
        this.config = config;
        this.encryption = encryption;
        this.connect();
    }

    //
    // Connection Management
    //

    connect() {
        if (!this.config || this.socket) {
            return;
        }

        this.updateStatus('connecting');

        this.socket = io(this.config.endpoint, {
            path: '/v1/updates',
            auth: {
                token: this.config.token,
                clientType: 'user-scoped' as const,
                agenthubClient: getAgentHubClientId()
            },
            transports: ['websocket'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: Infinity
        });

        this.setupEventHandlers();
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.updateStatus('disconnected');
    }

    /**
     * Drop every account-scoped reference held by the transport.
     * Safe to call repeatedly during logout, failed login rollback, or account switching.
     */
    reset() {
        this.disconnect();
        this.config = null;
        this.encryption = null;
        this.messageHandlers.clear();
        this.fileTransferChunkHandlers.clear();
        this.reconnectedListeners.clear();
        this.statusListeners.clear();
        this.currentStatus = 'disconnected';
    }

    //
    // Listener Management
    //

    onReconnected = (listener: () => void) => {
        this.reconnectedListeners.add(listener);
        return () => this.reconnectedListeners.delete(listener);
    };

    onStatusChange = (listener: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void) => {
        this.statusListeners.add(listener);
        // Immediately notify with current status
        listener(this.currentStatus);
        return () => this.statusListeners.delete(listener);
    };

    //
    // Message Handling
    //

    onMessage(event: string, handler: (data: any) => void) {
        this.messageHandlers.set(event, handler);
        return () => this.messageHandlers.delete(event);
    }

    offMessage(event: string, handler: (data: any) => void) {
        this.messageHandlers.delete(event);
    }

    private fileTransferChunkKey(transferId: string, attemptId: string) {
        return `${transferId}:${attemptId}`;
    }

    onFileTransferChunk(transferId: string, attemptId: string, handler: FileTransferChunkHandler) {
        const key = this.fileTransferChunkKey(transferId, attemptId);
        this.fileTransferChunkHandlers.set(key, handler);
        return () => {
            const current = this.fileTransferChunkHandlers.get(key);
            if (current === handler) {
                this.fileTransferChunkHandlers.delete(key);
            }
        };
    }

    /**
     * RPC call for sessions - uses session-specific encryption
     */
    async sessionRPC<M extends RpcMethodName>(
        sessionId: string,
        method: M,
        params: RpcRequestFor<M>,
        options?: RpcCallOptions,
    ): Promise<RpcResponseFor<M>>;
    async sessionRPC<R = unknown, A = unknown>(
        sessionId: string,
        method: string,
        params: A,
        options?: RpcCallOptions,
    ): Promise<R>;
    async sessionRPC<R, A>(sessionId: string, method: string, params: A, options: RpcCallOptions = {}): Promise<R> {
        if (options.signal?.aborted) throw abortError(method);
        if (!this.socket) throw new RpcError('NOT_CONNECTED', method, 'Socket not connected');
        const sessionEncryption = this.encryption!.getSessionEncryption(sessionId);
        if (!sessionEncryption) {
            throw new RpcError('ENCRYPTION_UNAVAILABLE', method, `Session encryption not found for ${sessionId}`);
        }
        let validatedParams: unknown;
        try {
            validatedParams = parseRpcRequest(method, params);
        } catch (error) {
            throw new RpcError('INVALID_REQUEST', method, `Invalid RPC request: ${method}`, error);
        }

        try {
            const encryptedParams = await sessionEncryption.encryptRaw(validatedParams);
            if (options.signal?.aborted) throw abortError(method);
            const result = await withCallerAbort(method, this.socket.timeout(resolveRpcTimeoutMs(options.timeoutMs)).emitWithAck('rpc-call', {
                method: `${sessionId}:${method}`,
                params: encryptedParams,
            }), options.signal);

            if (!result.ok) {
                throw new RpcError('REMOTE_ERROR', method, result.error || 'RPC call failed');
            }
            const decrypted = await sessionEncryption.decryptRaw(result.result);
            const failure = parseRpcFailure(decrypted);
            if (failure) {
                throw new RpcError(
                    'REMOTE_ERROR',
                    method,
                    failure.__rpcError.message,
                    undefined,
                    failure.__rpcError.code,
                );
            }
            try {
                return parseRpcResponse(method, decrypted) as R;
            } catch (error) {
                throw new RpcError('INVALID_RESPONSE', method, `Invalid RPC response: ${method}`, error);
            }
        } catch (error) {
            throw transportError(method, error);
        }
    }

    async sessionRPCAvailable(sessionId: string, method: string): Promise<boolean> {
        return this.rpcMethodAvailable(`${sessionId}:${method}`);
    }

    async machineRPCAvailable(machineId: string, method: string): Promise<boolean> {
        return this.rpcMethodAvailable(`${machineId}:${method}`);
    }

    private async rpcMethodAvailable(method: string): Promise<boolean> {
        if (!this.socket) {
            return false;
        }

        const result = await this.socket.timeout(2500).emitWithAck('rpc-presence', { method });
        if (result?.ok) {
            return result.available === true;
        }
        return false;
    }

    /**
     * RPC call for machines - uses legacy/global encryption (for now)
     */
    async machineRPC<M extends RpcMethodName>(
        machineId: string,
        method: M,
        params: RpcRequestFor<M>,
        options?: RpcCallOptions,
    ): Promise<RpcResponseFor<M>>;
    async machineRPC<R = unknown, A = unknown>(
        machineId: string,
        method: string,
        params: A,
        options?: RpcCallOptions,
    ): Promise<R>;
    async machineRPC<R, A>(machineId: string, method: string, params: A, options: RpcCallOptions = {}): Promise<R> {
        if (options.signal?.aborted) throw abortError(method);
        if (!this.socket) throw new RpcError('NOT_CONNECTED', method, 'Socket not connected');
        const machineEncryption = this.encryption!.getMachineEncryption(machineId);
        if (!machineEncryption) {
            throw new RpcError('ENCRYPTION_UNAVAILABLE', method, `Machine encryption not found for ${machineId}`);
        }
        let validatedParams: unknown;
        try {
            validatedParams = parseRpcRequest(method, params);
        } catch (error) {
            throw new RpcError('INVALID_REQUEST', method, `Invalid RPC request: ${method}`, error);
        }

        try {
            const encryptedParams = await machineEncryption.encryptRaw(validatedParams);
            if (options.signal?.aborted) throw abortError(method);
            const result = await withCallerAbort(method, this.socket.timeout(resolveRpcTimeoutMs(options.timeoutMs)).emitWithAck('rpc-call', {
                method: `${machineId}:${method}`,
                params: encryptedParams,
            }), options.signal);
            if (!result.ok) {
                throw new RpcError('REMOTE_ERROR', method, result.error || 'RPC call failed');
            }
            const decrypted = await machineEncryption.decryptRaw(result.result);
            const failure = parseRpcFailure(decrypted);
            if (failure) {
                throw new RpcError(
                    'REMOTE_ERROR',
                    method,
                    failure.__rpcError.message,
                    undefined,
                    failure.__rpcError.code,
                );
            }
            try {
                return parseRpcResponse(method, decrypted) as R;
            } catch (error) {
                throw new RpcError('INVALID_RESPONSE', method, `Invalid RPC response: ${method}`, error);
            }
        } catch (error) {
            throw transportError(method, error);
        }
    }

    send(event: string, data: any) {
        this.socket!.emit(event, data);
        return true;
    }

    async emitWithAck<T = any>(event: string, data: any): Promise<T> {
        if (!this.socket) {
            throw new Error('Socket not connected');
        }
        return await this.socket.timeout(DEFAULT_RPC_TIMEOUT_MS).emitWithAck(event, data);
    }

    async emitWithAckTimeout<T = any>(event: string, data: any, timeoutMs: number): Promise<T> {
        if (!this.socket) {
            throw new Error('Socket not connected');
        }
        return await this.socket.timeout(timeoutMs).emitWithAck(event, data);
    }

    //
    // Token Management
    //

    updateToken(newToken: string) {
        if (this.config && this.config.token !== newToken) {
            this.config.token = newToken;

            if (this.socket) {
                this.disconnect();
                this.connect();
            }
        }
    }

    //
    // Private Methods
    //

    private isVerboseLogging(): boolean {
        try {
            return storage.getState().localSettings.verboseLogging;
        } catch {
            return false;
        }
    }

    private updateStatus(status: 'disconnected' | 'connecting' | 'connected' | 'error') {
        if (this.currentStatus !== status) {
            this.currentStatus = status;
            this.statusListeners.forEach(listener => listener(status));
        }
    }

    private setupEventHandlers() {
        if (!this.socket) return;

        // Connection events
        this.socket.on('connect', () => {
            if (this.isVerboseLogging()) {
                console.log('🔌 SyncSocket: Connected, recovered: ' + this.socket?.recovered);
                console.log('🔌 SyncSocket: Socket ID:', this.socket?.id);
            }
            this.updateStatus('connected');
            if (!this.socket?.recovered) {
                this.reconnectedListeners.forEach(listener => listener());
            }
        });

        this.socket.on('disconnect', (reason) => {
            if (this.isVerboseLogging()) {
                console.log('🔌 SyncSocket: Disconnected', reason);
            }
            this.updateStatus('disconnected');
        });

        // Error events
        this.socket.on('connect_error', (error) => {
            if (this.isVerboseLogging()) {
                console.error('🔌 SyncSocket: Connection error', error);
            }
            this.updateStatus('error');
        });

        this.socket.on('error', (error) => {
            if (this.isVerboseLogging()) {
                console.error('🔌 SyncSocket: Error', error);
            }
            this.updateStatus('error');
        });

        this.socket.on('file-transfer-chunk', async (data, callback) => {
            try {
                const transferId = data?.transferId;
                if (!transferId || typeof transferId !== 'string') {
                    callback?.({ ok: false, error: 'Invalid file transfer chunk' });
                    return;
                }

                const attemptId = data?.metadata?.attemptId;
                if (!attemptId || typeof attemptId !== 'string') {
                    callback?.({ ok: false, error: 'Invalid file transfer chunk attempt' });
                    return;
                }

                const handler = this.fileTransferChunkHandlers.get(this.fileTransferChunkKey(transferId, attemptId));
                if (!handler) {
                    callback?.({ ok: true, stale: true });
                    return;
                }

                await handler(data);
                callback?.({ ok: true });
            } catch (error) {
                callback?.({
                    ok: false,
                    error: error instanceof Error ? error.message : 'Failed to process file transfer chunk',
                });
            }
        });

        // Message handling
        this.socket.onAny((event, data) => {
            if (this.isVerboseLogging()) {
                console.log(`📥 SyncSocket: Received event '${event}':`, JSON.stringify(data).substring(0, 200));
            }
            const handler = this.messageHandlers.get(event);
            if (handler) {
                handler(data);
            }
        });
    }
}

//
// Singleton Export
//

export const apiSocket = new ApiSocket();
