import { describe, expect, it } from 'vitest';

import { lightTheme } from '@/theme';
import { getSyntaxHighlighterColors } from './syntaxHighlighterColors';
import { resolveSyntaxHighlighterMode } from './syntaxHighlighterMode';

describe('SimpleSyntaxHighlighter', () => {
    it('uses virtualized rendering by default and allows inline rendering for nested markdown code blocks', () => {
        expect(resolveSyntaxHighlighterMode()).toBe('virtualized');
        expect(resolveSyntaxHighlighterMode(true)).toBe('virtualized');
        expect(resolveSyntaxHighlighterMode(false)).toBe('inline');
    });

    it('uses terminal-readable syntax colors on terminal code surfaces', () => {
        expect(getSyntaxHighlighterColors(lightTheme, 'terminal')).toMatchObject({
            default: lightTheme.colors.terminal.stdout,
            keyword: '#7DB7FF',
            string: '#7FE39F',
            function: '#FFD17A',
            comment: '#B8B0A3',
        });
    });

    it('uses contrast-safe comments and keywords on light code surfaces', () => {
        expect(getSyntaxHighlighterColors(lightTheme, 'default')).toMatchObject({
            keyword: '#2867C4',
            controlFlow: '#2867C4',
            comment: lightTheme.colors.textSecondary,
            docstring: lightTheme.colors.textSecondary,
        });
    });
});
