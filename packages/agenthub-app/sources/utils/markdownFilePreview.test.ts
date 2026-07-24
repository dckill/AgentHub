import { describe, expect, it } from 'vitest';

import {
    applyMarkdownImageMap,
    collectMarkdownImageUrls,
    getMarkdownFilePreviewContent,
    normalizeMarkdownHtml,
    resolveMarkdownAssetPath,
} from './markdownFilePreview';

describe('markdownFilePreview', () => {
    it('normalizes common html markdown fragments into markdown', () => {
        const normalized = normalizeMarkdownHtml('<h2>Title</h2><p>Hello <strong>AgentHub</strong></p><img src="./asset.png" alt="Preview">');

        expect(normalized).toContain('## Title');
        expect(normalized).toContain('Hello **AgentHub**');
        expect(normalized).toContain('![Preview](./asset.png)');
    });

    it('collects markdown and html image urls', () => {
        expect(collectMarkdownImageUrls('![A](./a.png)\n<img src="../b.svg" alt="B">')).toEqual(['./a.png', '../b.svg']);
    });

    it('resolves local asset paths relative to the markdown file', () => {
        expect(resolveMarkdownAssetPath('../assets/logo.png?raw#hash', '/repo/docs/readme.md')).toBe('/repo/assets/logo.png');
        expect(resolveMarkdownAssetPath('https://example.com/logo.png', '/repo/docs/readme.md')).toBeNull();
    });

    it('applies image maps after html normalization', () => {
        const mapped = getMarkdownFilePreviewContent('<img src="./asset.png" alt="Preview">', {
            './asset.png': 'data:image/png;base64,abc',
        });

        expect(mapped).toBe(applyMarkdownImageMap('\n![Preview](./asset.png)\n', {
            './asset.png': 'data:image/png;base64,abc',
        }));
        expect(mapped).toContain('data:image/png;base64,abc');
    });
});
