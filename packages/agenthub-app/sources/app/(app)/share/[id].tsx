import * as React from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import { getPublicExternalShare } from '@/sync/externalSharesApi';
import {
    consumeExternalShareFragment,
    decryptSelectedTextShare,
    prepareExternalShareCrypto,
    type SelectedTextSharePayload,
} from '@/utils/externalShareCapability';
import { getExternalShareOrigin } from '@/utils/externalShareOrigin';
import { subscribeExternalShareLinks } from '@/utils/externalShareLinkListener';

type ViewState =
    | { status: 'loading' }
    | { status: 'missing-key' }
    | { status: 'not-found' }
    | { status: 'invalid-key' }
    | { status: 'ready'; payload: SelectedTextSharePayload };

const webCapabilityCache = new Map<string, { id: string; key: Uint8Array }>();

function readWebCapability(): { id: string; key: Uint8Array } | null {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
    const origin = getExternalShareOrigin();
    if (!origin) return null;
    const path = window.location.pathname;
    const parsed = consumeExternalShareFragment({
        href: window.location.href,
        expectedOrigin: origin,
        replaceState: (url) => window.history.replaceState({}, '', url),
    });
    if (parsed) webCapabilityCache.set(path, parsed);
    return parsed ?? webCapabilityCache.get(path) ?? null;
}

export default function PublicExternalShareScreen() {
    const params = useLocalSearchParams<{ id: string }>();
    const { theme } = useUnistyles();
    const [capability, setCapability] = React.useState(readWebCapability);
    const [state, setState] = React.useState<ViewState>(() => capability ? { status: 'loading' } : { status: 'missing-key' });

    React.useEffect(() => {
        if (Platform.OS === 'web' && typeof window !== 'undefined' && capability) {
            const cleanUrl = `${window.location.origin}${window.location.pathname}`;
            const scrub = () => window.history.replaceState({}, '', cleanUrl);
            scrub();
            const frame = window.requestAnimationFrame(scrub);
            const timeout = window.setTimeout(scrub, 250);
            return () => {
                window.cancelAnimationFrame(frame);
                window.clearTimeout(timeout);
            };
        }
    }, [capability, state.status]);

    React.useEffect(() => {
        if (capability) return;
        if (Platform.OS === 'web') {
            const parsed = readWebCapability();
            if (parsed) setCapability(parsed);
        }
    }, [capability]);

    React.useEffect(() => {
        if (Platform.OS === 'web') return;
        const consumeNativeUrl = (url: string | null) => {
            const origin = getExternalShareOrigin();
            const parsed = url && origin ? consumeExternalShareFragment({
                href: url,
                expectedOrigin: origin,
                replaceState: () => undefined,
            }) : null;
            if (parsed) setCapability(parsed);
        };
        return subscribeExternalShareLinks(consumeNativeUrl);
    }, []);

    React.useEffect(() => {
        if (!capability || capability.id !== params.id) {
            setState({ status: 'missing-key' });
            return;
        }
        const controller = new AbortController();
        setState({ status: 'loading' });
        void getPublicExternalShare(capability.id, controller.signal).then(async (share) => {
            await prepareExternalShareCrypto();
            const payload = decryptSelectedTextShare(share.ciphertext, capability.key);
            setState(payload ? { status: 'ready', payload } : { status: 'invalid-key' });
        }).catch(() => {
            if (!controller.signal.aborted) setState({ status: 'not-found' });
        });
        return () => {
            controller.abort();
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
                webCapabilityCache.delete(window.location.pathname);
            }
        };
    }, [capability, params.id]);

    const message = state.status === 'loading' ? t('externalShares.loading')
        : state.status === 'missing-key' ? t('externalShares.missingKey')
            : state.status === 'invalid-key' ? t('externalShares.invalidKey')
                : state.status === 'not-found' ? t('externalShares.notFound') : null;

    return (
        <View role="main" style={[styles.root, { backgroundColor: theme.colors.groupped.background }]}>
            <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <Text role="heading" aria-level={1} style={[styles.title, { color: theme.colors.text }]}>
                    {t('externalShares.publicTitle')}
                </Text>
                {state.status === 'ready' ? (
                    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                        <Text selectable style={[styles.body, { color: theme.colors.text }]}>{state.payload.text}</Text>
                    </ScrollView>
                ) : (
                    <Text accessibilityLiveRegion="polite" style={[styles.message, { color: theme.colors.textSecondary }]}>
                        {message}
                    </Text>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
    card: { width: '100%', maxWidth: 760, maxHeight: '90%', minHeight: 220, borderWidth: 1, borderRadius: 20, padding: 20 },
    title: { ...Typography.default('semiBold'), fontSize: 22, lineHeight: 30 },
    message: { ...Typography.default(), marginTop: 18, fontSize: 16, lineHeight: 24 },
    scroll: { marginTop: 16 },
    scrollContent: { paddingBottom: 8 },
    body: { ...Typography.default(), fontSize: 16, lineHeight: 25 },
});
