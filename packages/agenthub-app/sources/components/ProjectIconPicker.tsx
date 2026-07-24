import * as React from 'react';
import { Pressable, ScrollView } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { PROJECT_ICON_CHOICES } from '@/utils/projectIcons';
import { ProjectIcon } from '@/components/ProjectIcon';
import { t } from '@/text';

interface ProjectIconPickerProps {
    selectedIcon: string;
    onSelect: (icon: string) => void;
    iconSize?: number;
}

export const ProjectIconPicker = React.memo(({ selectedIcon, onSelect, iconSize = 36 }: ProjectIconPickerProps) => {
    return (
        <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.grid}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
        >
            {PROJECT_ICON_CHOICES.map((icon) => {
                const isSelected = icon.id === selectedIcon;
                return (
                    <Pressable
                        key={icon.id}
                        onPress={() => onSelect(icon.id)}
                        style={[styles.iconButton, isSelected && styles.iconButtonSelected]}
                        hitSlop={4}
                        accessibilityRole="button"
                        accessibilityLabel={t('project.selectIconAccessibility', { icon: icon.id.slice('icon:'.length) })}
                        accessibilityState={{ selected: isSelected }}
                        aria-pressed={isSelected}
                    >
                        <ProjectIcon icon={icon.id} size={iconSize} />
                    </Pressable>
                );
            })}
        </ScrollView>
    );
});

const styles = StyleSheet.create((theme) => ({
    scrollView: {
        flex: 1,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingVertical: 8,
        paddingHorizontal: 4,
    },
    iconButton: {
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        margin: 2,
    },
    iconButtonSelected: {
        backgroundColor: theme.colors.success + '20',
        borderWidth: 2,
        borderColor: theme.colors.success,
    },
}));
