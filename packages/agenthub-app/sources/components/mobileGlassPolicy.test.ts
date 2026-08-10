import { describe, expect, it } from 'vitest';
import { resolveMobileGlassBackend } from './mobileGlassPolicy';

describe('mobile glass backend policy', () => {
    it('keeps web, desktop mac and disabled surfaces on the existing plain path', () => {
        expect(resolveMobileGlassBackend({ platform: 'web', enabled: true, nativeEffect: true, material: 'liquid', nativeApiAvailable: true, runningOnMac: false })).toBe('plain');
        expect(resolveMobileGlassBackend({ platform: 'ios', enabled: true, nativeEffect: true, material: 'liquid', nativeApiAvailable: true, runningOnMac: true })).toBe('plain');
        expect(resolveMobileGlassBackend({ platform: 'android', enabled: false, nativeEffect: true, material: 'liquid', nativeApiAvailable: false, runningOnMac: false })).toBe('plain');
    });

    it('keeps content surfaces opaque when no native material was requested', () => {
        expect(resolveMobileGlassBackend({ platform: 'ios', enabled: true, nativeEffect: false, material: 'liquid', nativeApiAvailable: true, runningOnMac: false })).toBe('opaque');
        expect(resolveMobileGlassBackend({ platform: 'android', enabled: true, nativeEffect: false, material: 'liquid', nativeApiAvailable: false, runningOnMac: false })).toBe('opaque');
    });

    it('uses native Liquid Glass only on supported iOS liquid surfaces', () => {
        expect(resolveMobileGlassBackend({ platform: 'ios', enabled: true, nativeEffect: true, material: 'liquid', nativeApiAvailable: true, runningOnMac: false })).toBe('native-liquid');
        expect(resolveMobileGlassBackend({ platform: 'ios', enabled: true, nativeEffect: true, material: 'static', nativeApiAvailable: true, runningOnMac: false })).toBe('ios-blur');
        expect(resolveMobileGlassBackend({ platform: 'ios', enabled: true, nativeEffect: true, material: 'liquid', nativeApiAvailable: false, runningOnMac: false })).toBe('ios-blur');
    });

    it('uses a deterministic simulated material on Android instead of expensive live blur', () => {
        expect(resolveMobileGlassBackend({ platform: 'android', enabled: true, nativeEffect: true, material: 'liquid', nativeApiAvailable: false, runningOnMac: false })).toBe('android-simulated');
        expect(resolveMobileGlassBackend({ platform: 'android', enabled: true, nativeEffect: true, material: 'frosted', nativeApiAvailable: false, runningOnMac: false })).toBe('android-simulated');
    });
});
