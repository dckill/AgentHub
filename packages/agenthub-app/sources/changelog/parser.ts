import { loadChangelogLocale } from './loader';
import type { ChangelogData, ChangelogEntry, ChangelogManifest } from './types';

const changelogManifest = require('./changelog.json') as ChangelogManifest;

export function resolveChangelogLocale(manifest: ChangelogManifest, locale: string): string {
    return manifest.locales[locale] ? locale : manifest.defaultLocale;
}

export async function getChangelogData(locale = 'en'): Promise<ChangelogData> {
    return loadChangelogLocale(resolveChangelogLocale(changelogManifest, locale));
}

export async function getChangelogEntries(locale = 'en'): Promise<ChangelogEntry[]> {
    return (await getChangelogData(locale)).entries;
}

export function getLatestVersion(locale = 'en'): number {
    const resolvedLocale = resolveChangelogLocale(changelogManifest, locale);
    return changelogManifest.locales[resolvedLocale]?.latestVersion ?? 0;
}

export async function getUnreadEntries(lastViewedVersion: number, locale = 'en'): Promise<ChangelogEntry[]> {
    return (await getChangelogData(locale)).entries.filter(entry => entry.version > lastViewedVersion);
}
