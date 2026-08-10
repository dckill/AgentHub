export type MissingSessionRefreshApplicationParams = {
    key: string;
    isInFlight: (key: string) => boolean;
    markInFlight: (key: string) => void;
    clearInFlight: (key: string) => void;
    refresh: () => Promise<void>;
    isCurrent: () => boolean;
    onCurrentError: (error: unknown) => void;
};

/** Schedule one authoritative session refresh per account/session key. */
export function scheduleMissingSessionRefresh(params: MissingSessionRefreshApplicationParams): void {
    if (params.isInFlight(params.key)) {
        return;
    }
    params.markInFlight(params.key);
    void params.refresh()
        .catch((error) => {
            if (params.isCurrent()) {
                params.onCurrentError(error);
            }
        })
        .finally(() => {
            params.clearInFlight(params.key);
        });
}
