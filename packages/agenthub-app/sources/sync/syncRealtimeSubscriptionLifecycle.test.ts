import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { bindSyncRealtimeEvents } from './syncRealtimeSubscriptionLifecycle';

const syncPath = path.resolve(__dirname, './sync.ts');
const lifecyclePath = path.resolve(__dirname, './syncRealtimeSubscriptionLifecycle.ts');
const syncSource = fs.readFileSync(syncPath, 'utf8');

describe('Sync realtime subscription lifecycle boundary', () => {
    it('owns generation-bound update and ephemeral event wiring outside Sync', () => {
        expect(fs.existsSync(lifecyclePath)).toBe(true);
        const lifecycleSource = fs.readFileSync(lifecyclePath, 'utf8');

        expect(lifecycleSource).toContain('export function bindSyncRealtimeEvents');
        expect(syncSource).toContain("import { bindSyncRealtimeEvents } from './syncRealtimeSubscriptionLifecycle';");
        expect(syncSource).toContain('bindSyncRealtimeEvents({');
    });

    it('reports update failures only while the subscribed generation is current', async () => {
        const updateHandlers = new Map<string, (value: unknown) => void>();
        const socket = {
            onMessage: (event: string, handler: (value: unknown) => void) => {
                updateHandlers.set(event, handler);
                return () => updateHandlers.delete(event);
            },
            onReconnected: (handler: () => void) => {
                updateHandlers.set('reconnect', handler);
                return () => updateHandlers.delete('reconnect');
            },
        };
        const error = new Error('stale update');
        const handleUpdate = vi.fn(async () => { throw error; });
        const reportError = vi.fn();
        let current = true;

        const cancel = bindSyncRealtimeEvents({
            socket,
            generation: 9,
            handleUpdate,
            handleEphemeralUpdate: vi.fn(),
            handleReconnect: vi.fn(),
            isCurrent: () => current,
            reportError,
        });

        updateHandlers.get('update')?.({ id: 'u1' });
        await Promise.resolve();
        expect(handleUpdate).toHaveBeenCalledWith({ id: 'u1' }, 9);
        expect(reportError).toHaveBeenCalledWith(error);

        reportError.mockClear();
        current = false;
        updateHandlers.get('update')?.({ id: 'u2' });
        await Promise.resolve();
        expect(reportError).not.toHaveBeenCalled();
        cancel();
        expect(updateHandlers.size).toBe(0);
    });
});
