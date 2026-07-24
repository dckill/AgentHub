import React from 'react';
import {
    View,
    Text,
    Platform,
    Pressable,
    TextInput,
    ScrollView,
    Keyboard,
    useWindowDimensions,
    type NativeSyntheticEvent,
    type TextInputSelectionChangeEventData,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Typography } from '@/constants/Typography';
import { useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { FolderBrowser } from '@/components/FolderBrowser';
import { getFolderBrowserRecommendedPaths } from '@/components/folderBrowserPath';
import { FolderIcon } from '@/components/FolderIcon';
import { resolveAbsolutePath } from '@/utils/pathUtils';
import { formatPathRelativeToHome } from '@/utils/sessionUtils';

export type PickerItem = { key: string; label: string; subtitle?: string; dimmed?: boolean };

export function trimPathInput(path: string | null | undefined): string {
    return path?.trim() ?? '';
}

export function trimTrailingPathSeparator(path: string): string {
    if (path === '/' || /^[A-Za-z]:[\\/]?$/.test(path)) {
        return path;
    }
    return path.replace(/[\\/]+$/, '');
}

export function normalizePathForComparison(path: string | null | undefined, homeDir?: string): string | null {
    const trimmed = trimPathInput(path);
    if (!trimmed) {
        return null;
    }
    return trimTrailingPathSeparator(resolveAbsolutePath(trimmed, homeDir));
}

const pickerStyles = {
    container: {
        paddingHorizontal: 16,
        paddingBottom: 8,
        flex: 1,
        minHeight: 0,
    } as const,
    titleRow: {
        flexDirection: 'row' as const,
        flexWrap: 'wrap' as const,
        alignItems: 'center' as const,
        justifyContent: 'space-between' as const,
    },
    title: {
        flexGrow: 1,
        flexShrink: 1,
        minWidth: 120,
        fontSize: 18,
        paddingVertical: 12,
        paddingHorizontal: 4,
        ...Typography.default('semiBold'),
        ...Platform.select({ web: { userSelect: 'none' } as any, default: {} }),
    } as const,
    titleActions: {
        flexDirection: 'row' as const,
        flexWrap: 'wrap' as const,
        alignItems: 'center' as const,
        justifyContent: 'flex-end' as const,
        gap: 8,
    },
    modeToggle: {
        flexDirection: 'row' as const,
        borderRadius: 10,
        padding: 2,
        gap: 2,
    },
    modeButton: {
        width: 44,
        height: 44,
        borderRadius: 8,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    doneButtonPressable: {
        minWidth: 64,
        minHeight: 44,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    doneButtonGlass: {
        minWidth: 60,
        minHeight: 44,
        borderRadius: 12,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        flexDirection: 'row' as const,
        gap: 4,
        borderWidth: 1,
        paddingHorizontal: 10,
    },
    cancelButton: {
        minWidth: 58,
        minHeight: 44,
        borderRadius: 12,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        paddingHorizontal: 10,
        borderWidth: 1,
    },
    doneButtonText: {
        fontSize: 14,
        fontWeight: '600' as const,
        ...Typography.default('semiBold'),
        ...Platform.select({ web: { userSelect: 'none' } as any, default: {} }),
    },
    pathInputRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: 10,
        paddingHorizontal: 12,
        minHeight: 46,
        borderRadius: 12,
        marginBottom: 8,
        borderWidth: 1,
    },
    pathInputField: {
        flex: 1,
    } as const,
    pathTextInput: {
        fontSize: 16,
        minHeight: 44,
        paddingVertical: 0,
        ...Typography.default(),
        ...Platform.select({
            android: { textAlignVertical: 'center' as const },
            web: { outlineStyle: 'none' } as any,
            default: {},
        }),
    } as const,
    pathMetaText: {
        fontSize: 13,
        paddingHorizontal: 4,
        paddingBottom: 8,
        ...Typography.default(),
        ...Platform.select({ web: { userSelect: 'none' } as any, default: {} }),
    } as const,
    sectionLabel: {
        fontSize: 13,
        paddingHorizontal: 4,
        paddingBottom: 8,
        ...Typography.default('semiBold'),
        ...Platform.select({ web: { userSelect: 'none' } as any, default: {} }),
    } as const,
    option: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: 12,
    },
    optionPressed: {
        opacity: 0.6,
    } as const,
    optionText: {
        fontSize: 15,
        ...Typography.default(),
        ...Platform.select({ web: { userSelect: 'none' } as any, default: {} }),
    } as const,
    optionList: {
        flexGrow: 0,
        flexShrink: 1,
    } as const,
    emptyText: {
        fontSize: 14,
        textAlign: 'center' as const,
        paddingVertical: 20,
        ...Typography.default(),
        ...Platform.select({ web: { userSelect: 'none' } as any, default: {} }),
    } as const,
    offlineHint: {
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        paddingVertical: 32,
        paddingHorizontal: 16,
        borderRadius: 12,
        gap: 8,
    },
    offlineHintText: {
        fontSize: 14,
        textAlign: 'center' as const,
        ...Typography.default(),
    } as const,
    offlineManualButton: {
        minHeight: 44,
        marginTop: 4,
        paddingHorizontal: 12,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
};

export interface PathPickerContentProps {
    title: string;
    items: PickerItem[];
    value: string | null;
    homeDir?: string;
    onChangeValue: (value: string) => void;
    onDone?: () => void;
    machineId?: string;
    isOnline?: boolean;
    recentPaths?: string[];
    showDoneButton?: boolean;
}

export const PathPickerContent = React.memo(function PathPickerContent({
    title,
    items,
    value,
    homeDir,
    onChangeValue,
    onDone,
    machineId,
    isOnline,
    recentPaths,
    showDoneButton,
}: PathPickerContentProps) {
    const { theme } = useUnistyles();
    const { width: viewportWidth } = useWindowDimensions();
    const compactHeader = viewportWidth < 480;
    const [mode, setMode] = React.useState<'browse' | 'text'>('browse');
    const inputRef = React.useRef<TextInput>(null);
    const currentValue = value ?? '';
    const [selection, setSelection] = React.useState<{ start: number; end: number } | undefined>(undefined);

    React.useEffect(() => {
        if (mode === 'text') {
            const timeout = setTimeout(() => {
                inputRef.current?.focus();
            }, 50);
            return () => clearTimeout(timeout);
        }
    }, [mode]);

    const matchedItemKey = React.useMemo(() => {
        const normalizedValue = normalizePathForComparison(currentValue, homeDir);
        if (!normalizedValue) {
            return null;
        }

        const match = items.find((item) =>
            normalizePathForComparison(item.key, homeDir) === normalizedValue,
        );

        return match?.key ?? null;
    }, [currentValue, homeDir, items]);

    const handleSuggestionPress = React.useCallback((item: PickerItem) => {
        const nextValue = item.label;
        const nextSelection = { start: nextValue.length, end: nextValue.length };

        onChangeValue(nextValue);
        setSelection(nextSelection);

        setTimeout(() => {
            inputRef.current?.focus();
        }, 0);
    }, [onChangeValue]);

    const isCustomPath = currentValue.trim().length > 0 && matchedItemKey === null;
    const handleSelectionChange = React.useCallback((event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
        setSelection(event.nativeEvent.selection);
    }, []);
    const canBrowse = isOnline && !!machineId;
    const browsePathRef = React.useRef<string | null>(null);
    const browserRecommendedPaths = React.useMemo(
        () => getFolderBrowserRecommendedPaths(homeDir, recentPaths),
        [homeDir, recentPaths],
    );
    const handleBrowseSelect = React.useCallback((path: string) => {
        const display = homeDir ? formatPathRelativeToHome(path, homeDir) : path;
        onChangeValue(display);
        onDone?.();
    }, [homeDir, onChangeValue, onDone]);
    const handleBrowsePathChange = React.useCallback((path: string) => {
        browsePathRef.current = path;
    }, []);
    const handleDonePress = React.useCallback(() => {
        if (mode === 'browse' && browsePathRef.current) {
            const display = homeDir ? formatPathRelativeToHome(browsePathRef.current, homeDir) : browsePathRef.current;
            onChangeValue(display);
        }
        onDone?.();
    }, [homeDir, mode, onChangeValue, onDone]);
    const handleCancelPress = React.useCallback(() => {
        Keyboard.dismiss();
        onDone?.();
    }, [onDone]);

    return (
        <View style={pickerStyles.container}>
            <View style={pickerStyles.titleRow}>
                <Text style={[pickerStyles.title, { color: theme.colors.text }, compactHeader && { width: '100%' }]}>{title}</Text>
                <View style={[pickerStyles.titleActions, compactHeader && { width: '100%', gap: 4 }]}>
                    <View style={[pickerStyles.modeToggle, { backgroundColor: theme.colors.input.background }]}>
                        <Pressable
                            onPress={() => setMode('browse')}
                            accessibilityRole="button"
                            accessibilityLabel={t('newSession.browseFolders')}
                            style={({ pressed }) => [
                                pickerStyles.modeButton,
                                mode === 'browse' && { backgroundColor: theme.colors.button.primary.background },
                                pressed && { opacity: 0.8 },
                            ]}
                            hitSlop={4}
                        >
                            <Ionicons
                                name="folder-outline"
                                size={15}
                                color={mode === 'browse' ? theme.colors.button.primary.tint : theme.colors.textSecondary}
                            />
                        </Pressable>
                        <Pressable
                            onPress={() => setMode('text')}
                            accessibilityRole="button"
                            accessibilityLabel={t('newSession.switchToTextInput')}
                            style={({ pressed }) => [
                                pickerStyles.modeButton,
                                mode === 'text' && { backgroundColor: theme.colors.button.primary.background },
                                pressed && { opacity: 0.8 },
                            ]}
                            hitSlop={4}
                        >
                            <Ionicons
                                name="keypad-outline"
                                size={15}
                                color={mode === 'text' ? theme.colors.button.primary.tint : theme.colors.textSecondary}
                            />
                        </Pressable>
                    </View>
                    {(showDoneButton ?? Platform.OS !== 'web') && onDone && (
                        <>
                        <Pressable
                            onPress={handleCancelPress}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={({ pressed }) => [
                                pickerStyles.cancelButton,
                                {
                                    borderColor: theme.colors.divider,
                                    backgroundColor: theme.colors.surfaceRaised,
                                    opacity: pressed ? 0.82 : 1,
                                },
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={t('common.cancel')}
                        >
                            <Text style={[pickerStyles.doneButtonText, { color: theme.colors.textSecondary }]}>
                                {t('common.cancel')}
                            </Text>
                        </Pressable>
                        <Pressable
                            onPress={handleDonePress}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={({ pressed }) => [
                                pickerStyles.doneButtonPressable,
                                { opacity: pressed ? 0.82 : 1 },
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={t('common.done')}
                        >
                            <View
                                style={[
                                    pickerStyles.doneButtonGlass,
                                    {
                                        backgroundColor: theme.colors.button.primary.background,
                                        borderColor: theme.colors.button.primary.background,
                                    },
                                ]}
                            >
                                <Ionicons
                                    name="checkmark"
                                    size={18}
                                    color={theme.colors.button.primary.tint}
                                />
                                <Text style={[pickerStyles.doneButtonText, { color: theme.colors.button.primary.tint }]}>
                                    {t('common.confirm')}
                                </Text>
                            </View>
                        </Pressable>
                        </>
                    )}
                </View>
            </View>

            {mode === 'browse' ? (
                canBrowse ? (
                <FolderBrowser
                    machineId={machineId}
                    homeDir={homeDir}
                    initialPath={value ? resolveAbsolutePath(value, homeDir) : homeDir}
                    recentPaths={browserRecommendedPaths}
                    onSelectPath={handleBrowseSelect}
                    onCurrentPathChange={handleBrowsePathChange}
                />
                ) : (
                    <View style={[pickerStyles.offlineHint, { backgroundColor: theme.colors.input.background }]}>
                        <Ionicons name="cloud-offline-outline" size={24} color={theme.colors.textSecondary} />
                        <Text style={[pickerStyles.offlineHintText, { color: theme.colors.textSecondary }]}>
                            {t('newSession.machineOffline')}
                        </Text>
                        <Pressable
                            onPress={() => setMode('text')}
                            style={pickerStyles.offlineManualButton}
                            accessibilityRole="button"
                            accessibilityLabel={t('newSession.switchToTextInput')}
                        >
                            <Text style={{ color: theme.colors.textLink, fontSize: 14, ...Typography.default('semiBold') }}>
                                {t('newSession.switchToTextInput')}
                            </Text>
                        </Pressable>
                    </View>
                )
            ) : (
                <>
                    <View
                        style={[
                            pickerStyles.pathInputRow,
                            {
                                backgroundColor: theme.colors.input.background,
                                borderColor: theme.colors.divider,
                            },
                        ]}
                    >
                        <FolderIcon size={16} />
                        <View style={pickerStyles.pathInputField}>
                            <TextInput
                                ref={inputRef}
                                value={currentValue}
                                onChangeText={onChangeValue}
                                onSelectionChange={handleSelectionChange}
                                selection={selection}
                                placeholder={t('components.pathPicker.enterProjectPath')}
                                placeholderTextColor={theme.colors.textSecondary}
                                style={[pickerStyles.pathTextInput, { color: theme.colors.text }]}
                                autoCapitalize="none"
                                autoCorrect={false}
                                multiline={false}
                                numberOfLines={1}
                                returnKeyType="done"
                                onSubmitEditing={onDone}
                            />
                        </View>
                    </View>

                    {isCustomPath && (
                        <Text style={[pickerStyles.pathMetaText, { color: theme.colors.textSecondary }]}>
                            {t('components.pathPicker.usingCustomPath')}
                        </Text>
                    )}

                    <Text style={[pickerStyles.sectionLabel, { color: theme.colors.textSecondary }]}>
                        {t('components.pathPicker.recent')}
                    </Text>

                    <ScrollView style={pickerStyles.optionList} keyboardShouldPersistTaps="handled">
                        {items.map((item) => {
                            const isSelected = item.key === matchedItemKey;

                            return (
                                <Pressable
                                    key={item.key}
                                    style={(p) => [pickerStyles.option, p.pressed && pickerStyles.optionPressed]}
                                    onPress={() => handleSuggestionPress(item)}
                                >
                                    <FolderIcon size={16} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[pickerStyles.optionText, { color: theme.colors.text }]}>
                                            {item.label}
                                        </Text>
                                    </View>
                                    {isSelected && (
                                        <Ionicons
                                            name="checkmark-circle"
                                            size={18}
                                            color={theme.colors.button.primary.background}
                                        />
                                    )}
                                </Pressable>
                            );
                        })}

                        {items.length === 0 && (
                            <Text style={[pickerStyles.emptyText, { color: theme.colors.textSecondary }]}>
                                {t('components.pathPicker.noRecentProjects')}
                            </Text>
                        )}
                    </ScrollView>
                </>
            )}
        </View>
    );
});
