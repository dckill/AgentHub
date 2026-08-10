import type { MessageSentSource } from '@/track';
import type { Session } from './storageTypes';

export function completeSendMessage({
    source,
    metadata,
    track,
    invalidate,
    startWatchdog,
}: {
    source: MessageSentSource;
    metadata: Session['metadata'];
    track: (source: MessageSentSource, metadata: Session['metadata']) => void;
    invalidate: () => void;
    startWatchdog: () => void;
}) {
    track(source, metadata);
    invalidate();
    startWatchdog();
}
