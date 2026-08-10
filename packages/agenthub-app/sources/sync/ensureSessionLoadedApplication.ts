export type EnsureSessionLoadedApplicationParams<T, R = T> = {
    existing: T | undefined;
    load: () => Promise<T | null>;
    apply: (value: T) => R;
};

/** Apply the shared existing/missing/loaded session state machine. */
export async function ensureSessionLoadedApplication<T, R = T>(
    params: EnsureSessionLoadedApplicationParams<T, R>,
): Promise<T | R | null> {
    if (params.existing) {
        return params.existing;
    }

    const loaded = await params.load();
    if (!loaded) {
        return null;
    }

    return params.apply(loaded);
}
