import * as React from 'react';
import { Platform, StyleProp, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, type GlassStyle } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { useUnistyles } from 'react-native-unistyles';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { isRunningOnMac } from '@/utils/platform';
import { resolveMobileGlassBackend, type MobileGlassMaterial } from './mobileGlassPolicy';

export type MobileGlassSurfaceProps = ViewProps & {
    enabled?: boolean;
    intensity?: number;
    interactive?: boolean;
    nativeEffect?: boolean;
    material?: MobileGlassMaterial;
    glassEffectStyle?: GlassStyle;
    tintColor?: string;
    style?: StyleProp<ViewStyle>;
};

const AnimatedGlassView = Animated.createAnimatedComponent(GlassView);
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

export function MobileGlassSurface(props: MobileGlassSurfaceProps) {
    if (props.interactive && Platform.OS !== 'web' && !isRunningOnMac()) return <InteractiveMobileGlassSurface {...props} />;
    return <MobileGlassSurfaceBase {...props} />;
}

function InteractiveMobileGlassSurface({ onTouchStart, onTouchEnd, onTouchCancel, style, ...props }: MobileGlassSurfaceProps) {
    const reduceMotion = useReducedMotion();
    const pressScale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressScale.value }] }));
    const release = React.useCallback(() => {
        pressScale.value = reduceMotion ? 1 : withSpring(1, { damping: 14, stiffness: 520, mass: 0.4 });
    }, [pressScale, reduceMotion]);
    const handleTouchStart = React.useCallback<NonNullable<ViewProps['onTouchStart']>>((event) => {
        pressScale.value = reduceMotion ? 1 : withTiming(1.035, { duration: 65, easing: Easing.out(Easing.quad) });
        onTouchStart?.(event);
    }, [onTouchStart, pressScale, reduceMotion]);
    const handleTouchEnd = React.useCallback<NonNullable<ViewProps['onTouchEnd']>>((event) => { release(); onTouchEnd?.(event); }, [onTouchEnd, release]);
    const handleTouchCancel = React.useCallback<NonNullable<ViewProps['onTouchCancel']>>((event) => { release(); onTouchCancel?.(event); }, [onTouchCancel, release]);
    return <MobileGlassSurfaceBase {...props} interactive animated onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchCancel} style={[style, animatedStyle]} />;
}

function MobileGlassSurfaceBase({
    enabled = Platform.OS !== 'web' && !isRunningOnMac(),
    intensity = 72,
    interactive = false,
    nativeEffect = interactive,
    material = 'liquid',
    glassEffectStyle = 'clear',
    tintColor,
    style,
    children,
    animated = false,
    ...props
}: MobileGlassSurfaceProps & { animated?: boolean }) {
    const { theme } = useUnistyles();
    const backend = resolveMobileGlassBackend({
        platform: Platform.OS,
        enabled,
        nativeEffect,
        material,
        nativeApiAvailable: Platform.OS === 'ios' && isGlassEffectAPIAvailable(),
        runningOnMac: isRunningOnMac(),
    });
    const SurfaceView = animated ? Animated.View : View;

    if (backend === 'plain') return <SurfaceView {...props} style={style}>{children}</SurfaceView>;
    if (backend === 'opaque') return <SurfaceView {...props} style={[{ backgroundColor: theme.colors.surface }, style]}>{children}</SurfaceView>;

    const frosted = material === 'frosted';
    const staticMaterial = material !== 'liquid';
    const overlay = staticMaterial ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, {
            backgroundColor: theme.dark
                ? frosted ? 'rgba(20, 20, 22, 0.82)' : 'rgba(44, 44, 47, 0.62)'
                : frosted ? 'rgba(255, 255, 255, 0.82)' : 'rgba(255, 255, 255, 0.66)',
        }]} />
    ) : (
        <LinearGradient pointerEvents="none"
            colors={theme.dark
                ? ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.018)', 'rgba(255,255,255,0.055)']
                : ['rgba(255,255,255,0.76)', 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.42)']}
            locations={[0, 0.48, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    );

    if (backend === 'native-liquid') {
        const NativeSurface = animated ? AnimatedGlassView : GlassView;
        return <NativeSurface {...props} glassEffectStyle={glassEffectStyle} colorScheme={theme.dark ? 'dark' : 'light'} tintColor={tintColor ?? theme.colors.accentSoft} isInteractive={interactive} style={style}>{overlay}{children}</NativeSurface>;
    }
    if (backend === 'ios-blur') {
        const BlurSurface = animated ? AnimatedBlurView : BlurView;
        return <BlurSurface {...props} intensity={Math.min(intensity, frosted ? 42 : staticMaterial ? 18 : 36)} tint={theme.dark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'} style={style}>{overlay}{children}</BlurSurface>;
    }
    return <SurfaceView {...props} style={[{ backgroundColor: theme.colors.glass.background }, style]}>{overlay}{children}</SurfaceView>;
}

export function MobileGlassBackdrop({ enabled = Platform.OS !== 'web' && !isRunningOnMac() }: { enabled?: boolean }) {
    const { theme } = useUnistyles();
    if (!enabled || isRunningOnMac()) return null;
    return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <LinearGradient
            colors={theme.dark
                ? ['#080B0D', '#10171A', '#07090A']
                : ['#F7FAFA', '#EEF4F3', '#FFF8EA']}
            locations={[0, 0.52, 1]} start={{ x: 0.05, y: 0 }} end={{ x: 0.95, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={[styles.glow, styles.primaryGlow, { backgroundColor: theme.colors.accentGlow }]} />
        <View style={[styles.glow, styles.secondaryGlow, { backgroundColor: theme.colors.glass.reflection }]} />
    </View>;
}

const styles = StyleSheet.create({
    glow: { position: 'absolute', borderRadius: 999, opacity: 0.34 },
    primaryGlow: { width: 280, height: 280, top: -96, right: -116 },
    secondaryGlow: { width: 320, height: 320, bottom: -148, left: -156 },
});
