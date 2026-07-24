import type { TextProps, TextStyle, ViewStyle } from 'react-native';

export interface DiffCodeRowLayout {
    rowStyle: ViewStyle;
    codeTextStyle: TextStyle;
    contentTextProps: Pick<TextProps, 'numberOfLines'>;
}

export function getDiffCodeRowLayout(
    wrapLines: boolean,
    options: { preserveWhitespace?: boolean } = {},
): DiffCodeRowLayout {
    if (wrapLines) {
        return {
            rowStyle: {
                alignSelf: 'stretch',
                minWidth: '100%',
            },
            codeTextStyle: {
                flex: 1,
                minWidth: 0,
            },
            contentTextProps: {
                numberOfLines: undefined,
            },
        };
    }

    return {
        rowStyle: {
            alignSelf: 'flex-start',
            minWidth: '100%',
        },
        codeTextStyle: {
            flexGrow: 0,
            flexShrink: 0,
            ...(options.preserveWhitespace ? ({ whiteSpace: 'pre' } as TextStyle) : null),
        },
        contentTextProps: {
            numberOfLines: undefined,
        },
    };
}
