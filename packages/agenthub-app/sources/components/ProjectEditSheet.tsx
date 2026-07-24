import * as React from 'react';
import { View, Text, TextInput, Pressable, Platform, KeyboardAvoidingView, Modal as RNModal } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { ProjectIconPicker } from '@/components/ProjectIconPicker';
import { t } from '@/text';
import { ProjectIcon } from '@/components/ProjectIcon';
import { Typography } from '@/constants/Typography';
import { LinearGradient } from 'expo-linear-gradient';
import { getAmberRaisedButtonVisuals } from './amberVisuals';

interface ProjectEditSheetProps {
    visible: boolean;
    onClose: () => void;
    projectKey: string;
    initialName: string;
    initialIcon: string;
    onSave: (projectKey: string, name: string, icon: string) => void;
}

export const ProjectEditSheet = React.memo(({ visible, onClose, projectKey, initialName, initialIcon, onSave }: ProjectEditSheetProps) => {
    const { theme } = useUnistyles();
    const amberVisuals = getAmberRaisedButtonVisuals(theme);
    const [name, setName] = React.useState(initialName);
    const [icon, setIcon] = React.useState(initialIcon);
    const nameInputRef = React.useRef<TextInput>(null);

    // Reset state when props change
    React.useEffect(() => {
        if (visible) {
            setName(initialName);
            setIcon(initialIcon);
        }
    }, [visible, initialName, initialIcon]);

    const handleSave = React.useCallback(() => {
        const trimmedName = name.trim();
        onSave(projectKey, trimmedName || initialName, icon);
        onClose();
    }, [name, icon, projectKey, initialName, onSave, onClose]);

    const handleIconSelect = React.useCallback((selected: string) => {
        setIcon(selected);
    }, []);

    return (
        <RNModal
            animationType="fade"
            onRequestClose={onClose}
            transparent
            visible={visible}
        >
            <View style={styles.backdrop}>
                <Pressable
                    accessibilityLabel={t('project.dismissEditorAccessibility')}
                    accessibilityRole="button"
                    style={styles.backdropDismiss}
                    onPress={onClose}
                />
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.keyboardContainer}
                >
                    <View
                        accessibilityLabel={t('project.editTitle')}
                        accessibilityViewIsModal
                        aria-modal
                        role="dialog"
                        style={styles.sheet}
                    >
                        <LinearGradient
                            pointerEvents="none"
                            colors={theme.dark
                                ? ['rgba(255, 190, 74, 0.12)', 'rgba(31, 39, 44, 0.82)', 'rgba(16, 20, 22, 0.96)']
                                : ['rgba(255, 248, 230, 0.94)', theme.colors.surfaceRaised, theme.colors.canvasElevated]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                        <View style={styles.content}>
                            {/* Header */}
                            <View style={styles.header}>
                                <View style={styles.headerCopy}>
                                    <Text style={styles.title}>{t('project.editTitle')}</Text>
                                    <Text style={styles.subtitle}>{t('project.editSubtitle')}</Text>
                                </View>
                                <Pressable
                                    accessibilityLabel={t('common.cancel')}
                                    accessibilityRole="button"
                                    onPress={onClose}
                                    hitSlop={12}
                                    style={styles.closeButton}
                                >
                                    <Text style={styles.closeButtonText}>{t('common.cancel')}</Text>
                                </Pressable>
                            </View>

                            {/* Current icon + name input */}
                            <View style={styles.editRow}>
                                <View style={styles.iconPreview}>
                                    <ProjectIcon icon={icon} size={60} />
                                </View>
                                <View style={styles.nameInputContainer}>
                                    <Text style={styles.fieldLabel}>{t('project.nameLabel')}</Text>
                                    <TextInput
                                        accessibilityLabel={t('project.nameLabel')}
                                        ref={nameInputRef}
                                        style={styles.nameInput}
                                        value={name}
                                        onChangeText={setName}
                                        placeholder={initialName}
                                        placeholderTextColor={theme.colors.textSecondary}
                                        maxLength={64}
                                        returnKeyType="done"
                                        autoFocus
                                    />
                                    <Text style={styles.fieldHint} numberOfLines={2}>{t('project.nameHint')}</Text>
                                </View>
                            </View>

                            {/* Icon picker */}
                            <View style={styles.pickerSection}>
                                <View style={styles.sectionHeader}>
                                    <Text style={styles.pickerLabel}>{t('project.chooseIcon')}</Text>
                                    <Text style={styles.sectionHint}>{t('project.iconHint')}</Text>
                                </View>
                                <View style={styles.pickerBox}>
                                    <ProjectIconPicker
                                        selectedIcon={icon}
                                        onSelect={handleIconSelect}
                                        iconSize={32}
                                    />
                                </View>
                            </View>

                            {/* Save button */}
                            <Pressable
                                accessibilityLabel={t('common.save')}
                                accessibilityRole="button"
                                style={styles.saveButton}
                                onPress={handleSave}
                            >
                                <LinearGradient
                                    pointerEvents="none"
                                    colors={amberVisuals.colors}
                                    start={{ x: 0.14, y: 0 }}
                                    end={{ x: 0.92, y: 1 }}
                                    style={StyleSheet.absoluteFill}
                                />
                                <View style={[styles.saveButtonHighlight, { backgroundColor: amberVisuals.highlightColor }]} />
                                <Text style={styles.saveButtonText}>{t('common.save')}</Text>
                            </Pressable>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </RNModal>
    );
});

const styles = StyleSheet.create((theme) => ({
    backdrop: {
        flex: 1,
        backgroundColor: theme.dark ? 'rgba(0,0,0,0.68)' : 'rgba(25,28,31,0.34)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    backdropDismiss: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    keyboardContainer: {
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
    },
    sheet: {
        backgroundColor: theme.colors.surfaceRaised,
        borderRadius: 18,
        width: '100%',
        maxWidth: 480,
        height: '86%',
        maxHeight: 720,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: theme.colors.glass.borderStrong,
        shadowColor: theme.colors.glass.shadow,
        shadowOpacity: theme.dark ? 0.56 : 0.24,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: 18 },
        elevation: 20,
    },
    content: {
        flex: 1,
        padding: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 18,
        paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.borderStrong,
    },
    headerCopy: {
        flex: 1,
        minWidth: 0,
        paddingRight: 12,
    },
    title: {
        fontSize: 21,
        lineHeight: 27,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    subtitle: {
        marginTop: 3,
        fontSize: 13,
        lineHeight: 18,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    closeButton: {
        minWidth: 58,
        height: 44,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.glass.background,
    },
    closeButtonText: {
        fontSize: 16,
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
    },
    editRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 20,
        backgroundColor: theme.colors.glass.background,
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: theme.colors.glass.border,
    },
    iconPreview: {
        width: 76,
        height: 76,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceHigh,
        borderWidth: 1,
        borderColor: theme.colors.borderStrong,
    },
    nameInputContainer: {
        flex: 1,
        minWidth: 0,
    },
    fieldLabel: {
        fontSize: 12,
        lineHeight: 16,
        color: theme.colors.textSecondary,
        marginBottom: 6,
        ...Typography.default('semiBold'),
    },
    nameInput: {
        fontSize: 18,
        lineHeight: 24,
        color: theme.colors.text,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 10,
        backgroundColor: theme.colors.input.background,
        borderWidth: 1,
        borderColor: theme.colors.border,
        ...Typography.default('semiBold'),
    },
    fieldHint: {
        marginTop: 6,
        fontSize: 11,
        lineHeight: 15,
        color: theme.colors.textMuted,
        ...Typography.default(),
    },
    pickerSection: {
        flex: 1,
        minHeight: 180,
        marginBottom: 16,
    },
    pickerLabel: {
        fontSize: 14,
        lineHeight: 18,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    sectionHeader: {
        marginBottom: 10,
    },
    sectionHint: {
        marginTop: 2,
        fontSize: 12,
        lineHeight: 16,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    pickerBox: {
        flex: 1,
        borderWidth: 1,
        borderColor: theme.colors.glass.border,
        borderRadius: 16,
        backgroundColor: theme.colors.glass.background,
        overflow: 'hidden',
    },
    saveButton: {
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: theme.colors.borderStrong,
        shadowColor: theme.colors.accentGlow,
        shadowOpacity: theme.dark ? 0.34 : 0.20,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 7 },
        elevation: 4,
    },
    saveButtonHighlight: {
        position: 'absolute',
        top: 2,
        left: 28,
        right: 28,
        height: 7,
        borderRadius: 7,
    },
    saveButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
}));
