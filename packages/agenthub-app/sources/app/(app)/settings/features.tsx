import { Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { useSettingMutable, useLocalSettingMutable } from '@/sync/storage';
import { Switch } from '@/components/Switch';
import { t } from '@/text';
import { useUnistyles } from 'react-native-unistyles';
import { isRunningOnMac } from '@/utils/platform';
import { SettingsPage } from '@/components/SettingsPage';

export default function FeaturesSettingsScreen() {
    const { theme } = useUnistyles();
    const [experiments, setExperiments] = useSettingMutable('experiments');
    const [agentInputEnterToSend, setAgentInputEnterToSend] = useSettingMutable('agentInputEnterToSend');
    const [commandPaletteEnabled, setCommandPaletteEnabled] = useLocalSettingMutable('commandPaletteEnabled');
    const [markdownCopyV2, setMarkdownCopyV2] = useLocalSettingMutable('markdownCopyV2');
    const [hideInactiveSessions, setHideInactiveSessions] = useSettingMutable('hideInactiveSessions');
    const [expResumeSession, setExpResumeSession] = useSettingMutable('expResumeSession');
    const [fileDiffsSidebar, setFileDiffsSidebar] = useSettingMutable('fileDiffsSidebar');
    const supportsFileDiffsSidebar = Platform.OS === 'web' || isRunningOnMac();

    return (
        <SettingsPage title={t('settings.featuresTitle')} listStyle={{ paddingTop: 0 }}>
            {/* Interface */}
            {supportsFileDiffsSidebar && (
                <ItemGroup
                    title={t('settingsFeatures.interfaceTitle')}
                    footer={t('settingsFeatures.interfaceFooter')}
                >
                    <Item
                        title={t('settingsFeatures.fileDiffsSidebar')}
                        titleLines={0}
                        subtitle={t('settingsFeatures.fileDiffsSidebarSubtitle')}
                        subtitleLines={0}
                        icon={<Ionicons name="git-branch-outline" size={29} color={theme.colors.accent} />}
                        rightElement={
                            <Switch
                                accessibilityLabel={t('settingsFeatures.fileDiffsSidebar')}
                                value={fileDiffsSidebar}
                                onValueChange={setFileDiffsSidebar}
                            />
                        }
                        showChevron={false}
                    />
                </ItemGroup>
            )}

            {/* Experimental Features */}
            <ItemGroup
                title={t('settingsFeatures.experiments')}
                footer={t('settingsFeatures.experimentsDescription')}
            >
                <Item
                    title={t('settingsFeatures.experimentalFeatures')}
                    titleLines={0}
                    subtitle={experiments ? t('settingsFeatures.experimentalFeaturesEnabled') : t('settingsFeatures.experimentalFeaturesDisabled')}
                    subtitleLines={0}
                    icon={<Ionicons name="flask-outline" size={29} color={theme.colors.accent} />}
                    rightElement={
                        <Switch
                            accessibilityLabel={t('settingsFeatures.experimentalFeatures')}
                            value={experiments}
                            onValueChange={setExperiments}
                        />
                    }
                    showChevron={false}
                />
                {Platform.OS !== 'web' && (
                    <Item
                        title={t('settingsFeatures.markdownCopyV2')}
                        titleLines={0}
                        subtitle={t('settingsFeatures.markdownCopyV2Subtitle')}
                        subtitleLines={0}
                        icon={<Ionicons name="text-outline" size={29} color={theme.colors.accent} />}
                        rightElement={
                            <Switch
                                accessibilityLabel={t('settingsFeatures.markdownCopyV2')}
                                value={markdownCopyV2}
                                onValueChange={setMarkdownCopyV2}
                            />
                        }
                        showChevron={false}
                    />
                )}
                <Item
                    title={t('settingsFeatures.hideInactiveSessions')}
                    titleLines={0}
                    subtitle={t('settingsFeatures.hideInactiveSessionsSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="eye-off-outline" size={29} color="#FF9500" />}
                    rightElement={
                        <Switch
                            accessibilityLabel={t('settingsFeatures.hideInactiveSessions')}
                            value={hideInactiveSessions}
                            onValueChange={setHideInactiveSessions}
                        />
                    }
                    showChevron={false}
                />
                <Item
                    title={t('settingsFeatures.resumeSessionFeature')}
                    titleLines={0}
                    subtitle={t('settingsFeatures.resumeSessionFeatureSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="play-circle-outline" size={29} color={theme.colors.accent} />}
                    rightElement={
                        <Switch
                            accessibilityLabel={t('settingsFeatures.resumeSessionFeature')}
                            value={expResumeSession}
                            onValueChange={setExpResumeSession}
                        />
                    }
                    showChevron={false}
                />
            </ItemGroup>

            {/* Web-only Features */}
            {Platform.OS === 'web' && (
                <ItemGroup 
                    title={t('settingsFeatures.webFeatures')}
                    footer={t('settingsFeatures.webFeaturesDescription')}
                >
                    <Item
                        title={t('settingsFeatures.enterToSend')}
                        titleLines={0}
                        subtitle={agentInputEnterToSend ? t('settingsFeatures.enterToSendEnabled') : t('settingsFeatures.enterToSendDisabled')}
                        subtitleLines={0}
                        icon={<Ionicons name="return-down-forward-outline" size={29} color={theme.colors.accent} />}
                        rightElement={
                            <Switch
                                accessibilityLabel={t('settingsFeatures.enterToSend')}
                                value={agentInputEnterToSend}
                                onValueChange={setAgentInputEnterToSend}
                            />
                        }
                        showChevron={false}
                    />
                    <Item
                        title={t('settingsFeatures.commandPalette')}
                        titleLines={0}
                        subtitle={commandPaletteEnabled ? t('settingsFeatures.commandPaletteEnabled') : t('settingsFeatures.commandPaletteDisabled')}
                        subtitleLines={0}
                        icon={<Ionicons name="keypad-outline" size={29} color={theme.colors.accent} />}
                        rightElement={
                            <Switch
                                accessibilityLabel={t('settingsFeatures.commandPalette')}
                                value={commandPaletteEnabled}
                                onValueChange={setCommandPaletteEnabled}
                            />
                        }
                        showChevron={false}
                    />
                </ItemGroup>
            )}
        </SettingsPage>
    );
}
