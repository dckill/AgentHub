import { describe, expect, it } from 'vitest';
import { getEnsureSessionLoadKey } from './useEnsureSessionLoadedKey';

describe('useEnsureSessionLoaded helpers', () => {
    it('does not request a session when no id is provided', () => {
        expect(getEnsureSessionLoadKey(null, false, null)).toBeNull();
        expect(getEnsureSessionLoadKey(undefined, false, 'token')).toBeNull();
    });

    it('does not request a session that is already in store', () => {
        expect(getEnsureSessionLoadKey('session-1', true, null)).toBeNull();
    });

    it('changes the load key when credentials become available', () => {
        expect(getEnsureSessionLoadKey('session-1', false, null)).toBe('session-1:no-credentials');
        expect(getEnsureSessionLoadKey('session-1', false, 'token-123')).toBe('session-1:token-123');
    });
});
