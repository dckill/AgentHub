export type PatchLineKind = 'context' | 'add' | 'remove' | 'hunk' | 'file' | 'note';

export type PatchLine = {
    kind: PatchLineKind;
    text: string;
    marker: string;
    oldStart?: number;
    newStart?: number;
    oldLineNumber?: number;
    newLineNumber?: number;
};

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function parsePatchLines(patch: string): PatchLine[] {
    const lines = patch.split('\n');
    const parsed: PatchLine[] = [];
    let oldLineNumber: number | null = null;
    let newLineNumber: number | null = null;

    for (const line of lines) {
        const hunkMatch = line.match(HUNK_HEADER_RE);
        if (hunkMatch) {
            oldLineNumber = Number.parseInt(hunkMatch[1], 10);
            newLineNumber = Number.parseInt(hunkMatch[2], 10);
            parsed.push({
                kind: 'hunk',
                text: line,
                marker: '',
                oldStart: oldLineNumber,
                newStart: newLineNumber,
            });
            continue;
        }

        const isFileHeader =
            line.startsWith('+++') ||
            line.startsWith('---') ||
            line.startsWith('diff ') ||
            line.startsWith('index ') ||
            line.startsWith('new file') ||
            line.startsWith('deleted file') ||
            line.startsWith('rename ') ||
            line.startsWith('similarity ') ||
            line.startsWith('Binary files');

        if (isFileHeader) {
            parsed.push({ kind: 'file', text: line, marker: '' });
            continue;
        }

        if (line === '\\ No newline at end of file') {
            parsed.push({ kind: 'note', text: line, marker: '\\' });
            continue;
        }

        const first = line.charAt(0);
        if (first === '+') {
            parsed.push({
                kind: 'add',
                text: line.slice(1),
                marker: '+',
                newLineNumber: newLineNumber ?? undefined,
            });
            if (newLineNumber !== null) newLineNumber++;
            continue;
        }

        if (first === '-') {
            parsed.push({
                kind: 'remove',
                text: line.slice(1),
                marker: '-',
                oldLineNumber: oldLineNumber ?? undefined,
            });
            if (oldLineNumber !== null) oldLineNumber++;
            continue;
        }

        const text = first === ' ' ? line.slice(1) : line;
        parsed.push({
            kind: 'context',
            text,
            marker: ' ',
            oldLineNumber: oldLineNumber ?? undefined,
            newLineNumber: newLineNumber ?? undefined,
        });
        if (oldLineNumber !== null) oldLineNumber++;
        if (newLineNumber !== null) newLineNumber++;
    }

    return parsed;
}
