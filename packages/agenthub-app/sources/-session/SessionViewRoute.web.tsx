import * as React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';

const LazySessionView = React.lazy(async () => {
    const module = await import('./SessionView');
    return { default: module.SessionView };
});

function SessionRouteLoading() {
    const { theme } = useUnistyles();
    const label = t('common.loading');

    return (
        <View style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            backgroundColor: theme.colors.groupped.background,
        }}>
            <ActivityIndicator
                accessibilityRole="progressbar"
                accessibilityLabel={label}
                color={theme.colors.accent}
            />
            <Text style={{ color: theme.colors.textSecondary }}>{label}</Text>
        </View>
    );
}

export function SessionViewRoute(props: { id: string }) {
    return (
        <React.Suspense fallback={<SessionRouteLoading />}>
            <LazySessionView {...props} />
        </React.Suspense>
    );
}
