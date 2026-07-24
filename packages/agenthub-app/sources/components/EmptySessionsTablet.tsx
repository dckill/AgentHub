import React from 'react';
import { View, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Typography } from '@/constants/Typography';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 48,
    },
    iconContainer: {
        marginBottom: 24,
    },
    titleText: {
        fontSize: 20,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginBottom: 8,
        ...Typography.default('regular'),
    },
    descriptionText: {
        fontSize: 16,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginBottom: 24,
        ...Typography.default(),
    },
}));

export function EmptySessionsTablet() {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    return (
        <View style={styles.container}>
            <Ionicons 
                name="terminal-outline" 
                size={64} 
                color={theme.colors.textSecondary}
                style={styles.iconContainer}
            />
            
            <Text style={styles.titleText}>
                {t('components.emptySessionsTablet.noActiveSessions')}
            </Text>

            <Text style={styles.descriptionText}>
                {t('homeOverview.sidebarEmptyDescription')}
            </Text>
        </View>
    );
}
