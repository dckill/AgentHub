import * as React from 'react';
import { ScaleSettingsPage } from '@/components/ScaleSettingsPage';
import { FilePreview } from '@/components/preview/FilePreview';
import { useFileScale } from '@/hooks/useScale';
import { t } from '@/text';

export default React.memo(() => {
    const { scale, setScale } = useFileScale();

    return (
        <ScaleSettingsPage
            title={t('settingsAppearance.fileScale')}
            scale={scale}
            onScaleChange={setScale}
            preview={<FilePreview />}
        />
    );
});
