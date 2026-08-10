import type { TranslationStructure } from './_default';
import type { TranslationLanguage } from './_all';

export async function loadTranslation(language: TranslationLanguage): Promise<TranslationStructure> {
    switch (language) {
        case 'ru': return (await import('./translations/ru')).ru;
        case 'pl': return (await import('./translations/pl')).pl;
        case 'es': return (await import('./translations/es')).es;
        case 'it': return (await import('./translations/it')).it;
        case 'pt': return (await import('./translations/pt')).pt;
        case 'ca': return (await import('./translations/ca')).ca;
        case 'zh-Hans': return (await import('./translations/zh-Hans')).zhHans;
        case 'zh-Hant': return (await import('./translations/zh-Hant')).zhHant;
        case 'ja': return (await import('./translations/ja')).ja;
    }
}
