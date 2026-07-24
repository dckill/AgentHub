import { describe, expect, it } from 'vitest';

import {
    buildTextSelectionRoute,
    getMarkdownCodeBlockLayout,
    getMarkdownCodeBlockLines,
    getMarkdownCodeBlockPresentation,
    getMarkdownCodeSelectionRendering,
    getMarkdownSelectionTarget,
} from './markdownCodeBlock';

describe('getMarkdownCodeBlockPresentation', () => {
    it('uses the fenced language as the compact code block title', () => {
        expect(getMarkdownCodeBlockPresentation('ts')).toEqual({
            label: 'ts',
            showLineNumbers: true,
        });
    });

    it('falls back to text when a fenced code block has no language', () => {
        expect(getMarkdownCodeBlockPresentation(null)).toEqual({
            label: 'text',
            showLineNumbers: true,
        });
    });

    it('splits code content into numbered selectable rows', () => {
        expect(getMarkdownCodeBlockLines('const a = 1;\n\nreturn a;')).toEqual([
            { lineNumber: 1, text: 'const a = 1;' },
            { lineNumber: 2, text: '' },
            { lineNumber: 3, text: 'return a;' },
        ]);
    });

    it('targets only the code content when opening selection from a code block', () => {
        const markdown = 'Before\n```ts\nconst a = 1;\n```\nAfter';

        expect(getMarkdownSelectionTarget({
            type: 'code-block',
            language: 'ts',
            content: 'const a = 1;',
        }, markdown)).toEqual({
            content: 'const a = 1;',
            mode: 'code',
            language: 'ts',
        });
    });

    it('targets mermaid blocks as standalone code selection', () => {
        expect(getMarkdownSelectionTarget({
            type: 'mermaid',
            content: 'graph TD\nA-->B',
        }, 'ignored')).toEqual({
            content: 'graph TD\nA-->B',
            mode: 'code',
            language: 'mermaid',
        });
    });

    it('keeps non-code block selection scoped to the full markdown message', () => {
        const markdown = 'Hello **world**';

        expect(getMarkdownSelectionTarget({
            type: 'text',
            content: [{ styles: [], text: 'Hello world', url: null }],
        }, markdown)).toEqual({
            content: markdown,
            mode: 'markdown',
            language: null,
        });
    });

    it('builds a code selection route with encoded params', () => {
        expect(buildTextSelectionRoute('temp id', {
            mode: 'code',
            language: 'c++',
        })).toBe('/text-selection?textId=temp%20id&mode=code&language=c%2B%2B');
    });

    it('uses selectable syntax-highlighted text for code detail selection', () => {
        expect(getMarkdownCodeSelectionRendering()).toEqual({
            renderer: 'syntax-highlighter',
            selectable: true,
            overlayInput: false,
        });
    });

    it('calculates stable detail layout metrics from code content', () => {
        expect(getMarkdownCodeBlockLayout('a\nlonger line', {
            lineHeight: 20,
            minWidth: 240,
            horizontalPadding: 24,
            charWidth: 8.5,
        })).toEqual({
            lineHeight: 20,
            minHeight: 40,
            minWidth: 240,
        });
    });
});
