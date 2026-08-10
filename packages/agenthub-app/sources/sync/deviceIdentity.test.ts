import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mmkv } = vi.hoisted(() => ({
    mmkv: {
        getString: vi.fn(),
        set: vi.fn(),
    },
}));

vi.mock('react-native-mmkv', () => ({
    MMKV: class {
        getString = mmkv.getString;
        set = mmkv.set;
    },
}));
vi.mock('expo-crypto', () => ({ randomUUID: vi.fn(() => 'generated-device-id') }));

import { getOrCreateDeviceId } from './deviceIdentity';

describe('device identity', () => {
    beforeEach(() => vi.clearAllMocks());

    it('persists one opaque device id across socket reconnects', () => {
        mmkv.getString.mockReturnValueOnce(undefined).mockReturnValueOnce('device-a');

        expect(getOrCreateDeviceId()).toBe('generated-device-id');
        expect(getOrCreateDeviceId()).toBe('device-a');
        expect(mmkv.set).toHaveBeenCalledWith('agenthub-device-id-v1', 'generated-device-id');
    });

    it('ignores malformed stored identities', () => {
        mmkv.getString.mockReturnValue('   ');

        expect(getOrCreateDeviceId()).toBe('generated-device-id');
    });
});
