import * as React from 'react';
import { Platform, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { getComposerOverlayVisuals } from './composerVisuals';
import { LinearGradient } from 'expo-linear-gradient';

const stylesheet = StyleSheet.create((theme, runtime) => ({
    container: {
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: getComposerOverlayVisuals(theme).backgroundColor,
        borderWidth: Platform.OS === 'web' ? 1.25 : 1,
        borderColor: getComposerOverlayVisuals(theme).borderColor,
        shadowColor: getComposerOverlayVisuals(theme).shadowColor,
        shadowOffset: getComposerOverlayVisuals(theme).shadowOffset,
        shadowRadius: getComposerOverlayVisuals(theme).shadowRadius,
        shadowOpacity: getComposerOverlayVisuals(theme).shadowOpacity,
        elevation: 5,
    },
    materialGradient: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 0,
    },
    innerRim: {
        position: 'absolute',
        top: 1,
        left: 1,
        right: 1,
        bottom: 1,
        borderRadius: 11,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: getComposerOverlayVisuals(theme).innerRimColor,
        zIndex: 1,
    },
    topHighlight: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 1,
        backgroundColor: getComposerOverlayVisuals(theme).topHighlightColor,
        zIndex: 1,
    },
    cornerGlow: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '62%',
        height: 84,
        opacity: theme.dark ? 0.42 : 0.34,
        zIndex: 1,
    },
    bottomShade: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 56,
        backgroundColor: getComposerOverlayVisuals(theme).bottomShadeColor,
        zIndex: 1,
    },
    content: {
        position: 'relative',
        zIndex: 2,
    },
}));

interface FloatingOverlayProps {
    children: React.ReactNode;
    maxHeight?: number;
    showScrollIndicator?: boolean;
    keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
}

export const FloatingOverlay = React.memo((props: FloatingOverlayProps) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const visuals = getComposerOverlayVisuals(theme);
    const { 
        children, 
        maxHeight = 240, 
        showScrollIndicator = false, 
        keyboardShouldPersistTaps = 'handled' 
    } = props;

    return (
        <Animated.View style={[styles.container, { maxHeight }]}>
            <LinearGradient
                pointerEvents="none"
                colors={visuals.backgroundGradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.materialGradient}
            />
            <View pointerEvents="none" style={styles.innerRim} />
            <View pointerEvents="none" style={styles.topHighlight} />
            {visuals.cornerGlowColor !== 'transparent' && (
                <LinearGradient
                    pointerEvents="none"
                    colors={[visuals.cornerGlowColor, 'rgba(255, 255, 255, 0)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cornerGlow}
                />
            )}
            <View pointerEvents="none" style={styles.bottomShade} />
            <Animated.ScrollView
                style={[styles.content, { maxHeight }]}
                keyboardShouldPersistTaps={keyboardShouldPersistTaps}
                showsVerticalScrollIndicator={showScrollIndicator}
            >
                {children}
            </Animated.ScrollView>
        </Animated.View>
    );
});
