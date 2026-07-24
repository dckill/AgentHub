import React from 'react';
import { StyleSheet, Platform } from 'react-native';
import { CommandPaletteInput } from './CommandPaletteInput';
import { CommandPaletteResults } from './CommandPaletteResults';
import { useCommandPalette } from './useCommandPalette';
import { Command } from './types';
import { useUnistyles } from 'react-native-unistyles';
import { GlassSurface } from '@/components/glass';

interface CommandPaletteProps {
    commands: Command[];
    onClose: () => void;
}

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
    const { theme } = useUnistyles();
    const {
        searchQuery,
        selectedIndex,
        filteredCategories,
        inputRef,
        handleSearchChange,
        handleSelectCommand,
        handleKeyPress,
        setSelectedIndex,
    } = useCommandPalette(commands, onClose);

    // Only render on web
    if (Platform.OS !== 'web') {
        return null;
    }

    return (
        <GlassSurface tone="floating" style={[
            styles.container,
            {
                backgroundColor: theme.colors.glass.raised,
                borderColor: theme.dark ? theme.colors.glass.border : theme.colors.glass.borderStrong,
                shadowColor: theme.colors.glass.shadow,
                shadowOpacity: theme.dark ? 0.26 : 0.18,
            },
        ]}>
            <CommandPaletteInput
                value={searchQuery}
                onChangeText={handleSearchChange}
                onKeyPress={handleKeyPress}
                inputRef={inputRef}
            />
            <CommandPaletteResults
                categories={filteredCategories}
                selectedIndex={selectedIndex}
                onSelectCommand={handleSelectCommand}
                onSelectionChange={setSelectedIndex}
            />
        </GlassSurface>
    );
}

const styles = StyleSheet.create({
    container: {
        borderRadius: 16,
        width: '100%',
        maxWidth: 800, // Increased from 640 for wider input
        // Use viewport-based height for better layout
        ...(Platform.OS === 'web' ? {
            maxHeight: '60vh', // Takes up to 60% of viewport height
        } as any : {
            maxHeight: 500, // Fallback for native
        }),
        overflow: 'hidden',
        shadowOffset: {
            width: 0,
            height: 20,
        },
        shadowRadius: 40,
        elevation: 20,
        borderWidth: 1,
    },
});
