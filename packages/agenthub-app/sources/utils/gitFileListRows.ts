import type { GitFileStatus } from '@/sync/gitStatusFiles';
import type { FileItem } from '@/sync/suggestionFile';

export type GitFileSource = 'staged' | 'unstaged';

export type GitFileListRow =
    | {
        kind: 'section';
        key: string;
        source: GitFileSource;
        count: number;
    }
    | {
        kind: 'git-file';
        key: string;
        source: GitFileSource;
        file: GitFileStatus;
        fileIndex: number;
        sectionIndex: number;
        isLast: boolean;
    };

export type SearchFileListRow =
    | {
        kind: 'search-header';
        key: 'search-header';
        count: number;
    }
    | {
        kind: 'search-file';
        key: string;
        file: FileItem;
        index: number;
        isLast: boolean;
    };

export type FileListRow = GitFileListRow | SearchFileListRow;

export interface FileListRowLayout {
    length: number;
    offset: number;
    index: number;
}

function scaleItemMeasurement(value: number, scale: number): number {
    return Math.max(1, Math.round(value * scale));
}

export function buildFileListRowLayouts(
    rows: readonly FileListRow[],
    itemScale: number,
    hairlineWidth = 1,
): FileListRowLayout[] {
    const fileContentHeight = scaleItemMeasurement(24, itemScale)
        + scaleItemMeasurement(20, itemScale)
        + (2 * scaleItemMeasurement(16, itemScale));
    let offset = 0;

    return rows.map((row, index) => {
        const length = row.kind === 'section'
            ? 34
            : row.kind === 'search-header'
                ? 42
                : fileContentHeight + (row.isLast ? 0 : hairlineWidth);
        const layout = { length, offset, index };
        offset += length;
        return layout;
    });
}

export function buildGitFileListRows(
    stagedFiles: readonly GitFileStatus[],
    unstagedFiles: readonly GitFileStatus[],
    showSectionHeaders: boolean,
): GitFileListRow[] {
    const rows: GitFileListRow[] = [];
    let fileIndex = 0;

    const appendSection = (files: readonly GitFileStatus[], source: GitFileSource) => {
        if (files.length === 0) return;

        if (showSectionHeaders) {
            rows.push({
                kind: 'section',
                key: `section:${source}`,
                source,
                count: files.length,
            });
        }

        files.forEach((file, sectionIndex) => {
            rows.push({
                kind: 'git-file',
                key: `git:${source}:${file.fullPath}:${sectionIndex}`,
                source,
                file,
                fileIndex,
                sectionIndex,
                isLast: sectionIndex === files.length - 1 && source === 'unstaged',
            });
            fileIndex += 1;
        });
    };

    appendSection(stagedFiles, 'staged');
    appendSection(unstagedFiles, 'unstaged');

    if (unstagedFiles.length === 0) {
        const lastRow = rows.at(-1);
        if (lastRow?.kind === 'git-file') lastRow.isLast = true;
    }

    return rows;
}

export function buildSearchFileListRows(
    files: readonly FileItem[],
    showHeader: boolean,
): SearchFileListRow[] {
    const rows: SearchFileListRow[] = showHeader && files.length > 0
        ? [{ kind: 'search-header', key: 'search-header', count: files.length }]
        : [];

    files.forEach((file, index) => {
        rows.push({
            kind: 'search-file',
            key: `search:${file.fullPath}:${index}`,
            file,
            index,
            isLast: index === files.length - 1,
        });
    });

    return rows;
}
