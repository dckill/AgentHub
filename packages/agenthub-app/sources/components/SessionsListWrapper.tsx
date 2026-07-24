import * as React from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { SessionsList } from './SessionsList';
import { EmptyMainScreen } from './EmptyMainScreen';
import { useProjectListViewData } from '@/sync/storage';
import { t } from '@/text';
import { Typography } from '@/constants/Typography';

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
    },
    screenReaderHeading: {
        position: 'absolute',
        width: 1,
        height: 1,
        overflow: 'hidden',
        opacity: 0,
    },
    loadingContainerWrapper: {
        flex: 1,
        flexBasis: 0,
        flexGrow: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: 32,
        gap: 12,
    },
    loadingText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        ...Typography.default(),
    },
    emptyStateContainer: {
        flex: 1,
        flexBasis: 0,
        flexGrow: 1,
        flexDirection: 'column',
        backgroundColor: theme.colors.groupped.background,
    },
    emptyStateContentContainer: {
        flex: 1,
        flexBasis: 0,
        flexGrow: 1,
    },
}));

export const SessionsListWrapper = React.memo(() => {
    const { theme } = useUnistyles();
    const projectListViewData = useProjectListViewData();
    const styles = stylesheet;

    if (projectListViewData === null) {
        return (
            <View role="main" style={styles.container}>
                <Text role="heading" aria-level={1} style={styles.screenReaderHeading}>{t('tabs.sessions')}</Text>
                <View style={styles.loadingContainerWrapper}>
                    <View
                        role="status"
                        accessibilityLiveRegion="polite"
                        accessibilityLabel={t('homeOverview.loading')}
                        style={styles.loadingContainer}
                    >
                        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                        <Text style={styles.loadingText}>{t('homeOverview.loading')}</Text>
                    </View>
                </View>
            </View>
        );
    }

    if (projectListViewData.length === 0) {
        return (
            <View role="main" style={styles.container}>
                <Text role="heading" aria-level={1} style={styles.screenReaderHeading}>{t('tabs.sessions')}</Text>
                <View style={styles.emptyStateContainer}>
                    <View style={styles.emptyStateContentContainer}>
                        <EmptyMainScreen />
                    </View>
                </View>
            </View>
        );
    }

    return (
        <View role="main" style={styles.container}>
            <Text role="heading" aria-level={1} style={styles.screenReaderHeading}>{t('tabs.sessions')}</Text>
            <SessionsList />
        </View>
    );
});
