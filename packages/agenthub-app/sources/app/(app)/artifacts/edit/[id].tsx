import React from 'react';
import { View, ScrollView, TextInput, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Text } from '@/components/StyledText';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { layout } from '@/components/layout';
import { Modal } from '@/modal';
import { sync } from '@/sync/sync';
import { storage, useArtifact } from '@/sync/storage';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { GlassButton } from '@/components/glass';

type ArtifactEditBaseline = {
    title: string | null;
    body: string | null;
};

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    scrollView: {
        flex: 1,
    },
    contentContainer: {
        padding: 16,
        paddingBottom: 100,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    errorContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
    },
    errorText: {
        fontSize: 16,
        color: theme.colors.text,
        textAlign: 'center',
        marginBottom: 16,
    },
    inputGroup: {
        marginBottom: 24,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.textSecondary,
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    input: {
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        color: theme.colors.text,
        borderWidth: 1,
        borderColor: theme.colors.divider,
    } as any,
    inputFocused: {
        borderColor: theme.colors.button.primary.background,
    },
    textArea: {
        minHeight: 200,
        textAlignVertical: 'top',
        paddingTop: 14,
        lineHeight: 22,
    },
    headerButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        minHeight: 44,
        justifyContent: 'center',
    },
    headerButtonText: {
        fontSize: 17,
        fontWeight: '600',
        color: theme.colors.header.tint,
    },
    headerButtonDisabled: {
        opacity: 0.5,
    },
    screenReaderHeading: {
        position: 'absolute',
        width: 1,
        height: 1,
        overflow: 'hidden',
        opacity: 0,
    },
}));

export default function EditArtifactScreen() {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const artifact = useArtifact(id);
    
    const [title, setTitle] = React.useState('');
    const [body, setBody] = React.useState('');
    const [isSaving, setIsSaving] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState<string | null>(null);
    const [loadAttempt, setLoadAttempt] = React.useState(0);
    const [baseline, setBaseline] = React.useState<ArtifactEditBaseline | null>(null);
    const [hasChanges, setHasChanges] = React.useState(false);
    const [titleFocused, setTitleFocused] = React.useState(false);
    const [bodyFocused, setBodyFocused] = React.useState(false);
    
    // Load full artifact with body if needed
    React.useEffect(() => {
        if (!artifact) {
            setLoadError(null);
            setIsLoading(false);
            return;
        }
        
        let cancelled = false;
        
        (async () => {
            try {
                setIsLoading(true);
                setLoadError(null);
                // If body is not loaded, fetch it
                if (artifact.body === undefined) {
                    const fullArtifact = await sync.fetchArtifactWithBody(id);
                    if (!cancelled) {
                        storage.getState().updateArtifact(fullArtifact);
                        setTitle(fullArtifact.title || '');
                        setBody(fullArtifact.body || '');
                        setBaseline({ title: fullArtifact.title ?? null, body: fullArtifact.body ?? null });
                    }
                } else {
                    setTitle(artifact.title || '');
                    setBody(artifact.body || '');
                    setBaseline({ title: artifact.title, body: artifact.body ?? null });
                }
            } catch (err) {
                if (!cancelled) {
                    console.error('Failed to load artifact for editing:', err);
                    setLoadError(t('artifacts.error'));
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        })();
        
        return () => {
            cancelled = true;
        };
    }, [id, artifact?.id, artifact?.body, loadAttempt]);
    
    // Track changes
    React.useEffect(() => {
        if (baseline) {
            const titleChanged = (title || null) !== baseline.title;
            const bodyChanged = (body || null) !== baseline.body;
            setHasChanges(titleChanged || bodyChanged);
        } else {
            setHasChanges(false);
        }
    }, [title, body, baseline]);

    const handleRetry = React.useCallback(() => {
        setLoadError(null);
        setIsLoading(true);
        setLoadAttempt((attempt) => attempt + 1);
    }, []);
    
    const handleSave = React.useCallback(async () => {
        if (isSaving || !hasChanges) return;
        
        // At least one field should have content
        if (!title.trim() && !body.trim()) {
            await Modal.alert(
                t('common.error'),
                t('artifacts.emptyFieldsError')
            );
            return;
        }
        
        try {
            setIsSaving(true);
            
            // Update the artifact
            await sync.updateArtifact(
                id,
                title.trim() || null,
                body.trim() || null
            );
            
            // Navigate back
            router.back();
        } catch (err) {
            console.error('Failed to update artifact:', err);
            await Modal.alert(
                t('common.error'),
                t('artifacts.updateError')
            );
            setIsSaving(false);
        }
    }, [id, title, body, hasChanges, isSaving, router]);
    
    const HeaderRight = React.useCallback(() => (
        <Pressable
            style={[styles.headerButton, (!hasChanges || isSaving) && styles.headerButtonDisabled]}
            onPress={handleSave}
            disabled={!hasChanges || isSaving}
            accessibilityRole="button"
            accessibilityLabel={t('common.save')}
            accessibilityState={{ disabled: !hasChanges || isSaving, busy: isSaving }}
        >
            {isSaving ? (
                <ActivityIndicator size="small" color={theme.colors.header.tint} />
            ) : (
                <Text style={styles.headerButtonText}>
                    {t('common.save')}
                </Text>
            )}
        </Pressable>
    ), [handleSave, hasChanges, isSaving, styles]);
    
    const KeyboardWrapper = Platform.select({
        ios: KeyboardAvoidingView,
        default: React.Fragment,
    });
    
    const keyboardProps = Platform.select({
        ios: {
            behavior: 'padding' as const,
            keyboardVerticalOffset: 0,
        },
        default: {},
    });
    
    if (isLoading) {
        return (
            <View role="main" style={styles.container}>
                <Text role="heading" aria-level={1} style={styles.screenReaderHeading}>
                    {t('artifacts.loading')}
                </Text>
                <Stack.Screen 
                    options={{
                        headerShown: true,
                        headerTitle: t('artifacts.loading'),
                    }}
                />
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" />
                </View>
            </View>
        );
    }

    if (loadError) {
        return (
            <View role="main" style={styles.container}>
                <Text role="heading" aria-level={1} style={styles.screenReaderHeading}>
                    {t('common.error')}
                </Text>
                <Stack.Screen
                    options={{
                        headerShown: true,
                        headerTitle: t('common.error'),
                    }}
                />
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{loadError}</Text>
                    <GlassButton
                        title={t('common.retry')}
                        variant="primary"
                        onPress={handleRetry}
                    />
                </View>
            </View>
        );
    }
    
    if (!artifact) {
        return (
            <View role="main" style={styles.container}>
                <Text role="heading" aria-level={1} style={styles.screenReaderHeading}>
                    {t('artifacts.notFound')}
                </Text>
                <Stack.Screen 
                    options={{
                        headerShown: true,
                        headerTitle: t('common.error'),
                    }}
                />
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>
                        {t('artifacts.notFound')}
                    </Text>
                </View>
            </View>
        );
    }
    
    return (
        <>
            <Stack.Screen 
                options={{
                    headerShown: true,
                    headerTitle: t('artifacts.edit'),
                    headerRight: HeaderRight,
                }}
            />
            <View role="main" style={styles.container}>
                <Text role="heading" aria-level={1} style={styles.screenReaderHeading}>
                    {t('artifacts.edit')}
                </Text>
                <KeyboardWrapper {...keyboardProps}>
                    <ScrollView 
                        style={styles.scrollView}
                        contentContainerStyle={[
                            styles.contentContainer,
                            { maxWidth: layout.maxWidth, alignSelf: 'center', width: '100%' }
                        ]}
                        keyboardShouldPersistTaps="handled"
                    >
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>{t('artifacts.titleLabel')}</Text>
                            <TextInput
                                style={[
                                    styles.input,
                                    titleFocused && styles.inputFocused,
                                    Platform.OS === 'web' && { 
                                        outlineStyle: 'none',
                                        outline: 'none',
                                        outlineWidth: 0,
                                        outlineColor: 'transparent'
                                    } as any
                                ]}
                                value={title}
                                accessibilityLabel={t('artifacts.titleLabel')}
                                onChangeText={setTitle}
                                placeholder={t('artifacts.titlePlaceholder')}
                                placeholderTextColor={theme.colors.input.placeholder}
                                onFocus={() => setTitleFocused(true)}
                                onBlur={() => setTitleFocused(false)}
                                editable={!isSaving}
                                returnKeyType="next"
                                autoCapitalize="sentences"
                            />
                        </View>
                        
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>{t('artifacts.bodyLabel')}</Text>
                            <TextInput
                                style={[
                                    styles.input,
                                    styles.textArea,
                                    bodyFocused && styles.inputFocused,
                                    Platform.OS === 'web' && { 
                                        outlineStyle: 'none',
                                        outline: 'none',
                                        outlineWidth: 0,
                                        outlineColor: 'transparent'
                                    } as any
                                ]}
                                value={body}
                                accessibilityLabel={t('artifacts.bodyLabel')}
                                onChangeText={setBody}
                                placeholder={t('artifacts.bodyPlaceholder')}
                                placeholderTextColor={theme.colors.input.placeholder}
                                onFocus={() => setBodyFocused(true)}
                                onBlur={() => setBodyFocused(false)}
                                editable={!isSaving}
                                multiline
                                numberOfLines={10}
                                autoCapitalize="sentences"
                            />
                        </View>
                    </ScrollView>
                </KeyboardWrapper>
            </View>
        </>
    );
}
