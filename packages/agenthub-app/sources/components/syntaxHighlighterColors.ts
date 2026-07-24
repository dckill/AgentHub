import type { Theme } from '@/theme';

export type SyntaxHighlighterSurface = 'default' | 'terminal';

export function getSyntaxHighlighterColors(theme: Theme, surface: SyntaxHighlighterSurface = 'default') {
    if (surface === 'terminal') {
        return {
            keyword: '#7DB7FF',
            controlFlow: '#7DB7FF',
            type: '#7DB7FF',
            modifier: '#7DB7FF',
            string: '#7FE39F',
            number: '#FFD17A',
            boolean: '#FFD17A',
            regex: '#7FE39F',
            function: '#FFD17A',
            method: '#FFD17A',
            property: theme.colors.terminal.stdout,
            comment: '#B8B0A3',
            docstring: '#B8B0A3',
            operator: theme.colors.terminal.stdout,
            assignment: '#7DB7FF',
            comparison: '#7DB7FF',
            logical: '#7DB7FF',
            bracket1: theme.colors.accent,
            bracket2: '#7DB7FF',
            bracket3: '#7FE39F',
            bracket4: '#FFB86C',
            bracket5: '#D7C3FF',
            decorator: '#7DB7FF',
            import: '#7DB7FF',
            variable: theme.colors.terminal.stdout,
            parameter: theme.colors.terminal.stdout,
            default: theme.colors.terminal.stdout,
            punctuation: theme.colors.terminal.stdout,
        };
    }

    const keyword = theme.dark ? theme.colors.syntaxKeyword : '#2867C4';
    const comment = theme.dark ? theme.colors.syntaxComment : theme.colors.textSecondary;

    return {
        keyword,
        controlFlow: keyword,
        type: keyword,
        modifier: keyword,
        string: theme.colors.syntaxString,
        number: theme.colors.syntaxNumber,
        boolean: theme.colors.syntaxNumber,
        regex: theme.colors.syntaxString,
        function: theme.colors.syntaxFunction,
        method: theme.colors.syntaxFunction,
        property: theme.colors.syntaxDefault,
        comment,
        docstring: comment,
        operator: theme.colors.syntaxDefault,
        assignment: keyword,
        comparison: keyword,
        logical: keyword,
        bracket1: theme.colors.syntaxBracket1,
        bracket2: theme.colors.syntaxBracket2,
        bracket3: theme.colors.syntaxBracket3,
        bracket4: theme.colors.syntaxBracket4,
        bracket5: theme.colors.syntaxBracket5,
        decorator: keyword,
        import: keyword,
        variable: theme.colors.syntaxDefault,
        parameter: theme.colors.syntaxDefault,
        default: theme.colors.syntaxDefault,
        punctuation: theme.colors.syntaxDefault,
    };
}
