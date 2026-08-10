import { describe, expect, it } from 'vitest';
import type { Settings } from './settings';
import { retainConcurrentPendingSettings } from './pendingSettingsReconciliation';

describe('retainConcurrentPendingSettings', () => {
    it('keeps keys changed while the request was in flight and newly added keys', () => {
        const sent: Partial<Settings> = { hideInactiveSessions: true, preferredLanguage: 'en' };
        const current: Partial<Settings> = {
            hideInactiveSessions: false,
            preferredLanguage: 'en',
            experiments: true,
        };

        expect(retainConcurrentPendingSettings(sent, current)).toEqual({
            hideInactiveSessions: false,
            experiments: true,
        });
    });

    it('returns no pending keys when the request consumed every local change', () => {
        expect(retainConcurrentPendingSettings(
            { hideInactiveSessions: true },
            { hideInactiveSessions: true },
        )).toEqual({});
    });
});
