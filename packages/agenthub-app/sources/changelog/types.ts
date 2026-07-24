export interface ChangelogEntry {
    version: number;
    date: string;
    summary: string;
    changes: string[];
    rawMarkdown?: string;
}

export interface ChangelogData {
    entries: ChangelogEntry[];
    latestVersion: number;
}

export interface ChangelogCatalog {
    defaultLocale: string;
    locales: Record<string, ChangelogData>;
}

export interface ChangelogManifest {
    defaultLocale: string;
    locales: Record<string, { latestVersion: number }>;
}
