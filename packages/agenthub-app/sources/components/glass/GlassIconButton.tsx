import * as React from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { getGlassButtonColors, type GlassButtonVariant } from './glassStyles';

export interface GlassIconButtonProps extends Omit<PressableProps, 'style' | 'children'> {
    accessibilityLabel: string;
    icon: React.ReactNode;
    variant?: GlassButtonVariant;
    selected?: boolean;
    size?: number;
    style?: StyleProp<ViewStyle>;
}

const stylesheet = StyleSheet.create((theme) => ({
    button: {
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        overflow: 'hidden',
    },
    pressed: {
        opacity: 0.78,
    },
}));

export function GlassIconButton(props: GlassIconButtonProps) {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const { icon, variant = 'secondary', selected, disabled, size = 36, style, ...rest } = props;
    const isSelected = selected === true;
    const isDisabled = disabled === true;
    const colors = getGlassButtonColors(theme, isSelected ? 'primary' : variant);

    return (
        <Pressable
            {...rest}
            disabled={isDisabled}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected, disabled: isDisabled }}
            style={({ pressed }) => [
                styles.button,
                {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: colors.backgroundColor,
                    borderColor: colors.borderColor,
                    opacity: isDisabled ? 0.5 : 1,
                },
                pressed && !isDisabled && styles.pressed,
                style,
            ]}
        >
            {icon}
        </Pressable>
    );
}
