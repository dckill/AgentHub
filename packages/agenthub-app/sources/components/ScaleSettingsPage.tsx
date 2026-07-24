import * as React from 'react';
import { View } from 'react-native';
import { ItemGroup } from '@/components/ItemGroup';
import { ScaleSlider } from '@/components/ScaleSlider';
import { SettingsPage } from '@/components/SettingsPage';
import { t } from '@/text';

type ScaleSettingsPageProps = {
    title: string;
    scale: number;
    onScaleChange: (value: number) => void;
    preview: React.ReactNode;
    itemScale?: number;
};

export function ScaleSettingsPage({
    title,
    scale,
    onScaleChange,
    preview,
    itemScale,
}: ScaleSettingsPageProps) {
    return (
        <SettingsPage title={title} listStyle={{ paddingTop: 0 }} itemScale={itemScale}>
            <ItemGroup title={t('settingsAppearance.scaling')}>
                <View style={{ paddingVertical: 8 }}>
                    <ScaleSlider
                        accessibilityLabel={t('settingsAppearance.scaling')}
                        value={scale}
                        onChange={onScaleChange}
                    />
                </View>
            </ItemGroup>
            <ItemGroup title={t('settingsAppearance.previewLabel')}>
                {preview}
            </ItemGroup>
        </SettingsPage>
    );
}
