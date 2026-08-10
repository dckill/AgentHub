export type MobileGlassMaterial = 'liquid' | 'static' | 'frosted';
export type MobileGlassBackend = 'plain' | 'opaque' | 'native-liquid' | 'ios-blur' | 'android-simulated';

export function resolveMobileGlassBackend(options: {
    platform: string;
    enabled: boolean;
    nativeEffect: boolean;
    material: MobileGlassMaterial;
    nativeApiAvailable: boolean;
    runningOnMac: boolean;
}): MobileGlassBackend {
    if (!options.enabled || options.platform === 'web' || options.runningOnMac) return 'plain';
    if (!options.nativeEffect) return 'opaque';
    if (options.platform === 'ios') {
        return options.material === 'liquid' && options.nativeApiAvailable ? 'native-liquid' : 'ios-blur';
    }
    return 'android-simulated';
}
