import { describe, expect, it } from 'vitest';
import { buildHomeOverviewModel } from './homeOverviewModel';

const session = (overrides: Partial<{
    id: string;
    updatedAt: number;
    active: boolean;
    title: string | null;
}> = {}) => ({
    id: overrides.id ?? 'session-1',
    updatedAt: overrides.updatedAt ?? 100,
    active: overrides.active ?? true,
    title: overrides.title ?? 'Repair authentication',
});

describe('buildHomeOverviewModel', () => {
    it('distinguishes loading, reconnecting, offline and empty device states', () => {
        expect(buildHomeOverviewModel({
            dataReady: false,
            socketStatus: 'connecting',
            machines: [],
            sessions: [],
        }).state).toBe('loading');

        expect(buildHomeOverviewModel({
            dataReady: true,
            socketStatus: 'connecting',
            machines: [],
            sessions: [],
        }).state).toBe('connecting');

        expect(buildHomeOverviewModel({
            dataReady: true,
            socketStatus: 'error',
            machines: [{ id: 'machine-1', online: true }],
            sessions: [],
        }).state).toBe('offline');

        expect(buildHomeOverviewModel({
            dataReady: true,
            socketStatus: 'connected',
            machines: [],
            sessions: [],
        }).state).toBe('empty');
    });

    it('reports device health and disables session creation without an online device', () => {
        const model = buildHomeOverviewModel({
            dataReady: true,
            socketStatus: 'connected',
            machines: [
                { id: 'online', online: true },
                { id: 'offline', online: false },
            ],
            sessions: [],
        });

        expect(model.state).toBe('ready');
        expect(model.onlineMachineCount).toBe(1);
        expect(model.totalMachineCount).toBe(2);
        expect(model.canStartSession).toBe(true);

        const unavailable = buildHomeOverviewModel({
            dataReady: true,
            socketStatus: 'connected',
            machines: [{ id: 'offline', online: false }],
            sessions: [],
        });
        expect(unavailable.state).toBe('no-online-devices');
        expect(unavailable.canStartSession).toBe(false);
    });

    it('keeps only the three most recently updated work items', () => {
        const model = buildHomeOverviewModel({
            dataReady: true,
            socketStatus: 'connected',
            machines: [{ id: 'machine-1', online: true }],
            sessions: [
                session({ id: 'oldest', updatedAt: 1 }),
                session({ id: 'newest', updatedAt: 40 }),
                session({ id: 'second', updatedAt: 30, active: false }),
                session({ id: 'third', updatedAt: 20, title: null }),
            ],
        });

        expect(model.recentWork.map((item) => item.id)).toEqual(['newest', 'second', 'third']);
        expect(model.recentWork[1]).toMatchObject({ active: false });
    });
});
