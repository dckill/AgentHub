import * as React from 'react';
import { ScaleSettingsPage } from '@/components/ScaleSettingsPage';
import { SessionListPreview } from '@/components/preview/SessionListPreview';
import { useSessionListScale } from '@/hooks/useScale';
import { t } from '@/text';

export default React.memo(() => {
    const { scale, setScale } = useSessionListScale();

    return (
        <ScaleSettingsPage
            title={t('settingsAppearance.sessionScale')}
            scale={scale}
            onScaleChange={setScale}
            preview={<SessionListPreview />}
        />
    );
});
