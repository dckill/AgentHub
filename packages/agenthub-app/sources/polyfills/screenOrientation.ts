type ScreenWithOptionalOrientation = Screen & {
    orientation?: ScreenOrientation;
};

export function ensureScreenOrientationCompatibility(
    target: ScreenWithOptionalOrientation,
    isPortrait: () => boolean,
): boolean {
    if (typeof target.orientation?.type === 'string') {
        return false;
    }

    const compatibilityOrientation = {
        get type() {
            return isPortrait() ? 'portrait-primary' : 'landscape-primary';
        },
    } as ScreenOrientation;

    Object.defineProperty(target, 'orientation', {
        configurable: true,
        enumerable: true,
        value: compatibilityOrientation,
    });
    return true;
}

if (typeof screen !== 'undefined') {
    ensureScreenOrientationCompatibility(screen, () => {
        if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
            return window.matchMedia('(orientation: portrait)').matches;
        }
        return screen.height >= screen.width;
    });
}
