import type { ChangelogData } from './types';

type ChangelogJsonModule = ChangelogData | { default: ChangelogData };

function unwrapJsonModule(module: ChangelogJsonModule): ChangelogData {
    return 'default' in module ? module.default : module;
}

export async function loadChangelogLocale(locale: string): Promise<ChangelogData> {
    if (locale === 'zh-Hans') {
        return unwrapJsonModule(await import('./changelog.zh-Hans.json'));
    }
    return unwrapJsonModule(await import('./changelog.en.json'));
}
