import * as React from 'react';
import { View, Text, Pressable } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { SCALE_LEVELS, type ScaleLevel } from '@/hooks/useScale';
import { t } from '@/text';
import { getSpaceKeyActivationProps } from '@/components/keyboardActivation';

const LABELS: Record<ScaleLevel, string> = {
    0.5: t('settingsAppearance.scaleLevelXXS'),
    0.6: t('settingsAppearance.scaleLevelXS'),
    0.7: t('settingsAppearance.scaleLevelS'),
    0.8: t('settingsAppearance.scaleLevelM'),
    0.9: t('settingsAppearance.scaleLevelL'),
    1.0: t('settingsAppearance.scaleDefault'),
};

type ScaleSliderProps = {
    accessibilityLabel: string;
    value: number;
    onChange: (value: number) => void;
};

export const ScaleSlider = React.memo(({ accessibilityLabel, value, onChange }: ScaleSliderProps) => {
    const { theme } = useUnistyles();

    return (
        <View style={styles.container}>
            <View role="radiogroup" accessibilityLabel={accessibilityLabel} style={styles.buttonRow}>
                {SCALE_LEVELS.map((level) => {
                    const isSelected = Math.abs(value - level) < 0.01;
                    const currentLevel = level as ScaleLevel;
                    return (
                    <Pressable
                        key={level}
                        accessibilityRole="radio"
                        accessibilityLabel={LABELS[currentLevel]}
                        accessibilityState={{ checked: isSelected }}
                        aria-checked={isSelected}
                        {...getSpaceKeyActivationProps(() => onChange(level))}
                        onPress={() => onChange(level)}
                        style={[
                            styles.button,
                            {
                                borderColor: isSelected ? theme.colors.accent : theme.colors.divider,
                                backgroundColor: isSelected
                                    ? theme.colors.accent
                                    : (theme.dark ? theme.colors.surface : 'rgba(255, 255, 255, 0.72)'),
                                shadowColor: isSelected ? theme.colors.accentGlow : theme.colors.glass.shadow,
                                shadowOpacity: theme.dark ? 0 : (isSelected ? 0.18 : 0.10),
                                shadowRadius: isSelected ? 10 : 8,
                                shadowOffset: { width: 0, height: isSelected ? 5 : 3 },
                                elevation: isSelected ? 2 : 1,
                            },
                        ]}
                    >
                        <Text
                            style={[
                                styles.letter,
                                {
                                    fontSize: 12,
                                    color: isSelected ? theme.colors.button.primary.tint : theme.colors.text,
                                },
                            ]}
                        >
                            {LABELS[currentLevel]}
                        </Text>
                    </Pressable>
                    );
                })}
            </View>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    buttonRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 4,
    },
    button: {
        minWidth: 44,
        minHeight: 44,
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    letter: {
        fontWeight: '600',
        textAlign: 'center',
    },
}));
