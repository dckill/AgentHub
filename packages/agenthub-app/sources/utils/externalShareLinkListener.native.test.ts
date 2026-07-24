import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
    getInitialURL: vi.fn<() => Promise<string | null>>(),
    remove: vi.fn(),
    foreground: undefined as ((event: { url: string }) => void) | undefined,
}));

vi.mock('react-native', () => ({
    Linking: {
        getInitialURL: native.getInitialURL,
        addEventListener: (_event: 'url', listener: (event: { url: string }) => void) => {
            native.foreground = listener;
            return { remove: native.remove };
        },
    },
}));

import { subscribeExternalShareLinks } from './externalShareLinkListener.native';

describe('native external share link listener', () => {
    beforeEach(() => {
        native.getInitialURL.mockReset();
        native.remove.mockReset();
        native.foreground = undefined;
    });

    it('delivers initial and foreground URLs and removes the subscription', async () => {
        native.getInitialURL.mockResolvedValue('https://hub.example.com/share/initial#key=one');
        const onUrl = vi.fn();
        const unsubscribe = subscribeExternalShareLinks(onUrl);
        await Promise.resolve();
        native.foreground?.({ url: 'https://hub.example.com/share/foreground#key=two' });
        expect(onUrl.mock.calls).toEqual([
            ['https://hub.example.com/share/initial#key=one'],
            ['https://hub.example.com/share/foreground#key=two'],
        ]);
        unsubscribe();
        expect(native.remove).toHaveBeenCalledOnce();
    });

    it('ignores a late initial URL after unmount', async () => {
        let resolveInitial!: (value: string | null) => void;
        native.getInitialURL.mockReturnValue(new Promise((resolve) => { resolveInitial = resolve; }));
        const onUrl = vi.fn();
        const unsubscribe = subscribeExternalShareLinks(onUrl);
        unsubscribe();
        resolveInitial('https://hub.example.com/share/late#key=secret');
        await Promise.resolve();
        expect(onUrl).not.toHaveBeenCalled();
    });
});
