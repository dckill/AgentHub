export type SyntaxHighlighterMode = 'virtualized' | 'inline';

export function resolveSyntaxHighlighterMode(virtualized = true): SyntaxHighlighterMode {
    return virtualized ? 'virtualized' : 'inline';
}
