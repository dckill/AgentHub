import { describe, expect, it } from 'vitest';

import { detectLanguageFromPath, isMarkdownFilePath } from './fileLanguage';

describe('fileLanguage', () => {
    it('detects source languages from extensions and well-known filenames', () => {
        expect(detectLanguageFromPath('/repo/src/App.tsx')).toBe('typescript');
        expect(detectLanguageFromPath('/repo/Dockerfile')).toBe('docker');
        expect(detectLanguageFromPath('/repo/Makefile')).toBe('makefile');
        expect(detectLanguageFromPath('/repo/README.md')).toBe('markdown');
    });

    it('detects markdown previewable paths', () => {
        expect(isMarkdownFilePath('/repo/docs/guide.md')).toBe(true);
        expect(isMarkdownFilePath('/repo/docs/guide.mdx')).toBe(true);
        expect(isMarkdownFilePath('/repo/src/guide.ts')).toBe(false);
    });
});
