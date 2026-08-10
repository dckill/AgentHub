/** Apply a session archive stop result only while the originating account is current. */
export async function runSessionArchiveActionLifecycle<Observation, StopResult>({
    isCurrent,
    cleanup,
    stop,
    applyObservation,
    applyProjection,
    refresh,
    onAfterArchive,
}: {
    isCurrent: () => boolean;
    cleanup: () => Promise<void>;
    stop: (onDaemonState: (state: Observation) => void) => Promise<StopResult>;
    applyObservation: (state: Observation) => void;
    applyProjection: (result: StopResult) => void;
    refresh: () => Promise<void>;
    onAfterArchive: () => void;
}): Promise<boolean> {
    if (!isCurrent()) {
        return false;
    }

    await cleanup();
    if (!isCurrent()) {
        return false;
    }

    const stopResult = await stop((state) => {
        if (isCurrent()) {
            applyObservation(state);
        }
    });
    if (!isCurrent()) {
        return false;
    }

    applyProjection(stopResult);
    if (!isCurrent()) {
        return false;
    }

    await refresh();
    if (!isCurrent()) {
        return false;
    }

    onAfterArchive();
    return true;
}
