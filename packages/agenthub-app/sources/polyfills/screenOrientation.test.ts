import { describe, expect, it } from 'vitest';
import { ensureScreenOrientationCompatibility } from './screenOrientation';

describe('ensureScreenOrientationCompatibility', () => {
    it('adds a live portrait-compatible type when WebKit omits screen.orientation', () => {
        const screen = { width: 800, height: 1200 } as Screen & { orientation?: ScreenOrientation };
        let portrait = true;

        expect(ensureScreenOrientationCompatibility(screen, () => portrait)).toBe(true);
        expect(screen.orientation?.type).toBe('portrait-primary');

        portrait = false;
        expect(screen.orientation?.type).toBe('landscape-primary');
    });

    it('preserves a browser-native Screen Orientation implementation', () => {
        const nativeOrientation = { type: 'landscape-primary' } as ScreenOrientation;
        const screen = { orientation: nativeOrientation } as Screen;

        expect(ensureScreenOrientationCompatibility(screen, () => true)).toBe(false);
        expect(screen.orientation).toBe(nativeOrientation);
    });
});
