import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
    path.join(process.cwd(), 'sources/components/FilePreviewPanel.tsx'),
    'utf8',
);

describe('file preview accessibility boundary', () => {
    it('names and sizes the download and close header actions', () => {
        expect(source).toMatch(/<Pressable[\s\S]{0,180}accessibilityRole="button"[\s\S]{0,160}accessibilityLabel=\{t\('fileBrowser\.downloadToDevice'\)\}/);
        expect(source).toMatch(/<Pressable[\s\S]{0,180}accessibilityRole="button"[\s\S]{0,160}accessibilityLabel=\{t\('common\.close'\)\}/);
        expect(source).toMatch(/closeBtn:\s*\{[\s\S]{0,100}width: 44,[\s\S]{0,60}height: 44,/);
    });

    it('exposes the markdown source and preview modes as selected tabs', () => {
        expect(source).toContain('accessibilityRole="tablist"');
        expect(source.match(/accessibilityRole="tab"/g)).toHaveLength(2);
        expect(source).toContain("accessibilityState={{ selected: markdownMode === 'source' }}");
        expect(source).toContain("accessibilityState={{ selected: markdownMode === 'preview' }}");
        expect(source).toContain("aria-selected={markdownMode === 'source'}");
        expect(source).toContain("aria-selected={markdownMode === 'preview'}");
        expect(source).toMatch(/markdownModeButton:\s*\{[\s\S]{0,120}minHeight: 44,/);
    });

    it('names the keyboard-focusable code preview region with the selected file', () => {
        expect(source).toContain("accessibilityLabel={`${t('files.preview')}: ${fileName}`}");
    });

    it('does not expose raw backend error text as user-facing preview copy', () => {
        const catchStart = source.indexOf('} catch (e) {');
        const catchEnd = source.indexOf('\n            }', catchStart);
        const catchBlock = source.slice(catchStart, catchEnd);

        expect(catchBlock).toContain("t('directoryTree.loadFailed')");
        expect(catchBlock).not.toContain('e.message');
    });
});
