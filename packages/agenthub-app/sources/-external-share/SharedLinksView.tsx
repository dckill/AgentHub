import * as React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useUnistyles } from 'react-native-unistyles';
import { SettingsPage } from '@/components/SettingsPage';
import { ItemGroup } from '@/components/ItemGroup';
import { Item } from '@/components/Item';
import { useAuth } from '@/auth/AuthContext';
import { listExternalShares, revokeExternalShare, type ExternalShareMetadata } from '@/sync/externalSharesApi';
import { Modal } from '@/modal';
import { t } from '@/text';

function getStatus(share: ExternalShareMetadata, now: number): 'active' | 'expired' | 'revoked' {
    if (share.revokedAt !== null) return 'revoked';
    return share.expiresAt <= now ? 'expired' : 'active';
}

export function SharedLinksView() {
    const auth = useAuth();
    const { theme } = useUnistyles();
    const [shares, setShares] = React.useState<ExternalShareMetadata[]>([]);
    const [status, setStatus] = React.useState<'loading' | 'ready' | 'error'>('loading');
    const [revoking, setRevoking] = React.useState<string | null>(null);

    const load = React.useCallback(async (signal?: AbortSignal) => {
        if (!auth.credentials) return;
        setStatus('loading');
        try {
            setShares(await listExternalShares(auth.credentials, signal));
            setStatus('ready');
        } catch {
            if (!signal?.aborted) setStatus('error');
        }
    }, [auth.credentials]);

    React.useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load]);

    const confirmRevoke = React.useCallback((share: ExternalShareMetadata) => {
        Modal.alert(t('externalShares.revoke'), t('externalShares.revokeConfirm'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
                text: t('externalShares.revoke'), style: 'destructive', onPress: async () => {
                    if (!auth.credentials) return;
                    setRevoking(share.id);
                    try {
                        const updated = await revokeExternalShare(auth.credentials, share.id);
                        setShares((current) => current.map((item) => item.id === updated.id ? updated : item));
                    } catch {
                        Modal.alert(t('common.error'), t('externalShares.revokeFailed'));
                    } finally {
                        setRevoking(null);
                    }
                },
            },
        ]);
    }, [auth.credentials]);

    const now = Date.now();
    return (
        <SettingsPage title={t('externalShares.title')}>
            <ItemGroup footer={status === 'error' ? t('externalShares.loadFailed') : undefined}>
                {status === 'loading' && <Item title={t('common.loading')} loading showChevron={false} />}
                {status === 'error' && <Item title={t('common.retry')} onPress={() => void load()} showChevron={false} />}
                {status === 'ready' && shares.length === 0 && (
                    <Item title={t('externalShares.empty')} showChevron={false} />
                )}
                {status === 'ready' && shares.map((share) => {
                    const shareStatus = getStatus(share, now);
                    const statusLabel = t(`externalShares.${shareStatus}`);
                    const expires = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(share.expiresAt);
                    return (
                        <Item
                            key={share.id}
                            title={statusLabel}
                            subtitle={`${t('externalShares.expires')}: ${expires}`}
                            subtitleLines={0}
                            icon={<Ionicons name={shareStatus === 'active' ? 'lock-closed-outline' : 'link-outline'} size={28} color={theme.colors.textSecondary} />}
                            disabled={shareStatus !== 'active' || revoking === share.id}
                            loading={revoking === share.id}
                            showChevron={shareStatus === 'active'}
                            onPress={shareStatus === 'active' ? () => confirmRevoke(share) : undefined}
                        />
                    );
                })}
            </ItemGroup>
        </SettingsPage>
    );
}
