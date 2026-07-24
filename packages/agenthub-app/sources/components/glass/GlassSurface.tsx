import * as React from 'react';
import { Platform, StyleProp, View, ViewProps, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

export type GlassSurfaceTone = 'default' | 'raised' | 'accent' | 'floating';
export type GlassSurfaceSheen = 'standard' | 'subtle' | 'none';
export type GlassSurfaceEdgeIntensity = 'standard' | 'subtle';

export interface GlassSurfaceProps extends ViewProps {
    tone?: GlassSurfaceTone;
    sheen?: GlassSurfaceSheen;
    edgeIntensity?: GlassSurfaceEdgeIntensity;
    selected?: boolean;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
}

const stylesheet = StyleSheet.create((theme) => ({
    base: {
        borderWidth: 1,
        overflow: 'hidden',
        shadowColor: theme.colors.glass.shadow,
        shadowOffset: { width: 0, height: theme.dark ? 12 : 10 },
        shadowOpacity: theme.dark ? 0.16 : 0.15,
        shadowRadius: theme.dark ? 24 : 22,
        elevation: theme.dark ? 2 : 3,
        ...Platform.select({
            web: {
                backdropFilter: `blur(${theme.glass.blur.md}px) saturate(${theme.glass.saturation})`,
                WebkitBackdropFilter: `blur(${theme.glass.blur.md}px) saturate(${theme.glass.saturation})`,
            } as any,
            default: {},
        }),
    },
    default: {
        backgroundColor: theme.colors.glass.background,
        borderColor: theme.colors.glass.border,
    },
    raised: {
        backgroundColor: theme.colors.glass.raised,
        borderColor: theme.colors.glass.border,
    },
    floating: {
        backgroundColor: theme.colors.glass.raised,
        borderColor: theme.dark ? 'rgba(238, 248, 250, 0.20)' : theme.colors.glass.borderStrong,
        shadowOpacity: theme.dark ? 0.24 : 0.16,
        shadowRadius: 32,
        shadowOffset: { width: 0, height: 18 },
        elevation: 10,
    },
    accent: {
        backgroundColor: theme.colors.accentSoft,
        borderColor: theme.colors.borderStrong,
    },
    selected: {
        borderColor: theme.colors.borderStrong,
        shadowColor: theme.colors.focus.glow,
        shadowOpacity: Platform.OS === 'web' ? 0.36 : 0.22,
    },
    disabled: {
        opacity: 0.48,
    },
    surfaceSheen: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: theme.dark ? 0.72 : 0.68,
    },
    surfaceSheenSubtle: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: theme.dark ? 0.42 : 0.40,
    },
    topEdge: {
        position: 'absolute',
        top: 0,
        left: 2,
        right: 2,
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.glass.edgeBright,
        opacity: theme.dark ? 1 : 0.72,
    },
    topEdgeSubtle: {
        left: 10,
        right: 10,
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.56)',
    },
    bottomEdge: {
        position: 'absolute',
        left: 1,
        right: 1,
        bottom: 0,
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.dark ? theme.colors.glass.edgeMuted : 'rgba(28, 44, 52, 0.09)',
    },
    leftEdge: {
        position: 'absolute',
        top: 1,
        bottom: 1,
        left: 0,
        width: StyleSheet.hairlineWidth,
        backgroundColor: theme.dark ? theme.colors.glass.edgeMuted : 'rgba(255, 255, 255, 0.62)',
    },
    rightEdge: {
        position: 'absolute',
        top: 1,
        bottom: 1,
        right: 0,
        width: StyleSheet.hairlineWidth,
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.040)' : 'rgba(28, 44, 52, 0.045)',
    },
    cornerHighlight: {
        position: 'absolute',
        top: 1,
        left: 14,
        width: 72,
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.glass.edgeBright,
        opacity: theme.dark ? 0.44 : 0.90,
    },
    accentEdge: {
        position: 'absolute',
        top: 0,
        left: 10,
        right: 10,
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.glass.edgeWarm,
    },
}));

export function GlassSurface(props: GlassSurfaceProps) {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const { tone = 'default', sheen = 'standard', edgeIntensity = 'standard', selected, disabled, style, children, ...rest } = props;
    const isRaised = tone === 'raised' || tone === 'floating';
    const showSheen = sheen !== 'none';

    return (
        <View
            {...rest}
            style={[
                styles.base,
                tone === 'floating' ? styles.floating : tone === 'raised' ? styles.raised : tone === 'accent' ? styles.accent : styles.default,
                selected && styles.selected,
                disabled && styles.disabled,
                style,
            ]}
        >
            {showSheen && (
                <LinearGradient
                    pointerEvents="none"
                    colors={sheen === 'subtle'
                        ? [
                            theme.colors.glass.reflection,
                            theme.dark ? 'rgba(255, 255, 255, 0.030)' : 'rgba(255, 255, 255, 0.24)',
                            'rgba(255, 255, 255, 0)',
                        ]
                        : [
                            theme.colors.glass.reflection,
                            theme.dark ? 'rgba(255, 255, 255, 0.020)' : 'rgba(255, 255, 255, 0.22)',
                            'rgba(255, 255, 255, 0)',
                        ]}
                    locations={sheen === 'subtle' ? [0, 0.30, 1] : [0, 0.34, 1]}
                    start={{ x: 0, y: 0 }}
                    end={sheen === 'subtle' ? { x: 0.88, y: 0.70 } : { x: 0.92, y: 0.78 }}
                    style={sheen === 'subtle'
                        ? styles.surfaceSheenSubtle
                        : [styles.surfaceSheen, { opacity: isRaised ? 0.82 : 0.52 }]}
                />
            )}
            <View pointerEvents="none" style={[styles.topEdge, edgeIntensity === 'subtle' && styles.topEdgeSubtle]} />
            <View pointerEvents="none" style={styles.leftEdge} />
            <View pointerEvents="none" style={styles.rightEdge} />
            <View pointerEvents="none" style={styles.bottomEdge} />
            {edgeIntensity === 'standard' && (
                <View pointerEvents="none" style={styles.cornerHighlight} />
            )}
            {(selected || tone === 'accent' || tone === 'floating') && (
                <View pointerEvents="none" style={styles.accentEdge} />
            )}
            {children}
        </View>
    );
}
