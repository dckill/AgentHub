import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createAccountSyncs, initializeAccountSyncs } from './syncStartupLifecycle';

const syncPath = path.resolve(__dirname, './sync.ts');
const lifecyclePath = path.resolve(__dirname, './syncStartupLifecycle.ts');
const syncSource = fs.readFileSync(syncPath, 'utf8');

describe('Sync startup lifecycle boundary', () => {
    it('owns account sync construction and startup scheduling outside Sync', () => {
        expect(fs.existsSync(lifecyclePath)).toBe(true);
        const lifecycleSource = fs.readFileSync(lifecyclePath, 'utf8');

        expect(lifecycleSource).toContain('export function createAccountSyncs');
        expect(lifecycleSource).toContain('export function initializeAccountSyncs');
        expect(syncSource).toContain("import { createAccountSyncs, initializeAccountSyncs } from './syncStartupLifecycle';");
        expect(syncSource).not.toContain('const startupSyncs: StartupSyncTask[] = [');
    });

    it('keeps the startup contract explicit for immediate and deferred syncs', () => {
        const lifecycleSource = fs.readFileSync(lifecyclePath, 'utf8');

        expect(lifecycleSource).toContain('deferBackgroundSyncs');
        expect(lifecycleSource).toContain('sessionsSync.awaitQueue()');
        expect(lifecycleSource).toContain('applyReady');
        expect(lifecycleSource).toContain('runStartupSyncs');
    });

    it('constructs all account syncs with the same generation and gates push registration', async () => {
        const commands: Array<() => Promise<void>> = [];
        const createSync = vi.fn((command: () => Promise<void>) => {
            commands.push(command);
            return { invalidate: vi.fn(), awaitQueue: vi.fn(async () => undefined) } as never;
        });
        const calls: string[] = [];
        const syncs = createAccountSyncs({
            generation: 42,
            createSync,
            fetchSessions: async (generation) => { calls.push(`sessions:${generation}`); },
            syncSettings: async (generation) => { calls.push(`settings:${generation}`); },
            fetchProfile: async (generation) => { calls.push(`profile:${generation}`); },
            fetchMachines: async (generation) => { calls.push(`machines:${generation}`); },
            fetchNativeUpdate: async (generation) => { calls.push(`native:${generation}`); },
            fetchArtifactsList: async (generation) => { calls.push(`artifacts:${generation}`); },
            registerPushToken: async (generation) => { calls.push(`push:${generation}`); },
            isDev: false,
            hasCredentials: () => true,
        });

        expect(Object.keys(syncs)).toHaveLength(7);
        expect(createSync).toHaveBeenCalledTimes(7);
        await Promise.all(commands.map((command) => command()));
        expect(calls).toEqual([
            'sessions:42',
            'settings:42',
            'profile:42',
            'machines:42',
            'native:42',
            'artifacts:42',
            'push:42',
        ]);
    });

    it('runs the immediate startup set and marks the UI ready after sessions settle', async () => {
        const invalidate = vi.fn();
        const sync = () => ({ invalidate, awaitQueue: vi.fn(async () => undefined) }) as never;
        const syncs = {
            sessionsSync: sync(),
            settingsSync: sync(),
            profileSync: sync(),
            machinesSync: sync(),
            nativeUpdateSync: sync(),
            artifactsSync: sync(),
            pushTokenSync: sync(),
        };
        const runIfCurrent = vi.fn((_generation: number, effect: () => void) => effect());
        const applyReady = vi.fn();
        const cancelPrevious = vi.fn();

        const cancel = initializeAccountSyncs({
            generation: 7,
            deferBackgroundSyncs: false,
            syncs,
            subscribeToUpdates: vi.fn(),
            runIfCurrent,
            applyReady,
            previousCancel: cancelPrevious,
            onBackgroundTaskError: vi.fn(),
            onSessionLoadError: vi.fn(),
        });

        await Promise.resolve();
        expect(invalidate).toHaveBeenCalledTimes(7);
        expect(applyReady).toHaveBeenCalledTimes(1);
        expect(runIfCurrent).toHaveBeenCalled();
        expect(cancelPrevious).toHaveBeenCalledTimes(1);
        cancel();
    });
});
