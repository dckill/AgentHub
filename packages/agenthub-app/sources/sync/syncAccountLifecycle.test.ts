import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { stopAccountSyncs } from './syncAccountLifecycle';

const syncPath = path.resolve(__dirname, './sync.ts');
const lifecyclePath = path.resolve(__dirname, './syncAccountLifecycle.ts');
const syncSource = fs.readFileSync(syncPath, 'utf8');

describe('Sync account lifecycle boundary', () => {
    it('owns account sync stop ordering outside Sync', () => {
        expect(fs.existsSync(lifecyclePath)).toBe(true);
        const lifecycleSource = fs.readFileSync(lifecyclePath, 'utf8');

        expect(lifecycleSource).toContain('export function stopAccountSyncs');
        expect(syncSource).toContain("import { stopAccountSyncs } from './syncAccountLifecycle';");
        expect(syncSource).not.toContain('for (const sync of [...this.messagesSync.values(), ...this.sendSync.values(), ...this.olderMessagesSync.values()])');
    });

    it('cancels realtime subscriptions before stopping all account-bound queues', () => {
        const stopRealtime = vi.fn();
        const clearRealtime = vi.fn();
        const stops = Array.from({ length: 4 }, () => vi.fn());

        stopAccountSyncs({
            cancelRealtimeSubscriptions: stopRealtime,
            clearRealtimeSubscriptions: clearRealtime,
            accountSyncs: stops.slice(0, 2).map((stop) => ({ stop })),
            keyedSyncs: stops.slice(2).map((stop) => ({ stop })),
        });

        expect(stopRealtime).toHaveBeenCalledTimes(1);
        expect(clearRealtime).toHaveBeenCalledTimes(1);
        expect(stops.every((stop) => stop.mock.calls.length === 1)).toBe(true);
        expect(stopRealtime.mock.invocationCallOrder[0]).toBeLessThan(stops[0].mock.invocationCallOrder[0]);
    });

    it('invalidates the background-send watchdog before creating a replacement account', () => {
        expect(syncSource).toMatch(
            /private beginAccount\(\): number \{[\s\S]*?this\.stopAccountSyncs\(\);[\s\S]*?void this\.backgroundSendWatchdog\.stop\(\);[\s\S]*?this\.accountLifecycle\.begin\(\)/,
        );
    });
});
