import { describe, expect, it } from 'vitest';
import {
    canSubmitManualRestoreKey,
    getPostAuthLoginRoute,
    getSyncModeForLogin,
    shouldRunRestoreQrAuth,
} from './loginFlow';

describe('loginFlow', () => {
    it('returns users to the authenticated home route after any login method succeeds', () => {
        expect(getPostAuthLoginRoute()).toBe('/');
    });

    it('only runs restore QR polling while the unauthenticated restore screen is focused', () => {
        expect(shouldRunRestoreQrAuth({ isAuthenticated: false, isFocused: true })).toBe(true);
        expect(shouldRunRestoreQrAuth({ isAuthenticated: false, isFocused: false })).toBe(false);
        expect(shouldRunRestoreQrAuth({ isAuthenticated: true, isFocused: true })).toBe(false);
    });

    it('disables manual restore submission until a key is entered', () => {
        expect(canSubmitManualRestoreKey('')).toBe(false);
        expect(canSubmitManualRestoreKey('   \n')).toBe(false);
        expect(canSubmitManualRestoreKey('ABCDE')).toBe(true);
    });

    it('uses restore sync for existing-account login and create sync for new accounts', () => {
        expect(getSyncModeForLogin()).toBe('create');
        expect(getSyncModeForLogin({ restoreExistingAccount: false })).toBe('create');
        expect(getSyncModeForLogin({ restoreExistingAccount: true })).toBe('restore');
    });
});
