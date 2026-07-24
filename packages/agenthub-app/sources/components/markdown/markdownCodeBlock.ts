import type { MarkdownBlock } from './parseMarkdown';

export type MarkdownSelectionTarget = {
    content: string;
    mode: 'markdown' | 'code';
    language: string | null;
};

export function getMarkdownCodeBlockPresentation(language: string | null): {
    label: string;
    showLineNumbers: boolean;
} {
    return {
        label: language?.trim() || 'text',
        showLineNumbers: true,
    };
}

export function getMarkdownCodeBlockLines(content: string): Array<{
    lineNumber: number;
    text: string;
}> {
    const lines = content.split('\n');
    return lines.map((text, index) => ({
        lineNumber: index + 1,
        text,
    }));
}

export function getMarkdownCodeSelectionRendering() {
    return {
        renderer: 'syntax-highlighter',
        selectable: true,
        overlayInput: false,
    } as const;
}

export function getMarkdownCodeBlockLayout(content: string, options: {
    lineHeight: number;
    minWidth: number;
    horizontalPadding: number;
    charWidth: number;
}): {
    lineHeight: number;
    minHeight: number;
    minWidth: number;
} {
    const lines = getMarkdownCodeBlockLines(content);
    const longestLine = lines.reduce((longest, line) => Math.max(longest, line.text.length), 0);

    return {
        lineHeight: options.lineHeight,
        minHeight: Math.max(options.lineHeight, lines.length * options.lineHeight),
        minWidth: Math.max(options.minWidth, longestLine * options.charWidth + options.horizontalPadding),
    };
}

export function getMarkdownSelectionTarget(block: MarkdownBlock, fullMarkdown: string): MarkdownSelectionTarget {
    if (block.type === 'code-block') {
        return {
            content: block.content,
            mode: 'code',
            language: block.language,
        };
    }

    if (block.type === 'mermaid') {
        return {
            content: block.content,
            mode: 'code',
            language: 'mermaid',
        };
    }

    return {
        content: fullMarkdown,
        mode: 'markdown',
        language: null,
    };
}

export function buildTextSelectionRoute(textId: string, target: Pick<MarkdownSelectionTarget, 'mode' | 'language'>): string {
    const params = [`textId=${encodeURIComponent(textId)}`];

    if (target.mode === 'code') {
        params.push('mode=code');
        if (target.language) {
            params.push(`language=${encodeURIComponent(target.language)}`);
        }
    }

    return `/text-selection?${params.join('&')}`;
}
