import React, { Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { t } from '@/text';

const AccountSettingsView = React.lazy(async () => {
    const module = await import('./AccountSettingsView');
    return { default: module.AccountSettingsView };
});

export function AccountSettingsRoute() {
    return (
        <Suspense
            fallback={
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator
                        accessibilityLabel={t('common.loading')}
                        accessibilityRole="progressbar"
                    />
                </View>
            }
        >
            <AccountSettingsView />
        </Suspense>
    );
}
