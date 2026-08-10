import { describe, expect, it, vi } from 'vitest';
import { eventRouter } from './eventRouter';

describe('eventRouter UI presence proof', () => {
    it('returns only active user-scoped device ids', async () => {
        const fetchSockets = vi.fn().mockResolvedValue([
            { data: { clientType: 'user-scoped', appState: 'active', deviceId: 'device-a' } },
            { data: { clientType: 'user-scoped', appState: 'background', deviceId: 'device-b' } },
            { data: { clientType: 'machine-scoped', appState: 'active', deviceId: 'daemon-1' } },
            { data: { clientType: 'user-scoped', appState: 'active' } },
        ]);
        (eventRouter as any).init({ in: vi.fn(() => ({ fetchSockets })) });

        await expect(eventRouter.getActiveUiDeviceIds('user-1')).resolves.toEqual(new Set(['device-a']));
        expect(fetchSockets).toHaveBeenCalledTimes(1);
    });
});
