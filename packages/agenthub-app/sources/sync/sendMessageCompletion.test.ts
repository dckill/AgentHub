import { describe, expect, it } from 'vitest';
import { completeSendMessage } from './sendMessageCompletion';

describe('completeSendMessage', () => {
    it('tracks, invalidates and starts the watchdog in order', () => {
        const calls: string[] = [];

        completeSendMessage({
            source: 'chat',
            metadata: null,
            track: (_source, _metadata) => calls.push('track'),
            invalidate: () => calls.push('invalidate'),
            startWatchdog: () => calls.push('watchdog'),
        });

        expect(calls).toEqual(['track', 'invalidate', 'watchdog']);
    });

    it('does not swallow a tracking failure or run later effects', () => {
        const calls: string[] = [];

        expect(() => completeSendMessage({
            source: 'chat',
            metadata: null,
            track: () => {
                calls.push('track');
                throw new Error('tracking failed');
            },
            invalidate: () => calls.push('invalidate'),
            startWatchdog: () => calls.push('watchdog'),
        })).toThrow('tracking failed');

        expect(calls).toEqual(['track']);
    });
});
