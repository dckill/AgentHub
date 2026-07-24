import { describe, expect, it, vi } from 'vitest';
import { consumeDevWebCredentials } from './devWebCredentials';

describe('consumeDevWebCredentials', () => {
    it('returns development credentials while synchronously removing only secret query fields', () => {
        const replaceState = vi.fn();

        const result = consumeDevWebCredentials({
            isDevelopment: true,
            platform: 'web',
            location: {
                pathname: '/session/example',
                search: '?view=compact&dev_token=token-value&dev_secret=secret-value',
                hash: '#section',
            },
            replaceState,
        });

        expect(result).toEqual({ token: 'token-value', secret: 'secret-value' });
        expect(replaceState).toHaveBeenCalledOnce();
        expect(replaceState).toHaveBeenCalledWith('/session/example?view=compact#section');
    });

    it('scrubs secret query fields in production without accepting them as credentials', () => {
        const replaceState = vi.fn();

        const result = consumeDevWebCredentials({
            isDevelopment: false,
            platform: 'web',
            location: {
                pathname: '/',
                search: '?dev_token=ignored&dev_secret=must-not-remain',
                hash: '',
            },
            replaceState,
        });

        expect(result).toBeNull();
        expect(replaceState).toHaveBeenCalledWith('/');
    });

    it('does nothing outside the web platform', () => {
        const replaceState = vi.fn();
        const result = consumeDevWebCredentials({
            isDevelopment: true,
            platform: 'ios',
            location: null,
            replaceState,
        });

        expect(result).toBeNull();
        expect(replaceState).not.toHaveBeenCalled();
    });
});
