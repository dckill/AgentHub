import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '@/auth/AuthContext';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { Modal } from '@/modal';
import { t } from '@/text';
import { useUnistyles } from 'react-native-unistyles';
import { useRouter } from 'expo-router';
import { listCredentials, deleteCredential, type ManagedCredential } from '@/sync/apiCredentials';
import { CLIENT_AGENT_LABELS, isSupportedClientAgent, type SupportedClientAgent } from '@/sync/agentTypes';
import { SettingsPage } from '@/components/SettingsPage';
import { ActivityIndicator, Text, View } from 'react-native';
import { GlassIconButton } from '@/components/glass';
import { StyleSheet } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';

const agentIcons: Record<SupportedClientAgent, string> = {
    claude: 'code-working-outline',
    codex: 'terminal-outline',
};

export default React.memo(function CredentialsScreen() {
    const { theme } = useUnistyles();
    const auth = useAuth();
    const router = useRouter();
    const [credentials, setCredentials] = useState<ManagedCredential[]>([]);
    const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
    const [error, setError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const loadCredentials = useCallback(async (signal?: AbortSignal) => {
        if (!auth.credentials) {
            setLoadState('error');
            setError(t('credentials.loadFailed'));
            return;
        }
        setLoadState('loading');
        setError(null);
        try {
            const list = await listCredentials(auth.credentials, signal);
            if (signal?.aborted) return;
            setCredentials(list);
            setLoadState('ready');
        } catch {
            if (signal?.aborted) return;
            setLoadState('error');
            setError(t('credentials.loadFailed'));
        }
    }, [auth.credentials]);

    useFocusEffect(useCallback(() => {
        const controller = new AbortController();
        void loadCredentials(controller.signal);
        return () => {
            controller.abort();
        };
    }, [loadCredentials]));

    const handleDelete = useCallback(async (id: string) => {
        const confirmed = await Modal.confirm(
            t('credentials.deleteCredential'),
            t('credentials.deleteConfirm'),
            { destructive: true, confirmText: t('credentials.deleteCredential') }
        );
        if (!confirmed || !auth.credentials) return;
        setDeletingId(id);
        setError(null);
        try {
            await deleteCredential(auth.credentials, id);
            setCredentials(current => current.filter(credential => credential.id !== id));
            setLoadState('ready');
        } catch {
            setError(t('credentials.deleteFailed'));
            setLoadState('error');
        } finally {
            setDeletingId(null);
        }
    }, [auth.credentials]);

    const supportedCredentials = credentials.filter(
        (cred): cred is ManagedCredential & { agent: SupportedClientAgent } => isSupportedClientAgent(cred.agent),
    );

    return (
        <SettingsPage title={t('credentials.title')}>
            {loadState === 'loading' && supportedCredentials.length === 0 && (
                <ItemGroup title={t('credentials.title')}>
                    <View
                        role="status"
                        accessibilityLiveRegion="polite"
                        style={styles.status}
                    >
                        <ActivityIndicator size="small" color={theme.colors.accent} />
                        <Text style={[styles.statusText, { color: theme.colors.textSecondary }]}>
                            {t('common.loading')}
                        </Text>
                    </View>
                </ItemGroup>
            )}

            {loadState === 'error' && error && (
                <ItemGroup title={t('common.error')}>
                    <View
                        role="status"
                        accessibilityLiveRegion="polite"
                        style={styles.status}
                    >
                        <Ionicons name="alert-circle-outline" size={32} color={theme.colors.status.error} />
                        <Text style={[styles.statusText, { color: theme.colors.status.error }]}>{error}</Text>
                    </View>
                    <Item
                        title={t('common.retry')}
                        icon={<Ionicons name="refresh-outline" size={29} color={theme.colors.accent} />}
                        onPress={() => void loadCredentials()}
                        showChevron={false}
                    />
                </ItemGroup>
            )}

            {loadState === 'ready' && supportedCredentials.length === 0 ? (
                <ItemGroup
                    title={t('credentials.title')}
                    footer={t('credentials.noCredentialsSubtitle')}
                >
                    <Item
                        title={t('credentials.noCredentials')}
                        showChevron={false}
                        icon={<Ionicons name="key-outline" size={29} color={theme.colors.textSecondary} />}
                    />
                </ItemGroup>
            ) : supportedCredentials.length > 0 ? (
                <ItemGroup title={t('credentials.title')}>
                    {supportedCredentials.map((cred) => (
                        <Item
                            key={cred.id}
                            title={cred.label}
                            subtitle={`${CLIENT_AGENT_LABELS[cred.agent]}${cred.baseUrl ? ` • ${cred.baseUrl}` : ''}`}
                            icon={<Ionicons name={agentIcons[cred.agent] as any} size={29} color={theme.colors.warning} />}
                            onPress={() => router.push(`/settings/credentials/edit?id=${cred.id}`)}
                            rightElementInteractive
                            rightElement={
                                <GlassIconButton
                                    accessibilityLabel={t('credentials.deleteCredentialLabel', { label: cred.label })}
                                    icon={<Ionicons name="trash-outline" size={20} color={theme.colors.textDestructive} />}
                                    variant="danger"
                                    size={44}
                                    disabled={deletingId !== null}
                                    onPress={() => void handleDelete(cred.id)}
                                />
                            }
                        />
                    ))}
                </ItemGroup>
            ) : null}

            <ItemGroup>
                <Item
                    title={t('credentials.addCredential')}
                    icon={<Ionicons name="add-circle-outline" size={29} color={theme.colors.accent} />}
                    onPress={() => router.push('/settings/credentials/edit')}
                />
            </ItemGroup>
        </SettingsPage>
    );
});

const styles = StyleSheet.create({
    status: {
        minHeight: 88,
        paddingHorizontal: 20,
        paddingVertical: 18,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    statusText: {
        ...Typography.default(),
        fontSize: 14,
        lineHeight: 20,
        textAlign: 'center',
    },
});
