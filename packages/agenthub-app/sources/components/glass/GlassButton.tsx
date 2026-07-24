import * as React from 'react';
import { ActivityIndicator, Pressable, PressableProps, StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { getGlassButtonColors, type GlassButtonVariant } from './glassStyles';
import { getAmberRaisedButtonVisuals } from '../amberVisuals';

export interface GlassButtonProps extends Omit<PressableProps, 'style' | 'children'> {
    title: string;
    variant?: GlassButtonVariant;
    loading?: boolean;
    style?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
}

const stylesheet = StyleSheet.create((theme) => ({
    button: {
        minHeight: 44,
        minWidth: 72,
        borderRadius: theme.borderRadius.lg,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 9,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    pressed: {
        opacity: 0.78,
    },
    text: {
        ...Typography.default('semiBold'),
        fontSize: 14,
        lineHeight: 18,
        includeFontPadding: false,
    },
    loading: {
        position: 'absolute',
    },
    highlight: {
        position: 'absolute',
        top: 3,
        left: 10,
        right: 10,
        height: 7,
        borderRadius: 999,
    },
}));

export function GlassButton(props: GlassButtonProps) {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const { title, variant = 'secondary', loading, disabled, style, textStyle, ...rest } = props;
    const colors = getGlassButtonColors(theme, variant);
    const isDisabled = disabled || loading;
    const useGradient = variant === 'primary';
    const amberVisuals = getAmberRaisedButtonVisuals(theme);

    return (
        <Pressable
            {...rest}
            disabled={isDisabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: isDisabled }}
            style={({ pressed }) => [
                styles.button,
                {
                    backgroundColor: colors.backgroundColor,
                    borderColor: useGradient ? amberVisuals.borderColor : colors.borderColor,
                    opacity: disabled ? 0.5 : 1,
                },
                useGradient && {
                    shadowColor: amberVisuals.shadowColor,
                    shadowOpacity: disabled ? 0 : 0.5,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 2 },
                    elevation: disabled ? 0 : 3,
                },
                pressed && !isDisabled && styles.pressed,
                style,
            ]}
        >
            {useGradient && (
                <>
                    <LinearGradient
                        pointerEvents="none"
                        colors={amberVisuals.colors}
                        start={{ x: 0.18, y: 0 }}
                        end={{ x: 0.92, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                    <View
                        pointerEvents="none"
                        style={[styles.highlight, { backgroundColor: amberVisuals.highlightColor }]}
                    />
                </>
            )}
            {loading && (
                <View style={styles.loading}>
                    <ActivityIndicator size="small" color={colors.textColor} />
                </View>
            )}
            <Text
                style={[
                    styles.text,
                    { color: colors.textColor, opacity: loading ? 0 : 1 },
                    textStyle,
                ]}
                numberOfLines={1}
            >
                {title}
            </Text>
        </Pressable>
    );
}
