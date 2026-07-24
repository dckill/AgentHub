import React from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ItemGroup } from '@/components/ItemGroup';
import { SelectRow } from '@/components/SelectRow';
import { SettingsPage } from '@/components/SettingsPage';
import { useSettingMutable } from '@/sync/storage';
import { useUnistyles } from 'react-native-unistyles';
import { t, getLanguageNativeName, SUPPORTED_LANGUAGES, SUPPORTED_LANGUAGE_CODES, type SupportedLanguage } from '@/text';
import { Modal } from '@/modal';
import { useUpdates } from '@/hooks/useUpdates';
import * as Localization from 'expo-localization';

type LanguageOption = 'auto' | SupportedLanguage;

interface LanguageItem {
    key: LanguageOption;
    title: string;
    subtitle?: string;
}

export default function LanguageSettingsScreen() {
    const { theme } = useUnistyles();
    const [preferredLanguage, setPreferredLanguage] = useSettingMutable('preferredLanguage');
    const { reloadApp } = useUpdates();

    // Get device locale for automatic detection
    const deviceLocale = Localization.getLocales()?.[0]?.languageTag ?? 'en-US';
    const deviceLanguage = deviceLocale.split('-')[0].toLowerCase();
    const detectedLanguageName = deviceLanguage in SUPPORTED_LANGUAGES ? 
                                 getLanguageNativeName(deviceLanguage as keyof typeof SUPPORTED_LANGUAGES) : 
                                 getLanguageNativeName('en');

    // Current selection
    const currentSelection: LanguageOption = preferredLanguage === null ? 'auto' : 
                                           SUPPORTED_LANGUAGE_CODES.includes(preferredLanguage as SupportedLanguage) ? 
                                           preferredLanguage as SupportedLanguage : 'auto';

    // Language options - dynamically generated from supported languages
    const languageOptions: LanguageItem[] = [
        {
            key: 'auto',
            title: t('settingsLanguage.automatic'),
            subtitle: `${t('settingsLanguage.automaticSubtitle')} (${detectedLanguageName})`
        },
        ...SUPPORTED_LANGUAGE_CODES.map(code => ({
            key: code,
            title: getLanguageNativeName(code)
        }))
    ];

    const handleLanguageChange = async (newLanguage: LanguageOption) => {
        if (newLanguage === currentSelection) {
            return; // No change
        }

        // Show confirmation modal
        const confirmed = await Modal.confirm(
            t('settingsLanguage.needsRestart'),
            t('settingsLanguage.needsRestartMessage')
        );

        if (confirmed) {
            // Update the preference
            const newPreference = newLanguage === 'auto' ? null : newLanguage;
            setPreferredLanguage(newPreference);

            // Small delay to ensure setting is saved
            setTimeout(() => {
                reloadApp();
            }, 100);
        }
    };

    return (
        <SettingsPage title={t('settingsLanguage.currentLanguage')} listStyle={{ paddingTop: 0 }}>
            <ItemGroup 
                title={t('settingsLanguage.currentLanguage')} 
                footer={t('settingsLanguage.description')}
            >
                <View role="radiogroup" accessibilityLabel={t('settingsLanguage.currentLanguage')}>
                    {languageOptions.map((option) => (
                        <SelectRow
                            key={option.key}
                            title={option.title}
                            subtitle={option.subtitle}
                            subtitleLines={0}
                            selected={currentSelection === option.key}
                            icon={<Ionicons
                                name="language-outline"
                                size={29}
                                color={theme.colors.accent}
                            />}
                            rightElement={
                                currentSelection === option.key ? (
                                    <Ionicons
                                        name="checkmark"
                                        size={20}
                                        color={theme.colors.accent}
                                    />
                                ) : null
                            }
                            onPress={() => handleLanguageChange(option.key)}
                        />
                    ))}
                </View>
            </ItemGroup>
        </SettingsPage>
    );
}
