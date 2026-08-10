import React from 'react';
import { View, ScrollView, TextInput, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Text } from '@/components/StyledText';
import { useRouter, Stack } from 'expo-router';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { layout } from '@/components/layout';
import { Modal } from '@/modal';
import { sync } from '@/sync/sync';
import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

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

export default function NewArtifactScreen() {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const router = useRouter();
    const [title, setTitle] = React.useState('');
    const [body, setBody] = React.useState('');
    const [isSaving, setIsSaving] = React.useState(false);
    const [titleFocused, setTitleFocused] = React.useState(false);
    const [bodyFocused, setBodyFocused] = React.useState(false);
    
    const handleSave = React.useCallback(async () => {
        if (isSaving) return;
        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        if (!isCurrent()) return;
        
        // At least one field should have content
        if (!title.trim() && !body.trim()) {
            if (isCurrent()) {
                await Modal.alert(
                    t('common.error'),
                    t('artifacts.emptyFieldsError')
                );
            }
            return;
        }
        
        setIsSaving(true);
        try {
            // Create the artifact
            const artifactId = await runSessionActionRequest({
                isCurrent,
                request: () => sync.createArtifact(
                    title.trim() || null,
                    body.trim() || null
                ),
            });
            if (!isCurrent() || !artifactId) return;
            
            // Navigate to the new artifact
            router.replace(`/artifacts/${artifactId}`);
        } catch (err) {
            console.error('Failed to create artifact:', err);
            if (isCurrent()) {
                await Modal.alert(
                    t('common.error'),
                    t('artifacts.createError')
                );
                setIsSaving(false);
            }
        } finally {
            if (isCurrent()) setIsSaving(false);
        }
    }, [title, body, isSaving, router]);
    
    const HeaderRight = React.useCallback(() => (
        <Pressable
            style={[styles.headerButton, isSaving && styles.headerButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel={t('common.save')}
            accessibilityState={{ disabled: isSaving, busy: isSaving }}
        >
            {isSaving ? (
                <ActivityIndicator size="small" color={theme.colors.header.tint} />
            ) : (
                <Text style={styles.headerButtonText}>
                    {t('common.save')}
                </Text>
            )}
        </Pressable>
    ), [handleSave, isSaving, styles]);
    
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
    
    return (
        <>
            <Stack.Screen 
                options={{
                    headerShown: true,
                    headerTitle: t('artifacts.new'),
                    headerRight: HeaderRight,
                }}
            />
            <View role="main" style={styles.container}>
                <Text role="heading" aria-level={1} style={styles.screenReaderHeading}>
                    {t('artifacts.new')}
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
