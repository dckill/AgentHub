import React from 'react';
import { View, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { useArtifact } from '@/sync/storage';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { StyleSheet } from 'react-native-unistyles';
import { getCurrentLanguage, t } from '@/text';
import { layout } from '@/components/layout';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal } from '@/modal';
import { sync } from '@/sync/sync';
import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';
import { deleteArtifact } from '@/sync/apiArtifacts';
import { storage } from '@/sync/storage';
import { MarkdownView } from '@/components/markdown/MarkdownView';
import { GlassButton } from '@/components/glass';

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
    errorIcon: {
        marginBottom: 16,
        color: theme.colors.textDestructive,
    },
    errorText: {
        fontSize: 16,
        color: theme.colors.text,
        textAlign: 'center',
        marginBottom: 16,
    },
    titleContainer: {
        marginBottom: 24,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: theme.colors.text,
        marginBottom: 8,
    },
    untitledTitle: {
        color: theme.colors.textSecondary,
        fontStyle: 'italic',
    },
    meta: {
        fontSize: 13,
        color: theme.colors.textSecondary,
    },
    bodyContainer: {
        minHeight: 200,
    },
    emptyBody: {
        fontSize: 15,
        color: theme.colors.textSecondary,
        fontStyle: 'italic',
        lineHeight: 22,
    },
    headerActions: {
        flexDirection: 'row',
        gap: 4,
    },
    headerAction: {
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    screenReaderHeading: {
        position: 'absolute',
        width: 1,
        height: 1,
        overflow: 'hidden',
        opacity: 0,
    },
}));

export default function ArtifactDetailScreen() {
    const styles = stylesheet;
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const artifact = useArtifact(id);
    const [isLoading, setIsLoading] = React.useState(artifact?.body === undefined);
    const [isDeleting, setIsDeleting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [loadAttempt, setLoadAttempt] = React.useState(0);

    // Load full artifact with body if not already loaded
    React.useEffect(() => {
        if (!artifact) {
            setError(null);
            setIsLoading(false);
            return;
        }
        if (artifact.body !== undefined) {
            setError(null);
            setIsLoading(false);
            return;
        }
        
        const generation = sync.getAccountGeneration();
        if (generation === null) {
            setError(t('artifacts.error'));
            setIsLoading(false);
            return;
        }
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        let cancelled = false;
        
        (async () => {
            try {
                setIsLoading(true);
                setError(null);
                
                const credentials = sync.getCredentials();
                if (!credentials) {
                    throw new Error('Not authenticated');
                }
                
                // Fetch full artifact with body
                const fullArtifact = await sync.fetchArtifactWithBody(id);
                if (!cancelled && isCurrent()) {
                    storage.getState().updateArtifact(fullArtifact);
                }
            } catch (err) {
                if (!cancelled && isCurrent()) {
                    console.error('Failed to load artifact:', err);
                    setError(t('artifacts.error'));
                }
            } finally {
                if (!cancelled && isCurrent()) {
                    setIsLoading(false);
                }
            }
        })();
        
        return () => {
            cancelled = true;
        };
    }, [id, artifact?.id, artifact?.body, loadAttempt]);

    const handleRetry = React.useCallback(() => {
        setError(null);
        setIsLoading(true);
        setLoadAttempt((attempt) => attempt + 1);
    }, []);

    const handleEdit = React.useCallback(() => {
        router.push(`/artifacts/edit/${id}`);
    }, [id, router]);

    const handleDelete = React.useCallback(async () => {
        const generation = sync.getAccountGeneration();
        if (generation === null) return;
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        const confirmed = await Modal.confirm(
            t('artifacts.deleteConfirm'),
            t('artifacts.deleteConfirmDescription'),
            {
                confirmText: t('artifacts.delete'),
                destructive: true,
            }
        );

        if (!confirmed || !isCurrent()) return;

        try {
            setIsDeleting(true);
            
            const credentials = sync.getCredentials();
            if (!credentials) {
                throw new Error('Not authenticated');
            }

            const deleted = await runSessionActionRequest({
                isCurrent,
                request: () => deleteArtifact(credentials, id),
            });
            if (deleted === null || !isCurrent()) return;
            storage.getState().deleteArtifact(id);
            
            // Navigate back
            if (isCurrent()) router.back();
        } catch (err) {
            if (isCurrent()) {
                console.error('Failed to delete artifact:', err);
                Modal.alert(
                    t('common.error'),
                    t('artifacts.deleteError')
                );
            }
        } finally {
            if (isCurrent()) setIsDeleting(false);
        }
    }, [id, router]);

    // Format date
    const formattedDate = React.useMemo(() => {
        if (!artifact) return '';
        return new Date(artifact.updatedAt).toLocaleDateString(getCurrentLanguage(), {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }, [artifact]);

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

    if (error || !artifact) {
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
                        <Ionicons 
                            name="alert-circle-outline" 
                            size={64} 
                            style={styles.errorIcon}
                        />
                        <Text style={styles.errorText}>
                            {error || t('artifacts.error')}
                        </Text>
                        {error && (
                            <GlassButton
                                title={t('common.retry')}
                                variant="primary"
                                onPress={handleRetry}
                            />
                        )}
                </View>
            </View>
        );
    }

    return (
        <>
            <Stack.Screen 
                options={{
                    headerShown: true,
                    headerTitle: artifact.title || t('artifacts.untitled'),
                    headerRight: () => (
                        <View style={styles.headerActions}>
                            <Pressable
                                onPress={handleEdit}
                                style={styles.headerAction}
                                disabled={isDeleting}
                                accessibilityRole="button"
                                accessibilityLabel={t('artifacts.edit')}
                                accessibilityState={{ disabled: isDeleting }}
                            >
                                <Ionicons name="create-outline" size={22} color={styles.title.color} />
                            </Pressable>
                            <Pressable
                                onPress={handleDelete}
                                style={styles.headerAction}
                                disabled={isDeleting}
                                accessibilityRole="button"
                                accessibilityLabel={t('artifacts.delete')}
                                accessibilityState={{ disabled: isDeleting, busy: isDeleting }}
                            >
                                <Ionicons 
                                    name="trash-outline" 
                                    size={22} 
                                    color={isDeleting ? styles.meta.color : styles.errorIcon.color} 
                                />
                            </Pressable>
                        </View>
                    ),
                }}
            />
            <View role="main" style={styles.container}>
                <ScrollView 
                    style={styles.scrollView}
                    contentContainerStyle={[
                        styles.contentContainer,
                        { maxWidth: layout.maxWidth, alignSelf: 'center', width: '100%' }
                    ]}
                >
                    <View style={styles.titleContainer}>
                        <Text 
                            role="heading"
                            aria-level={1}
                            style={[
                                styles.title,
                                !artifact.title && styles.untitledTitle
                            ]}
                        >
                            {artifact.title || t('artifacts.untitled')}
                        </Text>
                        <Text style={styles.meta}>
                            {formattedDate}
                        </Text>
                    </View>

                    <View style={styles.bodyContainer}>
                        {artifact.body ? (
                            <MarkdownView markdown={artifact.body} />
                        ) : (
                            <Text style={styles.emptyBody}>
                                {t('artifacts.noContent')}
                            </Text>
                        )}
                    </View>
                </ScrollView>
            </View>
        </>
    );
}
