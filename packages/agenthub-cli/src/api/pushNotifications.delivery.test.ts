import { describe, expect, it, vi } from 'vitest';

import { PushNotificationClient } from './pushNotifications';

describe('PushNotificationClient delivery lifecycle', () => {
    it('returns a promise that resolves after provider dispatch completes', async () => {
        const client = new PushNotificationClient('credential-token');
        const fetchPushTokens = vi.spyOn(client, 'fetchPushTokens').mockResolvedValue([
            {
                id: 'push-1',
                token: 'ExponentPushToken[test]',
                createdAt: 1,
                updatedAt: 2,
                deviceId: 'device-a',
            },
        ]);
        const sendPushNotifications = vi.spyOn(client, 'sendPushNotifications').mockResolvedValue(true);

        await expect(client.sendToAllDevices('Done', 'Finished', { sessionId: 'session-1' }))
            .resolves.toBe(true);

        expect(fetchPushTokens).toHaveBeenCalledWith('session-1');
        expect(sendPushNotifications).toHaveBeenCalledWith([
            expect.objectContaining({
                to: 'ExponentPushToken[test]',
                title: 'Done',
                body: 'Finished',
            }),
        ]);
    });

    it('returns false when no push target exists or token loading fails', async () => {
        const noTargetClient = new PushNotificationClient('credential-token');
        vi.spyOn(noTargetClient, 'fetchPushTokens').mockResolvedValue([]);
        await expect(noTargetClient.sendToAllDevices('Done')).resolves.toBe(false);

        const failedClient = new PushNotificationClient('credential-token');
        vi.spyOn(failedClient, 'fetchPushTokens').mockRejectedValue(new Error('offline'));
        await expect(failedClient.sendToAllDevices('Done')).resolves.toBe(false);
    });

    it('fails closed when the provider returns an empty ticket response', async () => {
        const client = new PushNotificationClient('credential-token');
        const sendPushNotificationsAsync = vi.spyOn((client as any).expo, 'sendPushNotificationsAsync')
            .mockResolvedValue([]);

        await expect(client.sendPushNotifications([
            { to: 'ExponentPushToken[test]', title: 'Done' },
        ])).resolves.toBe(false);
        expect(sendPushNotificationsAsync).toHaveBeenCalledTimes(1);
    });
});
