export type LocalSettingsUpdateOptions<T extends object> = {
    delta: Partial<T>;
    pendingSettings: Partial<T>;
    applyLocal: (delta: Partial<T>) => void;
    save: (settings: Partial<T>) => void;
    invalidate: () => void;
};

/** Apply local settings before persisting the merged pending snapshot and syncing it remotely. */
export function applyLocalSettingsUpdate<T extends object>(
    options: LocalSettingsUpdateOptions<T>,
): Partial<T> {
    options.applyLocal(options.delta);
    const nextPendingSettings = { ...options.pendingSettings, ...options.delta };
    options.save(nextPendingSettings);
    options.invalidate();
    return nextPendingSettings;
}
