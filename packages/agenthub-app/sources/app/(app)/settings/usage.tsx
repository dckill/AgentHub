import React from 'react';
import { UsagePanel } from '@/components/usage/UsagePanel';
import { SettingsPage } from '@/components/SettingsPage';
import { t } from '@/text';

export default function UsageSettingsScreen() {
    return (
        <SettingsPage title={t('settings.usage')} listStyle={{ paddingTop: 0 }}>
            <UsagePanel />
        </SettingsPage>
    );
}
