#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import type { ChangelogCatalog, ChangelogData, ChangelogEntry, ChangelogManifest } from '../changelog/types';

const CHANGELOG_SOURCES = {
    en: path.join(__dirname, '../../CHANGELOG.en.md'),
    'zh-Hans': path.join(__dirname, '../../CHANGELOG.md'),
} as const;

export function parseChangelogContent(content: string, sourceLabel: string): ChangelogData {
    const entries: ChangelogEntry[] = [];
    const seenVersions = new Set<number>();

    // Split by version headers (## Version X - Date)
    const versionSections = content.split(/^## Version (\d+) - (.+)$/gm);

    // Skip the first element (content before first version)
    for (let i = 1; i < versionSections.length; i += 3) {
        const versionStr = versionSections[i];
        const dateStr = versionSections[i + 1];
        const changesContent = versionSections[i + 2];
        const version = Number.parseInt(versionStr, 10);

        if (!Number.isSafeInteger(version) || seenVersions.has(version)) {
            throw new Error(`${sourceLabel}: invalid or duplicate version ${versionStr}`);
        }
        seenVersions.add(version);

        const changes: string[] = [];
        const lines = changesContent.trim().split('\n');
        let summary = '';
        let foundFirstBullet = false;

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('- ')) {
                foundFirstBullet = true;
                changes.push(trimmed.substring(2));
            } else if (!foundFirstBullet && trimmed.length > 0) {
                summary += (summary ? ' ' : '') + trimmed;
            }
        }

        if (!summary || changes.length === 0) {
            throw new Error(`${sourceLabel}: version ${version} requires a summary and at least one change`);
        }

        entries.push({
            version,
            date: dateStr.trim(),
            summary,
            changes,
        });
    }

    entries.sort((a, b) => b.version - a.version);
    return {
        entries,
        latestVersion: entries[0]?.version ?? 0,
    };
}

export function parseChangelog(changelogPath = CHANGELOG_SOURCES.en): ChangelogData {
    if (!fs.existsSync(changelogPath)) {
        throw new Error(`Changelog source not found: ${changelogPath}`);
    }
    const content = fs.readFileSync(changelogPath, 'utf-8');
    return parseChangelogContent(content, changelogPath);
}

export function assertLocaleParity(defaultLocale: string, catalog: ChangelogCatalog): void {
    const canonical = catalog.locales[defaultLocale];
    if (!canonical) {
        throw new Error(`Missing default changelog locale: ${defaultLocale}`);
    }

    for (const [locale, localized] of Object.entries(catalog.locales)) {
        if (locale === defaultLocale) continue;
        if (localized.entries.length !== canonical.entries.length) {
            throw new Error(`${locale}: expected ${canonical.entries.length} versions, received ${localized.entries.length}`);
        }

        localized.entries.forEach((entry, index) => {
            const expected = canonical.entries[index];
            if (entry.version !== expected.version || entry.date !== expected.date) {
                throw new Error(`${locale}: version/date mismatch at entry ${index}`);
            }
            if (entry.changes.length !== expected.changes.length) {
                throw new Error(`${locale}: version ${entry.version} has ${entry.changes.length} changes; expected ${expected.changes.length}`);
            }
        });
    }
}

export function generateChangelogCatalog(): ChangelogCatalog {
    const catalog: ChangelogCatalog = {
        defaultLocale: 'en',
        locales: Object.fromEntries(
            Object.entries(CHANGELOG_SOURCES).map(([locale, sourcePath]) => [locale, parseChangelog(sourcePath)]),
        ),
    };
    assertLocaleParity(catalog.defaultLocale, catalog);
    return catalog;
}

function main() {
    console.log('Parsing localized changelog sources...');
    const changelogCatalog = generateChangelogCatalog();
    const outputPath = path.join(__dirname, '../changelog/changelog.json');
    
    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write the parsed data
    const manifest: ChangelogManifest = {
        defaultLocale: changelogCatalog.defaultLocale,
        locales: Object.fromEntries(
            Object.entries(changelogCatalog.locales).map(([locale, data]) => [locale, { latestVersion: data.latestVersion }]),
        ),
    };
    fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
    for (const [locale, data] of Object.entries(changelogCatalog.locales)) {
        const localeOutputPath = path.join(dir, `changelog.${locale}.json`);
        fs.writeFileSync(localeOutputPath, `${JSON.stringify(data, null, 2)}\n`);
    }

    const defaultData = changelogCatalog.locales[changelogCatalog.defaultLocale];
    console.log(`✅ Parsed ${defaultData.entries.length} entries in ${Object.keys(changelogCatalog.locales).length} locales`);
    console.log(`📝 Latest version: ${defaultData.latestVersion}`);
    console.log(`💾 Output written to: ${outputPath}`);
}

if (require.main === module) {
    main();
}
