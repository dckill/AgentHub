import * as React from 'react';
import { Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { GlassSurface } from './GlassSurface';
import { getSpaceKeyActivationProps } from '@/components/keyboardActivation';

export interface SegmentedControlOption<T extends string> {
    value: T;
    label: string;
}

export interface SegmentedControlProps<T extends string> {
    value: T;
    options: readonly SegmentedControlOption<T>[];
    onChange: (value: T) => void;
    disabled?: boolean;
    accessibilityLabel?: string;
    style?: StyleProp<ViewStyle>;
}

const stylesheet = StyleSheet.create((theme) => ({
    frame: {
        flexDirection: 'row',
        borderRadius: theme.borderRadius.lg,
        padding: 3,
        minHeight: 50,
    },
    option: {
        minWidth: 70,
        minHeight: 44,
        paddingHorizontal: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.borderRadius.md,
    },
    optionSelected: {
        backgroundColor: theme.colors.accent,
    },
    optionPressed: {
        backgroundColor: theme.colors.accentSoft,
    },
    label: {
        ...Typography.default('semiBold'),
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 16,
    },
    labelSelected: {
        color: theme.colors.button.primary.tint,
    },
}));

export function SegmentedControl<T extends string>(props: SegmentedControlProps<T>) {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const { value, options, onChange, disabled, accessibilityLabel, style } = props;

    return (
        <GlassSurface role="radiogroup" accessibilityLabel={accessibilityLabel} tone="raised" disabled={disabled} style={[styles.frame, style]}>
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <Pressable
                        key={option.value}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected, disabled }}
                        aria-checked={selected}
                        {...getSpaceKeyActivationProps(() => onChange(option.value))}
                        disabled={disabled}
                        onPress={() => onChange(option.value)}
                        style={({ pressed }) => [
                            styles.option,
                            selected && styles.optionSelected,
                            pressed && !selected && styles.optionPressed,
                        ]}
                    >
                        <Text
                            style={[
                                styles.label,
                                selected && styles.labelSelected,
                            ]}
                            numberOfLines={1}
                        >
                            {option.label}
                        </Text>
                    </Pressable>
                );
            })}
        </GlassSurface>
    );
}
