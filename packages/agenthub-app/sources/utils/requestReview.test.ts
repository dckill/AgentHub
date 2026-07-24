import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { settingsDefaults } from '@/sync/settings';

let platformOS = 'android';
let appVariant: 'development' | 'preview' | 'production' = 'production';
const confirmMock = vi.fn<() => Promise<boolean>>();
const applySettingsMock = vi.fn();
const localValues = new Map<string, string>();

vi.mock('react-native', () => ({
    Platform: {
        get OS() {
            return platformOS;
        },
    },
}));

vi.mock('expo-store-review', () => ({
    isAvailableAsync: vi.fn(async () => true),
    requestReview: vi.fn(async () => undefined),
}));

vi.mock('react-native-mmkv', () => ({
    MMKV: vi.fn(() => ({
        getString: (key: string) => localValues.get(key),
        set: (key: string, value: string) => localValues.set(key, value),
        delete: (key: string) => localValues.delete(key),
    })),
}));

vi.mock('@/modal', () => ({
    Modal: {
        confirm: confirmMock,
    },
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

vi.mock('@/track', () => ({
    trackReviewPromptShown: vi.fn(),
    trackReviewPromptResponse: vi.fn(),
    trackReviewStoreShown: vi.fn(),
    trackReviewRetryScheduled: vi.fn(),
}));

vi.mock('@/sync/sync', () => ({
    sync: {
        applySettings: applySettingsMock,
    },
}));

vi.mock('@/sync/storage', () => ({
    storage: {
        getState: () => ({
            settings: { ...settingsDefaults },
        }),
    },
}));

vi.mock('@/config', () => ({
    config: {
        get variant() {
            return appVariant;
        },
    },
}));

describe('requestReview', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        localValues.clear();
        platformOS = 'android';
        appVariant = 'production';
        confirmMock.mockImplementation(() => new Promise(() => undefined));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not queue multiple review prompts while the first prompt is unresolved', async () => {
        const { requestReview } = await import('./requestReview');

        requestReview();
        requestReview();
        await vi.waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));

        await new Promise(resolve => setTimeout(resolve, 0));
        expect(confirmMock).toHaveBeenCalledTimes(1);
    });

    it('does not show review prompts in preview builds', async () => {
        appVariant = 'preview';
        const { requestReview } = await import('./requestReview');

        requestReview();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(confirmMock).not.toHaveBeenCalled();
    });
});
