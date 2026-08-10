/**
 * Centralized language configuration for the AgentHub app
 * This file contains all supported languages, their metadata, and configuration
 * 
 * When adding a new language:
 * 1. Add the language metadata below (the SupportedLanguage type and code arrays derive from it)
 * 2. Create a new translation file in translations/[code].ts
 * 3. Wire the module into the Native map and Web dynamic-import switch
 */

/**
 * All supported languages with their native and English names
 */
const LANGUAGE_DEFINITIONS = {
    en: {
        code: 'en',
        nativeName: 'English',
        englishName: 'English'
    },
    ru: {
        code: 'ru',
        nativeName: 'Русский',
        englishName: 'Russian'
    },
    pl: {
        code: 'pl',
        nativeName: 'Polski',
        englishName: 'Polish'
    },
    es: {
        code: 'es',
        nativeName: 'Español',
        englishName: 'Spanish'
    },
    it: {
        code: 'it',
        nativeName: 'Italiano',
        englishName: 'Italian'
    },
    pt: {
        code: 'pt',
        nativeName: 'Português',
        englishName: 'Portuguese'
    },
    ca: {
        code: 'ca',
        nativeName: 'Català',
        englishName: 'Catalan'
    },
    'zh-Hans': {
        code: 'zh-Hans',
        nativeName: '中文(简体)',
        englishName: 'Chinese (Simplified)'
    },
'zh-Hant': {
        code: 'zh-Hant',
        nativeName: '中文(繁體)',
        englishName: 'Chinese (Traditional)'
    },
    ja: {
        code: 'ja',
        nativeName: '日本語',
        englishName: 'Japanese'
    }
} as const;

/** Supported language codes, derived from the single metadata registry. */
export type SupportedLanguage = keyof typeof LANGUAGE_DEFINITIONS;

/** Language metadata interface. */
export interface LanguageInfo {
    code: SupportedLanguage;
    nativeName: string;
    englishName: string;
}

export const SUPPORTED_LANGUAGES: Record<SupportedLanguage, LanguageInfo> = LANGUAGE_DEFINITIONS;

/**
 * Helper to get language native name by code
 */
export function getLanguageNativeName(code: SupportedLanguage): string {
    return SUPPORTED_LANGUAGES[code].nativeName;
}

/**
 * Helper to get language English name by code
 */
export function getLanguageEnglishName(code: SupportedLanguage): string {
    return SUPPORTED_LANGUAGES[code].englishName;
}

/**
 * Array of all supported language codes
 */
export const SUPPORTED_LANGUAGE_CODES: SupportedLanguage[] = Object.keys(SUPPORTED_LANGUAGES) as SupportedLanguage[];

/**
 * Default language code
 */
export const DEFAULT_LANGUAGE = 'en' satisfies SupportedLanguage;

/** Non-default languages that require a translation module. */
export type TranslationLanguage = Exclude<SupportedLanguage, typeof DEFAULT_LANGUAGE>;

export const SUPPORTED_TRANSLATION_LANGUAGE_CODES: TranslationLanguage[] = SUPPORTED_LANGUAGE_CODES.filter(
    (code): code is TranslationLanguage => code !== DEFAULT_LANGUAGE,
);
