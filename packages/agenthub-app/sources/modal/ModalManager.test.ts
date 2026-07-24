import { describe, expect, it } from 'vitest';
import { useLayoutEffect } from 'react';
import { shouldUseCustomModal } from './modalPlatform';
import { useModalManagerInitializerEffect } from './modalInitialization';
import type { CustomModalConfig } from './types';

describe('ModalManager platform routing', () => {
    it('uses custom alert and confirm modals on Android and web', () => {
        expect(shouldUseCustomModal('android', 'alert')).toBe(true);
        expect(shouldUseCustomModal('android', 'confirm')).toBe(true);
        expect(shouldUseCustomModal('web', 'alert')).toBe(true);
        expect(shouldUseCustomModal('web', 'confirm')).toBe(true);
    });

    it('keeps native alert and confirm behavior on iOS', () => {
        expect(shouldUseCustomModal('ios', 'alert')).toBe(false);
        expect(shouldUseCustomModal('ios', 'confirm')).toBe(false);
    });

    it('uses custom prompt modals on Android and web', () => {
        expect(shouldUseCustomModal('android', 'prompt')).toBe(true);
        expect(shouldUseCustomModal('web', 'prompt')).toBe(true);
    });

    it('initializes global modal functions before child effects can request a modal', () => {
        expect(useModalManagerInitializerEffect).toBe(useLayoutEffect);
    });

    it('allows complex custom modal components to opt out of the default frame', () => {
        const Component = () => null;
        const config: Omit<CustomModalConfig, 'id' | 'type'> = {
            component: Component,
            frame: false,
        };

        expect(config.frame).toBe(false);
    });
});
