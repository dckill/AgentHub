import * as React from 'react';
import { ActivityIndicator } from 'react-native';
import { t } from '@/text';

const LazySharedLinksView = React.lazy(async () => {
    const module = await import('./SharedLinksView');
    return { default: module.SharedLinksView };
});

export function SharedLinksRoute() {
    return (
        <React.Suspense fallback={<ActivityIndicator accessibilityRole="progressbar" accessibilityLabel={t('common.loading')} />}>
            <LazySharedLinksView />
        </React.Suspense>
    );
}
