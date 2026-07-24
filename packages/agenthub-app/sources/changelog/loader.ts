import english from './changelog.en.json';
import simplifiedChinese from './changelog.zh-Hans.json';
import type { ChangelogData } from './types';

export async function loadChangelogLocale(locale: string): Promise<ChangelogData> {
    return locale === 'zh-Hans'
        ? simplifiedChinese as ChangelogData
        : english as ChangelogData;
}
