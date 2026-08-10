import { describe, expect, it } from 'vitest';
import type { Profile } from './profile';
import { buildUpdatedProfile } from './accountUpdateProjection';

const current: Profile = {
    id: 'account-1',
    timestamp: 10,
    firstName: '旧名',
    lastName: '用户',
    avatar: null,
};

describe('buildUpdatedProfile', () => {
    it('merges only supplied account fields and advances the update timestamp', () => {
        expect(buildUpdatedProfile(current, {
            t: 'update-account',
            id: 'account-1',
            firstName: '新名',
        }, 20)).toEqual({
            ...current,
            firstName: '新名',
            timestamp: 20,
        });
    });

    it('preserves nullable fields when an update omits them', () => {
        expect(buildUpdatedProfile(current, {
            t: 'update-account',
            id: 'account-1',
        }, 30)).toEqual({ ...current, timestamp: 30 });
    });
});
