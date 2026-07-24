export type MachineDisconnectGraceInput = {
    hasActiveConnection: () => Promise<boolean>;
    emitOffline: () => void;
    onCheckError?: (error: unknown) => void;
    graceMs?: number;
};

/**
 * A disconnect is only authoritative after a short grace period and a fresh
 * room-membership check. Lookup failures retain the last known online state.
 */
export function scheduleMachineOfflineCheck(input: MachineDisconnectGraceInput): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
        void input.hasActiveConnection()
            .then((hasActiveConnection) => {
                if (!hasActiveConnection) input.emitOffline();
            })
            .catch((error) => input.onCheckError?.(error));
    }, input.graceMs ?? 1_500);
    timer.unref?.();
    return timer;
}
