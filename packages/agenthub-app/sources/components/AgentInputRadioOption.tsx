import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';

interface AgentInputRadioOptionProps {
    label: string;
    description?: string;
    selected: boolean;
    onPress: () => void;
}

const stylesheet = StyleSheet.create((theme) => ({
    option: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        minHeight: 44,
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    optionPressed: {
        backgroundColor: theme.colors.surfacePressed,
    },
    radio: {
        width: 16,
        height: 16,
        borderRadius: 8,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        marginTop: 2,
    },
    radioSelected: {
        borderColor: theme.colors.radio.active,
    },
    radioUnselected: {
        borderColor: theme.colors.radio.inactive,
    },
    radioDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: theme.colors.radio.dot,
    },
    content: {
        flex: 1,
    },
    label: {
        fontSize: 14,
        color: theme.colors.text,
        ...Typography.default(),
    },
    description: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
}));

export function AgentInputRadioOption({
    label,
    description,
    selected,
    onPress,
}: AgentInputRadioOptionProps) {
    const styles = stylesheet;

    return (
        <Pressable
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ checked: selected }}
            aria-checked={selected}
            onPress={onPress}
            style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
        >
            <View style={[styles.radio, selected ? styles.radioSelected : styles.radioUnselected]}>
                {selected && <View style={styles.radioDot} />}
            </View>
            <View style={styles.content}>
                <Text style={styles.label}>{label}</Text>
                {description && (
                    <Text style={styles.description}>{description}</Text>
                )}
            </View>
        </Pressable>
    );
}
