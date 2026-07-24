import * as React from 'react';
import { ScaleSettingsPage } from '@/components/ScaleSettingsPage';
import { FileListPreview } from '@/components/preview/FileListPreview';
import { useFileListScale } from '@/hooks/useScale';
import { t } from '@/text';

export default React.memo(() => {
    const { scale, setScale } = useFileListScale();

    return (
        <ScaleSettingsPage
            title={t('settingsAppearance.fileListScale')}
            scale={scale}
            onScaleChange={setScale}
            preview={<FileListPreview />}
        />
    );
});
