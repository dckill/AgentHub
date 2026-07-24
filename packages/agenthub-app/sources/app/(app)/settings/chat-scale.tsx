import * as React from 'react';
import { ScaleSettingsPage } from '@/components/ScaleSettingsPage';
import { ChatPreview } from '@/components/preview/ChatPreview';
import { useChatScale } from '@/hooks/useScale';
import { t } from '@/text';

export default React.memo(() => {
    const { scale, setScale } = useChatScale();

    return (
        <ScaleSettingsPage
            title={t('settingsAppearance.chatScale')}
            scale={scale}
            onScaleChange={setScale}
            preview={<ChatPreview />}
        />
    );
});
