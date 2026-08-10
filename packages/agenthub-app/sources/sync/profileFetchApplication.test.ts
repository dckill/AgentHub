import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccountRequest } from './accountLifecycle';
import { profileDefaults } from './profile';
import { runProfileFetchApplication, type ProfileFetchApplicationParams } from './profileFetchApplication';

const profile = {
    id: 'account-1',
    timestamp: 42,
    firstName: 'Ada',
    lastName: 'Lovelace',
    avatar: null,
};

function request(): AccountRequest {
    return {
        signal: new AbortController().signal,
        assertCurrent: vi.fn(),
    };
}

describe('profile fetch application', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('parses the response with the request signal before applying the current profile', async () => {
        const accountRequest = request();
        const applyProfile = vi.fn();
        const fetchProfile = vi.fn().mockResolvedValue(profile);
        const runRequest: ProfileFetchApplicationParams['runRequest'] = async <T,>(operation: (request: AccountRequest) => Promise<T>): Promise<T> => operation(accountRequest);
        const assertCurrent = vi.fn();

        await expect(runProfileFetchApplication({
            runRequest,
            fetchProfile,
            assertCurrent,
            applyProfile,
        })).resolves.toEqual(profile);

        expect(fetchProfile).toHaveBeenCalledWith(accountRequest.signal);
        expect(assertCurrent).toHaveBeenCalledOnce();
        expect(applyProfile).toHaveBeenCalledWith(profile);
    });

    it('fails closed to profile defaults for a malformed response', async () => {
        const applyProfile = vi.fn();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await runProfileFetchApplication({
            runRequest: async (operation) => operation(request()),
            fetchProfile: async () => ({ id: 123 }),
            assertCurrent: vi.fn(),
            applyProfile,
        });

        expect(applyProfile).toHaveBeenCalledWith(profileDefaults);
    });

    it('does not apply a profile after the account generation becomes stale', async () => {
        const applyProfile = vi.fn();
        const assertCurrent = vi.fn(() => {
            throw new DOMException('Account lifecycle is stale', 'AbortError');
        });

        await expect(runProfileFetchApplication({
            runRequest: async (operation) => operation(request()),
            fetchProfile: async () => profile,
            assertCurrent,
            applyProfile,
        })).rejects.toMatchObject({ name: 'AbortError' });

        expect(applyProfile).not.toHaveBeenCalled();
    });
});
