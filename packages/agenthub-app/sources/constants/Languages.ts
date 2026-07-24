// Language type definition
export interface Language {
    code: string | null; // null for autodetect
    name: string;
    nativeName: string;
    region?: string;
}

// Comprehensive language list with locale codes, names, and regions
// First option is autodetect (null value)
export const LANGUAGES: Language[] = [
    { code: null, name: 'Auto-detect', nativeName: 'Auto-detect' },
    { code: 'en-US', name: 'English', nativeName: 'English', region: 'United States' },
    { code: 'en-GB', name: 'English', nativeName: 'English', region: 'United Kingdom' },
    { code: 'en-AU', name: 'English', nativeName: 'English', region: 'Australia' },
    { code: 'en-CA', name: 'English', nativeName: 'English', region: 'Canada' },
    { code: 'es-ES', name: 'Spanish', nativeName: 'Español', region: 'Spain' },
    { code: 'es-MX', name: 'Spanish', nativeName: 'Español', region: 'Mexico' },
    { code: 'es-AR', name: 'Spanish', nativeName: 'Español', region: 'Argentina' },
    { code: 'fr-FR', name: 'French', nativeName: 'Français', region: 'France' },
    { code: 'fr-CA', name: 'French', nativeName: 'Français', region: 'Canada' },
    { code: 'de-DE', name: 'German', nativeName: 'Deutsch', region: 'Germany' },
    { code: 'de-AT', name: 'German', nativeName: 'Deutsch', region: 'Austria' },
    { code: 'it-IT', name: 'Italian', nativeName: 'Italiano' },
    { code: 'pt-BR', name: 'Portuguese', nativeName: 'Português', region: 'Brazil' },
    { code: 'pt-PT', name: 'Portuguese', nativeName: 'Português', region: 'Portugal' },
    { code: 'ru-RU', name: 'Russian', nativeName: 'Русский' },
    { code: 'zh-CN', name: 'Chinese', nativeName: '中文', region: 'Simplified' },
    { code: 'zh-TW', name: 'Chinese', nativeName: '中文', region: 'Traditional' },
    { code: 'ja-JP', name: 'Japanese', nativeName: '日本語' },
    { code: 'ko-KR', name: 'Korean', nativeName: '한국어' },
    { code: 'ar-SA', name: 'Arabic', nativeName: 'العربية' },
    { code: 'hi-IN', name: 'Hindi', nativeName: 'हिन्दी' },
    { code: 'nl-NL', name: 'Dutch', nativeName: 'Nederlands' },
    { code: 'sv-SE', name: 'Swedish', nativeName: 'Svenska' },
    { code: 'no-NO', name: 'Norwegian', nativeName: 'Norsk' },
    { code: 'da-DK', name: 'Danish', nativeName: 'Dansk' },
    { code: 'fi-FI', name: 'Finnish', nativeName: 'Suomi' },
    { code: 'pl-PL', name: 'Polish', nativeName: 'Polski' },
    { code: 'tr-TR', name: 'Turkish', nativeName: 'Türkçe' },
    { code: 'he-IL', name: 'Hebrew', nativeName: 'עברית' },
    { code: 'th-TH', name: 'Thai', nativeName: 'ไทย' },
    { code: 'vi-VN', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
    { code: 'id-ID', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
    { code: 'ms-MY', name: 'Malay', nativeName: 'Bahasa Melayu' },
    { code: 'uk-UA', name: 'Ukrainian', nativeName: 'Українська' },
    { code: 'cs-CZ', name: 'Czech', nativeName: 'Čeština' },
    { code: 'hu-HU', name: 'Hungarian', nativeName: 'Magyar' },
    { code: 'ro-RO', name: 'Romanian', nativeName: 'Română' },
    { code: 'bg-BG', name: 'Bulgarian', nativeName: 'Български' },
    { code: 'el-GR', name: 'Greek', nativeName: 'Ελληνικά' },
    { code: 'hr-HR', name: 'Croatian', nativeName: 'Hrvatski' },
    { code: 'sk-SK', name: 'Slovak', nativeName: 'Slovenčina' },
    { code: 'sl-SI', name: 'Slovenian', nativeName: 'Slovenščina' },
    { code: 'et-EE', name: 'Estonian', nativeName: 'Eesti' },
    { code: 'lv-LV', name: 'Latvian', nativeName: 'Latviešu' },
    { code: 'lt-LT', name: 'Lithuanian', nativeName: 'Lietuvių' },
];

/**
 * Format display name for a language
 */
export const getLanguageDisplayName = (language: Language) => {
    const parts = [];
    
    if (language.name !== language.nativeName) {
        parts.push(`${language.name} (${language.nativeName})`);
    } else {
        parts.push(language.name);
    }
    
    if (language.region) {
        parts.push(language.region);
    }
    
    return parts.join(' - ');
};

/**
 * Find a language by its code (including null for autodetect)
 */
export const findLanguageByCode = (code: string | null): Language | undefined => {
    return LANGUAGES.find(lang => lang.code === code);
};
