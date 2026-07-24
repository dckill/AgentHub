import * as React from 'react';
import { ScaleSettingsPage } from '@/components/ScaleSettingsPage';
import { SettingsPreview } from '@/components/preview/SettingsPreview';
import { useSettingsScale } from '@/hooks/useScale';
import { t } from '@/text';

export default React.memo(() => {
    const { scale, setScale } = useSettingsScale();

    return (
        <ScaleSettingsPage
            title={t('settingsAppearance.settingsScale')}
            scale={scale}
            onScaleChange={setScale}
            preview={<SettingsPreview />}
        />
    );
});
