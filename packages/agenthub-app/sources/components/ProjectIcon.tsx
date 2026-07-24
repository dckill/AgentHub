import * as React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet } from 'react-native-unistyles';
import { getProjectIconDefinition } from '@/utils/projectIcons';

interface ProjectIconProps {
    icon: string;
    size: number;
    style?: StyleProp<ViewStyle>;
}

export const ProjectIcon = React.memo(function ProjectIcon({ icon, size, style }: ProjectIconProps) {
    const definition = getProjectIconDefinition(icon);

    return (
        <View
            style={[
                styles.vectorIcon,
                {
                    width: size,
                    height: size,
                    borderRadius: Math.max(8, size * 0.24),
                    backgroundColor: definition.backgroundColor,
                },
                style,
            ]}
        >
            <Ionicons
                name={definition.icon as keyof typeof Ionicons.glyphMap}
                size={Math.round(size * 0.56)}
                color={definition.color}
            />
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    vectorIcon: {
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.dark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.08)',
    },
}));
