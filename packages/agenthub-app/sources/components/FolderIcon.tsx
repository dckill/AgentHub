import * as React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useUnistyles } from 'react-native-unistyles';

interface FolderIconProps {
    expanded?: boolean;
    size?: number;
    color?: string;
}

// VS Code-inspired folder colors
const FOLDER_COLOR_LIGHT = '#dcb67a';
const FOLDER_COLOR_DARK = '#e8ab5a';

export const FolderIcon = React.memo<FolderIconProps>(({ expanded = false, size = 16, color }) => {
    const { theme } = useUnistyles();
    const iconColor = color ?? (theme.dark ? FOLDER_COLOR_DARK : FOLDER_COLOR_LIGHT);
    return (
        <Ionicons
            name={expanded ? 'folder-open-outline' : 'folder-outline'}
            size={size}
            color={iconColor}
        />
    );
});
