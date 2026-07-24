import { useHeaderHeight } from '@/utils/responsive';
import { LinearGradient } from 'expo-linear-gradient';
import * as React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUnistyles } from 'react-native-unistyles';
import { getChatCanvasTextureVisuals, getChatShellVisuals } from './chatShellVisuals';

interface AgentContentViewProps {
    input?: React.ReactNode | null;
    content?: React.ReactNode | null;
    placeholder?: React.ReactNode | null;
}

export const AgentContentView: React.FC<AgentContentViewProps> = React.memo(({ input, content, placeholder }) => {
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();
    const headerHeight = useHeaderHeight();
    const state = useKeyboardState();
    const shellVisuals = getChatShellVisuals(theme);
    const textureVisuals = getChatCanvasTextureVisuals(theme);

    return (
        <View
            style={{
                flexBasis: 0,
                flexGrow: 1,
                paddingBottom: state.isVisible ? state.height - safeArea.bottom : 0,
                backgroundColor: shellVisuals.backgroundColor,
            }}
        >
            <View style={{ flexBasis: 0, flexGrow: 1, backgroundColor: shellVisuals.contentBackgroundColor, overflow: 'hidden' }}>
                {textureVisuals.enabled && (
                    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                        <LinearGradient
                            colors={textureVisuals.baseGradientColors}
                            start={{ x: 0.02, y: 0 }}
                            end={{ x: 0.98, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                        <LinearGradient
                            colors={[textureVisuals.topSheenColor, 'rgba(255, 255, 255, 0)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            style={styles.canvasTopSheen}
                        />
                        <LinearGradient
                            colors={textureVisuals.mistGradientColors}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.canvasMist}
                        />
                        <View style={[styles.canvasVerticalLine, { left: '28%', backgroundColor: textureVisuals.verticalLineColor }]} />
                        <View style={[styles.canvasVerticalLine, { left: '58%', backgroundColor: textureVisuals.verticalLineColor, opacity: 0.72 }]} />
                        <View style={[styles.canvasVerticalLine, { left: '83%', backgroundColor: textureVisuals.verticalLineColor, opacity: 0.50 }]} />
                        <View style={[styles.canvasHorizontalLine, { top: '22%', backgroundColor: textureVisuals.horizontalLineColor }]} />
                        <View style={[styles.canvasHorizontalLine, { top: '66%', backgroundColor: textureVisuals.horizontalLineColor, opacity: 0.54 }]} />
                        <View style={[styles.canvasDiagonalSheen, { top: '17%', left: '-10%', backgroundColor: textureVisuals.diagonalSheenColor }]} />
                        <View style={[styles.canvasDiagonalSheen, { top: '76%', right: '-18%', backgroundColor: textureVisuals.diagonalSheenColor, opacity: 0.52 }]} />
                    </View>
                )}
                {content && (
                    <View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }]}>
                        {content}
                    </View>
                )}
                {placeholder && (
                    <ScrollView
                        style={[{ position: 'absolute', top: safeArea.top + headerHeight, left: 0, right: 0, bottom: 0 }]}
                        contentContainerStyle={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}
                        keyboardShouldPersistTaps="handled"
                        alwaysBounceVertical={false}
                    >
                        {placeholder}
                    </ScrollView>
                )}
            </View>
            <View
                style={{
                    backgroundColor: shellVisuals.inputBackgroundColor,
                    borderTopWidth: 1,
                    borderTopColor: shellVisuals.inputBorderColor,
                    ...Platform.select({
                        web: {
                            backdropFilter: `blur(${theme.glass.blur.md}px) saturate(${theme.glass.saturation})`,
                        } as any,
                        default: {},
                    }),
                }}
            >
                {input}
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    canvasTopSheen: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 120,
    },
    canvasMist: {
        position: 'absolute',
        top: '8%',
        left: '-12%',
        width: '82%',
        height: '48%',
        borderRadius: 240,
        opacity: 0.82,
    },
    canvasVerticalLine: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: StyleSheet.hairlineWidth,
    },
    canvasHorizontalLine: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: StyleSheet.hairlineWidth,
    },
    canvasDiagonalSheen: {
        position: 'absolute',
        width: '74%',
        height: StyleSheet.hairlineWidth,
        transform: [{ rotate: '-36deg' }],
    },
});

// const FallbackKeyboardAvoidingView: React.FC<AgentContentViewProps> = React.memo(({
//     children,
// }) => {
    
// });
