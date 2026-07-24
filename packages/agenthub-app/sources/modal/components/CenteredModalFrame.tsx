import * as React from 'react';
import { ScrollView, StyleProp, useWindowDimensions, View, ViewStyle } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { GlassSurface } from '@/components/glass';

export interface CenteredModalFrameProps {
    children: React.ReactNode;
    footer?: React.ReactNode;
    maxWidth?: number;
    style?: StyleProp<ViewStyle>;
    contentStyle?: StyleProp<ViewStyle>;
    footerStyle?: StyleProp<ViewStyle>;
}

const stylesheet = StyleSheet.create((theme) => ({
    frame: {
        borderRadius: 16,
    },
    content: {
        paddingHorizontal: 20,
        paddingTop: 22,
        paddingBottom: 18,
        alignItems: 'flex-start',
    },
    footer: {
        borderTopWidth: 1,
        borderTopColor: theme.colors.glass.edgeMuted,
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: theme.colors.glass.background,
    },
}));

export function CenteredModalFrame(props: CenteredModalFrameProps) {
    const styles = stylesheet;
    const { width, height } = useWindowDimensions();
    const {
        children,
        footer,
        maxWidth = 400,
        style,
        contentStyle,
        footerStyle,
    } = props;

    return (
        <GlassSurface
            tone="floating"
            style={[
                styles.frame,
                {
                    width: Math.min(width - 40, maxWidth),
                    maxHeight: Math.max(280, height - 64),
                },
                style,
            ]}
        >
            <ScrollView
                bounces={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={[styles.content, contentStyle]}
            >
                {children}
            </ScrollView>
            {footer && (
                <View style={[styles.footer, footerStyle]}>
                    {footer}
                </View>
            )}
        </GlassSurface>
    );
}
