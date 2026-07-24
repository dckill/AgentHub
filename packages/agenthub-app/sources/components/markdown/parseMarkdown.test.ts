import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './parseMarkdown';

describe('parseMarkdown', () => {
    it('parses unordered lists across common markdown bullet markers and preserves clickable links', () => {
        const blocks = parseMarkdown([
            '* first item',
            '+ second item with [docs](https://example.com/docs)',
            '- third item with https://example.com/raw.',
        ].join('\n'));

        expect(blocks).toHaveLength(1);
        expect(blocks[0]?.type).toBe('list');

        if (blocks[0]?.type !== 'list') {
            throw new Error('Expected markdown list block');
        }

        expect(blocks[0].items).toHaveLength(3);
        expect(blocks[0].items[1]).toEqual([
            { styles: [], text: 'second item with ', url: null },
            { styles: [], text: 'docs', url: 'https://example.com/docs' },
        ]);
        expect(blocks[0].items[2]).toEqual([
            { styles: [], text: 'third item with ', url: null },
            { styles: [], text: 'https://example.com/raw', url: 'https://example.com/raw' },
            { styles: [], text: '.', url: null },
        ]);
    });

    it('parses standalone markdown image blocks', () => {
        const blocks = parseMarkdown('![Markdown renderable image](data:image/png;base64,abc123)');

        expect(blocks).toEqual([
            {
                type: 'image',
                alt: 'Markdown renderable image',
                url: 'data:image/png;base64,abc123',
            },
        ]);
    });

    it('auto-linkifies bare URLs in text blocks', () => {
        const blocks = parseMarkdown('Visit https://example.com/docs for more.');

        expect(blocks).toHaveLength(1);
        expect(blocks[0]?.type).toBe('text');

        if (blocks[0]?.type !== 'text') {
            throw new Error('Expected markdown text block');
        }

        expect(blocks[0].content).toEqual([
            { styles: [], text: 'Visit ', url: null },
            { styles: [], text: 'https://example.com/docs', url: 'https://example.com/docs' },
            { styles: [], text: ' for more.', url: null },
        ]);
    });

    it('drops empty fenced code blocks instead of producing blank code cards', () => {
        expect(parseMarkdown('```ts\n```')).toEqual([]);
        expect(parseMarkdown('```bash\n    \n```')).toEqual([]);
        expect(parseMarkdown('```text')).toEqual([]);
    });

    it('preserves non-empty fenced code blocks with their language', () => {
        const blocks = parseMarkdown('```ts\nconst answer = 42;\n```');

        expect(blocks).toEqual([
            {
                type: 'code-block',
                language: 'ts',
                content: 'const answer = 42;',
            },
        ]);
    });

    it('parses task lists, blockquotes, and strikethrough spans', () => {
        const blocks = parseMarkdown([
            '- [x] ~~old~~ task',
            '- [ ] new task',
            '',
            '> quoted **note**',
            '> second line',
        ].join('\n'));

        expect(blocks).toHaveLength(2);
        expect(blocks[0]).toEqual({
            type: 'task-list',
            items: [
                {
                    checked: true,
                    spans: [
                        { styles: ['strikethrough'], text: 'old', url: null },
                        { styles: [], text: ' task', url: null },
                    ],
                },
                {
                    checked: false,
                    spans: [{ styles: [], text: 'new task', url: null }],
                },
            ],
        });
        expect(blocks[1]).toEqual({
            type: 'blockquote',
            content: [
                { styles: [], text: 'quoted ', url: null },
                { styles: ['bold'], text: 'note', url: null },
                { styles: [], text: '\nsecond line', url: null },
            ],
        });
    });
});
