import * as React from 'react';
import { ScaleSettingsPage } from '@/components/ScaleSettingsPage';
import { DevicePreview } from '@/components/preview/DevicePreview';
import { useDeviceScale } from '@/hooks/useScale';
import { t } from '@/text';

export default React.memo(() => {
    const { scale, setScale } = useDeviceScale();

    return (
        <ScaleSettingsPage
            title={t('settingsAppearance.deviceScale')}
            scale={scale}
            onScaleChange={setScale}
            preview={<DevicePreview />}
            itemScale={scale}
        />
    );
});
