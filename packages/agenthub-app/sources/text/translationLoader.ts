import type { TranslationStructure } from './_default';
import type { SupportedLanguage } from './_all';
import { ru } from './translations/ru';
import { pl } from './translations/pl';
import { es } from './translations/es';
import { it } from './translations/it';
import { pt } from './translations/pt';
import { ca } from './translations/ca';
import { zhHans } from './translations/zh-Hans';
import { zhHant } from './translations/zh-Hant';
import { ja } from './translations/ja';

const translations: Record<Exclude<SupportedLanguage, 'en'>, TranslationStructure> = {
    ru,
    pl,
    es,
    it,
    pt,
    ca,
    'zh-Hans': zhHans,
    'zh-Hant': zhHant,
    ja,
};

export async function loadTranslation(language: Exclude<SupportedLanguage, 'en'>): Promise<TranslationStructure> {
    return translations[language];
}
