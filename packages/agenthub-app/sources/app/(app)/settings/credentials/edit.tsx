import React, { useState, useCallback } from 'react';
import { ActivityIndicator, View, Text, TextInput } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '@/auth/AuthContext';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { Modal } from '@/modal';
import { t } from '@/text';
import { useUnistyles } from 'react-native-unistyles';
import { StyleSheet } from 'react-native-unistyles';
import {
    getCredential,
    createCredential,
    updateCredential,
} from '@/sync/apiCredentials';
import { CLIENT_AGENT_LABELS, SUPPORTED_CLIENT_AGENTS, coerceSupportedClientAgent, type SupportedClientAgent } from '@/sync/agentTypes';
import { SettingsPage } from '@/components/SettingsPage';
import { SelectRow } from '@/components/SelectRow';
import { Typography } from '@/constants/Typography';
import { sync } from '@/sync/sync';
import { runCredentialEditLoad, runCredentialEditSave } from '../credentialEditLifecycle';

const AGENT_OPTIONS = SUPPORTED_CLIENT_AGENTS.map((key) => ({
    key,
    label: CLIENT_AGENT_LABELS[key],
}));

const CLAUDE_MODEL_FIELDS = [
    { key: 'ANTHROPIC_MODEL', labelKey: 'credentials.anthropicModel' as const },
    { key: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', labelKey: 'credentials.anthropicHaikuModel' as const },
    { key: 'ANTHROPIC_DEFAULT_SONNET_MODEL', labelKey: 'credentials.anthropicSonnetModel' as const },
    { key: 'ANTHROPIC_DEFAULT_OPUS_MODEL', labelKey: 'credentials.anthropicOpusModel' as const },
    { key: 'ANTHROPIC_REASONING_MODEL', labelKey: 'credentials.anthropicReasoningModel' as const },
];

export default React.memo(function EditCredentialScreen() {
    const { theme } = useUnistyles();
    const auth = useAuth();
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id?: string }>();
    const isEditing = !!id;

    const [label, setLabel] = useState('');
    const [agent, setAgent] = useState<SupportedClientAgent>('claude');
    const [apiKey, setApiKey] = useState('');
    const [baseUrl, setBaseUrl] = useState('');
    const [modelOverrides, setModelOverrides] = useState<Record<string, string>>({});
    const [showModelOverrides, setShowModelOverrides] = useState(false);
    const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(isEditing ? 'loading' : 'ready');
    const [operationError, setOperationError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const loadCredential = useCallback(async (signal?: AbortSignal) => {
        const credentials = auth.credentials;
        const generation = sync.getAccountGeneration();
        if (!id || !credentials || generation === null) {
            setLoadState('error');
            setOperationError(t('credentials.loadFailed'));
            return;
        }
        const isCurrent = () => !signal?.aborted
            && sync.getAccountGeneration() === generation
            && sync.getCredentials()?.token === credentials.token;
        await runCredentialEditLoad({
            fetchCredential: () => getCredential(credentials, id, signal),
            isCurrent,
            apply: (cred) => {
                setLabel(cred.label);
                setAgent(coerceSupportedClientAgent(cred.agent));
                setApiKey('');
                setBaseUrl(cred.baseUrl ?? '');
                setModelOverrides(cred.modelOverrides ?? {});
                setShowModelOverrides(Boolean(cred.modelOverrides && Object.keys(cred.modelOverrides).length > 0));
            },
            setLoadState,
            setError: setOperationError,
            errorMessage: t('credentials.loadFailed'),
        });
    }, [auth.credentials, id]);

    useFocusEffect(useCallback(() => {
        if (!isEditing) return;
        const controller = new AbortController();
        void loadCredential(controller.signal);
        return () => {
            controller.abort();
        };
    }, [isEditing, loadCredential]));

    const doSave = useCallback(async () => {
        const credentials = auth.credentials;
        const generation = sync.getAccountGeneration();
        if (!credentials || generation === null) return;
        if (!label.trim()) {
            Modal.alert(t('common.error'), t('credentials.validationLabelRequired'));
            return;
        }
        if (!isEditing && !apiKey.trim()) {
            Modal.alert(t('common.error'), t('credentials.validationApiKeyRequired'));
            return;
        }

        const isCurrent = () => sync.getAccountGeneration() === generation
            && sync.getCredentials()?.token === credentials.token;
        setSaving(true);
        setOperationError(null);
        const input: any = {
            label: label.trim(),
            apiKey: apiKey.trim() || undefined,
            baseUrl: baseUrl.trim() || null,
            modelOverrides: showModelOverrides && Object.values(modelOverrides).some(v => v.trim()) ? modelOverrides : null,
        };

        try {
            await runCredentialEditSave({
                save: async () => {
                    if (isEditing && id) {
                        await updateCredential(credentials, id, input);
                    } else {
                        input.agent = agent;
                        input.apiKey = apiKey.trim();
                        await createCredential(credentials, input);
                    }
                },
                isCurrent,
                onSuccess: () => router.back(),
                setError: setOperationError,
                errorMessage: t('credentials.saveFailed'),
            });
        } finally {
            if (isCurrent()) setSaving(false);
        }
    }, [agent, apiKey, auth.credentials, baseUrl, id, isEditing, label, modelOverrides, router, showModelOverrides]);

    React.useEffect(() => {
        setSaving(false);
        setOperationError(null);
    }, [auth.credentials?.token, id]);

    return (
        <>
            <Stack.Screen
                options={{ headerTitle: isEditing ? t('credentials.editCredential') : t('credentials.addCredential') }}
            />
            <SettingsPage title={isEditing ? t('credentials.editCredential') : t('credentials.addCredential')}>
            {isEditing && loadState === 'loading' && (
                <ItemGroup title={t('credentials.editCredential')}>
                    <View role="status" accessibilityLiveRegion="polite" style={styles.status}>
                        <ActivityIndicator size="small" color={theme.colors.accent} />
                        <Text style={[styles.statusText, { color: theme.colors.textSecondary }]}>
                            {t('common.loading')}
                        </Text>
                    </View>
                </ItemGroup>
            )}

            {isEditing && loadState === 'error' && (
                <ItemGroup title={t('common.error')}>
                    <View role="status" accessibilityLiveRegion="polite" style={styles.status}>
                        <Ionicons name="alert-circle-outline" size={32} color={theme.colors.status.error} />
                        <Text style={[styles.statusText, { color: theme.colors.status.error }]}>
                            {operationError ?? t('credentials.loadFailed')}
                        </Text>
                    </View>
                    <Item
                        title={t('common.retry')}
                        icon={<Ionicons name="refresh-outline" size={29} color={theme.colors.accent} />}
                        onPress={() => void loadCredential()}
                        showChevron={false}
                    />
                </ItemGroup>
            )}

            {(!isEditing || loadState === 'ready') && (<>
            {operationError && (
                <ItemGroup title={t('common.error')}>
                    <View role="status" accessibilityLiveRegion="polite" style={styles.statusCompact}>
                        <Ionicons name="alert-circle-outline" size={24} color={theme.colors.status.error} />
                        <Text style={[styles.statusText, { color: theme.colors.status.error }]}>{operationError}</Text>
                    </View>
                </ItemGroup>
            )}
            {/* Label */}
            <ItemGroup title={t('credentials.label')}>
                <View style={styles.inputContainer}>
                    <TextInput
                        accessibilityLabel={t('credentials.label')}
                        style={[styles.input, { color: theme.colors.text }]}
                        value={label}
                        onChangeText={setLabel}
                        placeholder={t('credentials.labelPlaceholder')}
                        placeholderTextColor={theme.colors.textSecondary}
                    />
                </View>
            </ItemGroup>

            {/* Agent Type (only when creating) */}
            {!isEditing && (
                <ItemGroup title={t('credentials.agentType')}>
                    <View role="radiogroup" accessibilityLabel={t('credentials.agentType')}>
                        {AGENT_OPTIONS.map((opt) => (
                        <SelectRow
                            key={opt.key}
                            title={opt.label}
                            selected={agent === opt.key}
                            onPress={() => setAgent(opt.key)}
                        />
                        ))}
                    </View>
                </ItemGroup>
            )}

            {/* API Key */}
            <ItemGroup title={t('credentials.apiKey')}>
                <View style={styles.inputContainer}>
                    <TextInput
                        accessibilityLabel={t('credentials.apiKey')}
                        style={[styles.input, { color: theme.colors.text }]}
                        value={apiKey}
                        onChangeText={setApiKey}
                        placeholder={isEditing ? t('credentials.apiKeyUnchanged') : t('credentials.apiKeyPlaceholder')}
                        placeholderTextColor={theme.colors.textSecondary}
                        secureTextEntry
                    />
                </View>
            </ItemGroup>

            {/* Base URL */}
            <ItemGroup title={t('credentials.baseUrl')}>
                <View style={styles.inputContainer}>
                    <TextInput
                        accessibilityLabel={t('credentials.baseUrl')}
                        style={[styles.input, { color: theme.colors.text }]}
                        value={baseUrl}
                        onChangeText={setBaseUrl}
                        placeholder={t('credentials.baseUrlPlaceholder')}
                        placeholderTextColor={theme.colors.textSecondary}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                    />
                </View>
            </ItemGroup>

            {/* Model Overrides (Claude only for now) */}
            {agent === 'claude' && (
                <ItemGroup
                    title={t('credentials.modelOverrides')}
                    footer={showModelOverrides ? undefined : t('credentials.modelOverrides')}
                >
                    <Item
                        title={showModelOverrides ? t('credentials.modelOverrides') : t('credentials.modelOverrides')}
                        icon={<Ionicons name={showModelOverrides ? 'chevron-down-outline' : 'chevron-forward-outline'} size={20} color={theme.colors.textSecondary} />}
                        onPress={() => setShowModelOverrides(!showModelOverrides)}
                        showChevron={false}
                    />
                    {showModelOverrides && CLAUDE_MODEL_FIELDS.map((field) => (
                        <View key={field.key} style={[styles.inputContainer, { paddingLeft: 16 }]}>
                            <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>
                                {t(field.labelKey)}
                            </Text>
                            <TextInput
                                accessibilityLabel={t(field.labelKey)}
                                style={[styles.input, { color: theme.colors.text }]}
                                value={modelOverrides[field.key] || ''}
                                onChangeText={(text) => setModelOverrides(prev => ({ ...prev, [field.key]: text }))}
                                placeholder={t('credentials.modelPlaceholder')}
                                placeholderTextColor={theme.colors.textSecondary}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                        </View>
                    ))}
                </ItemGroup>
            )}

            {/* Save Button */}
            <ItemGroup>
                <Item
                    title={t('common.save')}
                    onPress={doSave}
                    loading={saving}
                    icon={<Ionicons name="checkmark-circle-outline" size={29} color={theme.colors.accent} />}
                    showChevron={false}
                />
            </ItemGroup>
            </>)}
            </SettingsPage>
        </>
    );
});

const styles = StyleSheet.create({
    inputContainer: {
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    input: {
        minHeight: 44,
        fontSize: 16,
        paddingVertical: 4,
    },
    fieldLabel: {
        fontSize: 12,
        marginBottom: 2,
    },
    status: {
        minHeight: 96,
        paddingHorizontal: 20,
        paddingVertical: 18,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    statusCompact: {
        minHeight: 64,
        paddingHorizontal: 20,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    statusText: {
        ...Typography.default(),
        fontSize: 14,
        lineHeight: 20,
        textAlign: 'center',
    },
});
