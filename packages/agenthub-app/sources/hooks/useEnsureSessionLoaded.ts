import * as React from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useSession } from '@/sync/storage';
import { sync } from '@/sync/sync';
import { getEnsureSessionLoadKey } from './useEnsureSessionLoadedKey';

export function useEnsureSessionLoaded(sessionId: string | null | undefined) {
    const { credentials } = useAuth();
    const session = useSession(sessionId ?? '');
    const [isLoading, setIsLoading] = React.useState(false);
    const credentialToken = credentials?.token ?? null;
    const ensureKey = getEnsureSessionLoadKey(sessionId, !!session, credentialToken);

    React.useEffect(() => {
        if (!ensureKey) {
            return;
        }

        let cancelled = false;
        setIsLoading(true);

        void sync.ensureSessionLoaded(sessionId!)
            .catch((error) => {
                console.error('Failed to ensure session loaded:', {
                    sessionId,
                    error,
                    message: error instanceof Error ? error.message : String(error),
                });
            })
            .finally(() => {
                if (!cancelled) {
                    setIsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [ensureKey, sessionId]);

    return { session, isLoading };
}
