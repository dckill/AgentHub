import { describe, expect, it } from 'vitest';
import { resolveSentFrom } from './sendMessagePlatform';

describe('resolveSentFrom', () => {
    it.each([
        ['web', false, 'web'],
        ['android', false, 'android'],
        ['ios', false, 'ios'],
        ['ios', true, 'mac'],
        ['windows', false, 'web'],
    ])('maps %s (mac=%s) to %s', (platform, isMac, expected) => {
        expect(resolveSentFrom(platform, isMac)).toBe(expected);
    });
});
