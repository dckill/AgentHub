import { describe, expect, it } from 'vitest';
import {
    canUseDeviceProtectedSecret,
    shouldHideProtectedSecret,
    shouldClearProtectedClipboard,
} from './secretProtection';

describe('secret protection policy', () => {
    it('only permits protected secret actions on native platforms with device authentication', () => {
        expect(canUseDeviceProtectedSecret({ platform: 'ios', hasHardware: true, isEnrolled: true })).toBe(true);
        expect(canUseDeviceProtectedSecret({ platform: 'android', hasHardware: true, isEnrolled: true })).toBe(true);
        expect(canUseDeviceProtectedSecret({ platform: 'web', hasHardware: true, isEnrolled: true })).toBe(false);
        expect(canUseDeviceProtectedSecret({ platform: 'ios', hasHardware: false, isEnrolled: true })).toBe(false);
        expect(canUseDeviceProtectedSecret({ platform: 'android', hasHardware: true, isEnrolled: false })).toBe(false);
    });

    it('hides the secret whenever the page loses focus or the app is not active', () => {
        expect(shouldHideProtectedSecret({ isFocused: false, appState: 'active' })).toBe(true);
        expect(shouldHideProtectedSecret({ isFocused: true, appState: 'inactive' })).toBe(true);
        expect(shouldHideProtectedSecret({ isFocused: true, appState: 'background' })).toBe(true);
        expect(shouldHideProtectedSecret({ isFocused: true, appState: 'active' })).toBe(false);
    });

    it('only clears a clipboard value that still equals the protected secret', () => {
        expect(shouldClearProtectedClipboard('secret', 'secret')).toBe(true);
        expect(shouldClearProtectedClipboard('new user content', 'secret')).toBe(false);
        expect(shouldClearProtectedClipboard('', 'secret')).toBe(false);
    });
});
