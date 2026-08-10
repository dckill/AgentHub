import React, { useState } from 'react';
import { View, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { RoundButton } from '@/components/RoundButton';
import { Modal } from '@/modal';
import { layout } from '@/components/layout';
import { t } from '@/text';
import { getServerUrl, validateServerUrl, getServerInfo } from '@/sync/serverConfig';
import { useAuth } from '@/auth/AuthContext';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';
import { sync } from '@/sync/sync';

const stylesheet = StyleSheet.create((theme) => ({
    keyboardAvoidingView: {
        flex: 1,
    },
    itemListContainer: {
        flex: 1,
    },
    contentContainer: {
        backgroundColor: theme.colors.surface,
        paddingHorizontal: 16,
        paddingVertical: 12,
        width: '100%',
        maxWidth: layout.maxWidth,
        alignSelf: 'center',
    },
    labelText: {
        ...Typography.default('semiBold'),
        fontSize: 12,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    textInput: {
        backgroundColor: theme.colors.input.background,
        minHeight: 44,
        padding: 12,
        borderRadius: 8,
        marginBottom: 8,
        ...Typography.mono(),
        fontSize: 14,
        color: theme.colors.input.text,
    },
    textInputValidating: {
        opacity: 0.6,
    },
    errorText: {
        ...Typography.default(),
        fontSize: 12,
        color: theme.colors.textDestructive,
        marginBottom: 12,
    },
    validatingText: {
        ...Typography.default(),
        fontSize: 12,
        color: theme.colors.status.connecting,
        marginBottom: 12,
    },
    buttonRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 12,
    },
    buttonWrapper: {
        flex: 1,
        flexBasis: 160,
    },
    statusText: {
        ...Typography.default(),
        fontSize: 12,
        color: theme.colors.textSecondary,
        textAlign: 'center',
    },
}));

export default function ServerConfigScreen() {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const auth = useAuth();
    const serverInfo = getServerInfo();
    const [inputUrl, setInputUrl] = useState(serverInfo.isCustom ? getServerUrl() : '');
    const [error, setError] = useState<string | null>(null);
    const [isValidating, setIsValidating] = useState(false);

    const validateServer = async (url: string, isCurrent: () => boolean): Promise<boolean> => {
        if (!isCurrent()) {
            return false;
        }
        try {
            setIsValidating(true);
            setError(null);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'text/plain'
                }
            });
            
            if (!isCurrent()) {
                return false;
            }
            if (!response.ok) {
                setError(t('server.serverReturnedError'));
                return false;
            }
            
            const text = await response.text();
            if (!isCurrent()) {
                return false;
            }
            if (!text.includes('Welcome to AgentHub Server!')) {
                setError(t('server.notValidAgentHubServer'));
                return false;
            }
            
            return true;
        } catch (err) {
            if (isCurrent()) {
                setError(t('server.failedToConnectToServer'));
            }
            return false;
        } finally {
            if (isCurrent()) {
                setIsValidating(false);
            }
        }
    };

    const handleSave = async () => {
        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        if (!isCurrent()) {
            return;
        }
        if (!inputUrl.trim()) {
            Modal.alert(t('common.error'), t('server.enterServerUrl'));
            return;
        }

        const validation = validateServerUrl(inputUrl);
        if (!validation.valid) {
            setError(validation.error || t('errors.invalidFormat'));
            return;
        }

        // Validate the server
        const isValid = await runSessionActionRequest({
            isCurrent,
            request: () => validateServer(inputUrl, isCurrent),
        });
        if (isValid === null || !isValid) {
            return;
        }

        const confirmed = await runSessionActionRequest({
            isCurrent,
            request: () => Modal.confirm(
                t('server.changeServer'),
                t('server.continueWithServer'),
                { confirmText: t('common.continue'), destructive: true },
            ),
        });

        if (!confirmed || !isCurrent()) {
            return;
        }
        try {
            await auth.switchServer(inputUrl);
        } catch {
            if (isCurrent()) {
                setError(t('errors.operationFailed'));
            }
        }
    };

    const handleReset = async () => {
        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        if (!isCurrent()) {
            return;
        }
        const confirmed = await runSessionActionRequest({
            isCurrent,
            request: () => Modal.confirm(
                t('server.resetToDefault'),
                t('server.resetServerDefault'),
                { confirmText: t('common.reset'), destructive: true },
            ),
        });

        if (!confirmed || !isCurrent()) {
            return;
        }
        try {
            await auth.switchServer(null);
        } catch {
            if (isCurrent()) {
                setError(t('errors.operationFailed'));
            }
        }
    };

    return (
        <>
            <Stack.Screen
                options={{
                    headerShown: true,
                    headerTitle: t('server.serverConfiguration'),
                    headerBackTitle: t('common.back'),
                }}
            />

            <KeyboardAvoidingView 
                role="main"
                style={styles.keyboardAvoidingView}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ItemList style={styles.itemListContainer}>
                    <ItemGroup footer={t('server.advancedFeatureFooter')}>
                        <View style={styles.contentContainer}>
                            <Text style={styles.labelText}>{t('server.customServerUrlLabel').toUpperCase()}</Text>
                            <TextInput
                                style={[
                                    styles.textInput,
                                    isValidating && styles.textInputValidating
                                ]}
                                value={inputUrl}
                                onChangeText={(text) => {
                                    setInputUrl(text);
                                    setError(null);
                                }}
                                placeholder={t('common.urlPlaceholder')}
                                placeholderTextColor={theme.colors.input.placeholder}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="url"
                                editable={!isValidating}
                            />
                            {error && (
                                <Text style={styles.errorText}>
                                    {error}
                                </Text>
                            )}
                            {isValidating && (
                                <Text style={styles.validatingText}>
                                    {t('server.validatingServer')}
                                </Text>
                            )}
                            <View style={styles.buttonRow}>
                                <View style={styles.buttonWrapper}>
                                    <RoundButton
                                        title={t('server.resetToDefault')}
                                        size="normal"
                                        display="inverted"
                                        action={handleReset}
                                    />
                                </View>
                                <View style={styles.buttonWrapper}>
                                    <RoundButton
                                        title={isValidating ? t('server.validating') : t('common.save')}
                                        size="normal"
                                        action={handleSave}
                                        disabled={isValidating}
                                    />
                                </View>
                            </View>
                            {serverInfo.isCustom && (
                                <Text style={styles.statusText}>
                                    {t('server.currentlyUsingCustomServer')}
                                </Text>
                            )}
                        </View>
                    </ItemGroup>

                    </ItemList>
            </KeyboardAvoidingView>
        </>
    );
}
