export type SessionUpdateAckSocket = {
    timeout: (timeoutMs: number) => {
        emitWithAck: (event: string, data: unknown) => Promise<unknown>;
    };
};

export type EmitSessionUpdateWithAckParams<T> = {
    socket: SessionUpdateAckSocket;
    event: string;
    data: unknown;
    timeoutMs: number;
    onError: (error: unknown) => void;
};

/**
 * Bound session metadata/state acknowledgements so a lost server callback
 * cannot keep the caller's AsyncLock occupied forever.
 */
export async function emitSessionUpdateWithAck<T>(
    params: EmitSessionUpdateWithAckParams<T>,
): Promise<T | null> {
    try {
        return await params.socket.timeout(params.timeoutMs).emitWithAck(params.event, params.data) as T;
    } catch (error) {
        params.onError(error);
        return null;
    }
}
