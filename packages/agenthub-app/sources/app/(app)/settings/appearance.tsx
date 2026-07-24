import Ionicons from '@expo/vector-icons/Ionicons';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { useSettingMutable, useLocalSettingMutable, useLocalSetting } from '@/sync/storage';
import { useRouter } from 'expo-router';
import * as Localization from 'expo-localization';
import { useUnistyles, UnistylesRuntime } from 'react-native-unistyles';
import { Switch } from '@/components/Switch';
import { Appearance, Platform, Text, View, useWindowDimensions } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { darkTheme, lightTheme } from '@/theme';
import { t, getLanguageNativeName, SUPPORTED_LANGUAGES } from '@/text';
import { SCALE_LEVELS, type ScaleLevel } from '@/hooks/useScale';
import { SegmentedControl } from '@/components/glass';
import { Typography } from '@/constants/Typography';
import { SettingsPage } from '@/components/SettingsPage';

type ThemePreference = 'adaptive' | 'light' | 'dark';

function getScaleLabel(scale: number): string {
    const level = SCALE_LEVELS.find(l => Math.abs(l - scale) < 0.01);
    if (!level || level === 1.0) return t('settingsAppearance.scaleDefault');
    const labels: Record<number, string> = {
        0.9: t('settingsAppearance.scaleLevelL'),
        0.8: t('settingsAppearance.scaleLevelM'),
        0.7: t('settingsAppearance.scaleLevelS'),
        0.6: t('settingsAppearance.scaleLevelXS'),
        0.5: t('settingsAppearance.scaleLevelXXS'),
    };
    return labels[level] ?? t('settingsAppearance.scaleDefault');
}

export default function AppearanceSettingsScreen() {
    const { theme } = useUnistyles();
    const router = useRouter();
    const { width } = useWindowDimensions();
    const useCompactThemePicker = width < 430;
    const [showLineNumbersInToolViews, setShowLineNumbersInToolViews] = useSettingMutable('showLineNumbersInToolViews');
    const [wrapLinesInDiffs, setWrapLinesInDiffs] = useSettingMutable('wrapLinesInDiffs');
    const [diffStyle, setDiffStyle] = useSettingMutable('diffStyle');
    const [alwaysShowContextSize, setAlwaysShowContextSize] = useSettingMutable('alwaysShowContextSize');
    const [collapseAgentWork, setCollapseAgentWork] = useSettingMutable('collapseAgentWork');
    const [themePreference, setThemePreference] = useLocalSettingMutable('themePreference');
    const [preferredLanguage] = useSettingMutable('preferredLanguage');
    const sessionListScale = useLocalSetting('sessionListScale');
    const chatScale = useLocalSetting('chatScale');
    const fileScale = useLocalSetting('fileScale');
    const fileListScale = useLocalSetting('fileListScale');
    const deviceScale = useLocalSetting('deviceScale');
    const settingsScale = useLocalSetting('settingsScale');
    const themeOptions = [
        { value: 'adaptive', label: t('settingsAppearance.themeOptions.adaptive') },
        { value: 'light', label: t('settingsAppearance.themeOptions.light') },
        { value: 'dark', label: t('settingsAppearance.themeOptions.dark') },
    ] as const;

    const applyThemePreference = (nextTheme: ThemePreference) => {
        setThemePreference(nextTheme);

        if (nextTheme === 'adaptive') {
            UnistylesRuntime.setAdaptiveThemes(true);
            const systemTheme = Appearance.getColorScheme();
            const color = systemTheme === 'dark' ? darkTheme.colors.canvas : lightTheme.colors.canvas;
            UnistylesRuntime.setRootViewBackgroundColor(color);
            SystemUI.setBackgroundColorAsync(color);
            return;
        }

        UnistylesRuntime.setAdaptiveThemes(false);
        UnistylesRuntime.setTheme(nextTheme);
        const color = nextTheme === 'dark' ? darkTheme.colors.canvas : lightTheme.colors.canvas;
        UnistylesRuntime.setRootViewBackgroundColor(color);
        SystemUI.setBackgroundColorAsync(color);
    };

    // Language display
    const getLanguageDisplayText = () => {
        if (preferredLanguage === null) {
            const deviceLocale = Localization.getLocales()?.[0]?.languageTag ?? 'en-US';
            const deviceLanguage = deviceLocale.split('-')[0].toLowerCase();
            const detectedLanguageName = deviceLanguage in SUPPORTED_LANGUAGES ? 
                                        getLanguageNativeName(deviceLanguage as keyof typeof SUPPORTED_LANGUAGES) : 
                                        getLanguageNativeName('en');
            return `${t('settingsLanguage.automatic')} (${detectedLanguageName})`;
        } else if (preferredLanguage && preferredLanguage in SUPPORTED_LANGUAGES) {
            return getLanguageNativeName(preferredLanguage as keyof typeof SUPPORTED_LANGUAGES);
        }
        return t('settingsLanguage.automatic');
    };
    return (
        <SettingsPage title={t('settings.appearance')} listStyle={{ paddingTop: 0 }}>

            {/* Theme Settings */}
            <ItemGroup title={t('settingsAppearance.theme')} footer={t('settingsAppearance.themeDescription')}>
                {useCompactThemePicker ? (
                    <View style={themePickerStyles.compactRow}>
                            <View style={themePickerStyles.compactHeader}>
                                <View style={themePickerStyles.compactIcon}>
                                <Ionicons name="contrast-outline" size={29} color={theme.colors.accent} />
                            </View>
                            <View style={themePickerStyles.compactText}>
                                <Text style={[themePickerStyles.compactTitle, { color: theme.colors.text }]}>
                                    {t('settings.appearance')}
                                </Text>
                                <Text style={[themePickerStyles.compactSubtitle, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                                    {themePreference === 'adaptive' ? t('settingsAppearance.themeDescriptions.adaptive') : themePreference === 'light' ? t('settingsAppearance.themeDescriptions.light') : t('settingsAppearance.themeDescriptions.dark')}
                                </Text>
                            </View>
                        </View>
                        <SegmentedControl
                            accessibilityLabel={t('settingsAppearance.theme')}
                            value={themePreference as ThemePreference}
                            options={themeOptions}
                            onChange={applyThemePreference}
                            style={themePickerStyles.compactControl}
                        />
                    </View>
                ) : (
                    <Item
                        title={t('settings.appearance')}
                        titleLines={0}
                        subtitle={themePreference === 'adaptive' ? t('settingsAppearance.themeDescriptions.adaptive') : themePreference === 'light' ? t('settingsAppearance.themeDescriptions.light') : t('settingsAppearance.themeDescriptions.dark')}
                        subtitleLines={0}
                        icon={<Ionicons name="contrast-outline" size={29} color={theme.colors.accent} />}
                        showChevron={false}
                        rightElement={
                            <SegmentedControl
                                accessibilityLabel={t('settingsAppearance.theme')}
                                value={themePreference as ThemePreference}
                                options={themeOptions}
                                onChange={applyThemePreference}
                            />
                        }
                    />
                )}
            </ItemGroup>

            {/* Language Settings */}
            <ItemGroup title={t('settingsLanguage.title')} footer={t('settingsLanguage.description')}>
                <Item
                    title={t('settingsLanguage.currentLanguage')}
                    titleLines={0}
                    icon={<Ionicons name="language-outline" size={29} color={theme.colors.accent} />}
                    subtitle={getLanguageDisplayText()}
                    subtitleLines={0}
                    onPress={() => router.push('/settings/language')}
                />
            </ItemGroup>

            {/* Scaling Settings */}
            <ItemGroup title={t('settingsAppearance.scaling')} footer={t('settingsAppearance.scalingDescription')}>
                <Item
                    title={t('settingsAppearance.sessionScale')}
                    titleLines={0}
                    icon={<Ionicons name="resize-outline" size={29} color="#FF9500" />}
                    subtitle={getScaleLabel(sessionListScale)}
                    subtitleLines={0}
                    onPress={() => router.push('/settings/session-scale')}
                />
                <Item
                    title={t('settingsAppearance.chatScale')}
                    titleLines={0}
                    icon={<Ionicons name="chatbubble-ellipses-outline" size={29} color="#FF9500" />}
                    subtitle={getScaleLabel(chatScale)}
                    subtitleLines={0}
                    onPress={() => router.push('/settings/chat-scale')}
                />
                <Item
                    title={t('settingsAppearance.fileScale')}
                    titleLines={0}
                    icon={<Ionicons name="document-text-outline" size={29} color="#FF9500" />}
                    subtitle={getScaleLabel(fileScale)}
                    subtitleLines={0}
                    onPress={() => router.push('/settings/file-scale')}
                />
                <Item
                    title={t('settingsAppearance.fileListScale')}
                    titleLines={0}
                    icon={<Ionicons name="folder-open-outline" size={29} color="#FF9500" />}
                    subtitle={getScaleLabel(fileListScale)}
                    subtitleLines={0}
                    onPress={() => router.push('/settings/file-list-scale' as any)}
                />
                <Item
                    title={t('settingsAppearance.deviceScale')}
                    titleLines={0}
                    icon={<Ionicons name="desktop-outline" size={29} color="#FF9500" />}
                    subtitle={getScaleLabel(deviceScale)}
                    subtitleLines={0}
                    onPress={() => router.push('/settings/device-scale' as any)}
                />
                <Item
                    title={t('settingsAppearance.settingsScale')}
                    titleLines={0}
                    icon={<Ionicons name="list-outline" size={29} color="#FF9500" />}
                    subtitle={getScaleLabel(settingsScale)}
                    subtitleLines={0}
                    onPress={() => router.push('/settings/settings-scale' as any)}
                />
            </ItemGroup>

            {/* Display Settings */}
            <ItemGroup title={t('settingsAppearance.display')} footer={t('settingsAppearance.displayDescription')}>
                <Item
                    title={t('settingsAppearance.collapseAgentWork')}
                    titleLines={0}
                    subtitle={t('settingsAppearance.collapseAgentWorkDescription')}
                    subtitleLines={0}
                    icon={<Ionicons name="layers-outline" size={29} color={theme.colors.accent} />}
                    rightElement={
                        <Switch
                            accessibilityLabel={t('settingsAppearance.collapseAgentWork')}
                            value={collapseAgentWork}
                            onValueChange={setCollapseAgentWork}
                        />
                    }
                />
                <Item
                    title={t('settingsAppearance.showLineNumbersInToolViews')}
                    titleLines={0}
                    subtitle={t('settingsAppearance.showLineNumbersInToolViewsDescription')}
                    subtitleLines={0}
                    icon={<Ionicons name="code-working-outline" size={29} color={theme.colors.accent} />}
                    rightElement={
                        <Switch
                            accessibilityLabel={t('settingsAppearance.showLineNumbersInToolViews')}
                            value={showLineNumbersInToolViews}
                            onValueChange={setShowLineNumbersInToolViews}
                        />
                    }
                />
                <Item
                    title={t('settingsAppearance.wrapLinesInDiffs')}
                    titleLines={0}
                    subtitle={t('settingsAppearance.wrapLinesInDiffsDescription')}
                    subtitleLines={0}
                    icon={<Ionicons name="return-down-forward-outline" size={29} color={theme.colors.accent} />}
                    rightElement={
                        <Switch
                            accessibilityLabel={t('settingsAppearance.wrapLinesInDiffs')}
                            value={wrapLinesInDiffs}
                            onValueChange={setWrapLinesInDiffs}
                        />
                    }
                />
                {Platform.OS === 'web' && (
                    <Item
                        title={t('settingsAppearance.diffStyle')}
                        titleLines={0}
                        subtitle={t('settingsAppearance.diffStyleDescription')}
                        subtitleLines={0}
                        icon={<Ionicons name="git-compare-outline" size={29} color={theme.colors.accent} />}
                        detail={diffStyle === 'split' ? t('settingsAppearance.diffStyleOptions.split') : t('settingsAppearance.diffStyleOptions.unified')}
                        onPress={() => setDiffStyle(diffStyle === 'unified' ? 'split' : 'unified')}
                    />
                )}
                <Item
                    title={t('settingsAppearance.alwaysShowContextSize')}
                    titleLines={0}
                    subtitle={t('settingsAppearance.alwaysShowContextSizeDescription')}
                    subtitleLines={0}
                    icon={<Ionicons name="analytics-outline" size={29} color={theme.colors.accent} />}
                    rightElement={
                        <Switch
                            accessibilityLabel={t('settingsAppearance.alwaysShowContextSize')}
                            value={alwaysShowContextSize}
                            onValueChange={setAlwaysShowContextSize}
                        />
                    }
                />
                {/* <Item
                    title="Compact Mode"
                    subtitle="Reduce spacing between elements"
                    icon={<Ionicons name="contract-outline" size={29} color={theme.colors.accent} />}
                    disabled
                    rightElement={
                        <Switch
                            value={false}
                            disabled
                        />
                    }
                />
                <Item
                    title="Show Avatars"
                    subtitle="Display user and assistant avatars"
                    icon={<Ionicons name="person-circle-outline" size={29} color={theme.colors.accent} />}
                    disabled
                    rightElement={
                        <Switch
                            value={true}
                            disabled
                        />
                    }
                /> */}
            </ItemGroup>

            {/* Colors */}
            {/* <ItemGroup title="Colors" footer="Customize accent colors and highlights">
                <Item
                    title="Accent Color"
                    subtitle="Choose your accent color"
                    icon={<Ionicons name="color-palette-outline" size={29} color="#FF3B30" />}
                    detail="Blue"
                    onPress={() => { }}
                    disabled
                />
            </ItemGroup> */}
        </SettingsPage>
    );
}

const themePickerStyles = {
    compactRow: {
        paddingHorizontal: 16,
        paddingVertical: Platform.select({ ios: 14, default: 16 }),
        gap: 12,
    },
    compactHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    compactIcon: {
        width: Platform.select({ ios: 29, default: 32 }),
        height: Platform.select({ ios: 29, default: 32 }),
        marginRight: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    compactText: {
        flex: 1,
        minWidth: 0,
    },
    compactTitle: {
        ...Typography.default('regular'),
        fontSize: Platform.select({ ios: 17, default: 16 }),
        lineHeight: Platform.select({ ios: 22, default: 24 }),
    },
    compactSubtitle: {
        ...Typography.default('regular'),
        fontSize: Platform.select({ ios: 15, default: 14 }),
        lineHeight: 20,
        marginTop: Platform.select({ ios: 2, default: 0 }),
    },
    compactControl: {
        alignSelf: 'stretch',
        justifyContent: 'space-between',
    },
} as const;
