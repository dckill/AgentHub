import React from 'react';
import { Platform, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { resolveSyntaxHighlighterMode } from './syntaxHighlighterMode';
import { getSyntaxHighlighterColors, type SyntaxHighlighterSurface } from './syntaxHighlighterColors';
import { getCodeBlockVisuals } from './codeSurfaceVisuals';

interface SimpleSyntaxHighlighterProps {
    code: string;
    language: string | null;
    selectable: boolean;
    showLineNumbers?: boolean;
    scaleMultiplier?: number;
    virtualized?: boolean;
    surface?: SyntaxHighlighterSurface;
    wrapLines?: boolean;
    accessibilityLabel?: string;
}

interface Token {
    text: string;
    type: string;
    nestLevel?: number;
}

interface HighlightedLine {
    lineNumber: number;
    tokens: Token[];
}

// Bracket pairs for nesting detection
const bracketPairs = {
    '(': ')',
    '[': ']',
    '{': '}',
    '<': '>',
};

const openBrackets = Object.keys(bracketPairs);
const closeBrackets = Object.values(bracketPairs);

// Enhanced tokenizer with comprehensive token types
const tokenizeCode = (code: string, language: string | null): Token[] => {
    const tokens: Token[] = [];

    if (!language) {
        return [{ text: code, type: 'default' }];
    }

    const lang = language.toLowerCase();

    const keywordSets = {
        controlFlow: ['if', 'else', 'elif', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'return', 'yield', 'try', 'catch', 'finally', 'throw', 'with'],
        keywords: ['function', 'const', 'let', 'var', 'def', 'class', 'interface', 'enum', 'struct', 'union', 'namespace', 'module'],
        types: ['int', 'string', 'bool', 'float', 'double', 'char', 'void', 'any', 'unknown', 'never', 'object', 'array', 'number', 'boolean'],
        modifiers: ['public', 'private', 'protected', 'static', 'final', 'abstract', 'virtual', 'override', 'async', 'await', 'export', 'default'],
        boolean: ['true', 'false', 'null', 'undefined', 'None', 'True', 'False', 'nil'],
        imports: ['import', 'from', 'export', 'require', 'include', 'using', 'package'],
    };

    if (lang === 'python' || lang === 'py') {
        keywordSets.keywords.push('def', 'lambda', 'pass', 'global', 'nonlocal', 'as', 'in', 'is', 'not', 'and', 'or');
        keywordSets.types.push('str', 'list', 'dict', 'tuple', 'set');
    } else if (lang === 'typescript' || lang === 'ts') {
        keywordSets.types.push('Record', 'Partial', 'Required', 'Readonly', 'Pick', 'Omit');
        keywordSets.keywords.push('type', 'interface', 'extends', 'implements', 'keyof', 'typeof');
    } else if (lang === 'java') {
        keywordSets.keywords.push('package', 'extends', 'implements', 'super', 'this');
        keywordSets.modifiers.push('synchronized', 'transient', 'volatile', 'native', 'strictfp');
    }

    const patterns = [
        { regex: /(\/\*[\s\S]*?\*\/)/g, type: 'comment' },
        { regex: /(\/\/.*$)/gm, type: 'comment' },
        { regex: /(#.*$)/gm, type: 'comment' },
        { regex: /("""[\s\S]*?"""|'''[\s\S]*?''')/g, type: 'docstring' },

        { regex: /(r?["'`])((?:(?!\1)[^\\]|\\.)*)(\1)/g, type: 'string' },
        { regex: /(\/(?:[^\/\\\n]|\\.)+\/[gimuy]*)/g, type: 'regex' },

        { regex: /\b(0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g, type: 'number' },

        { regex: /@\w+/g, type: 'decorator' },

        { regex: /\b(function|def|async function)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g, type: 'function', captureGroup: 2 },
        { regex: /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g, type: 'function' },

        { regex: /\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g, type: 'method', captureGroup: 1 },
        { regex: /\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g, type: 'property', captureGroup: 1 },

        { regex: new RegExp(`\\b(${keywordSets.imports.join('|')})\\b`, 'g'), type: 'import' },
        { regex: new RegExp(`\\b(${keywordSets.controlFlow.join('|')})\\b`, 'g'), type: 'controlFlow' },
        { regex: new RegExp(`\\b(${keywordSets.keywords.join('|')})\\b`, 'g'), type: 'keyword' },
        { regex: new RegExp(`\\b(${keywordSets.types.join('|')})\\b`, 'g'), type: 'type' },
        { regex: new RegExp(`\\b(${keywordSets.modifiers.join('|')})\\b`, 'g'), type: 'modifier' },
        { regex: new RegExp(`\\b(${keywordSets.boolean.join('|')})\\b`, 'g'), type: 'boolean' },

        { regex: /(===|!==|==|!=|<=|>=|<|>)/g, type: 'comparison' },
        { regex: /(&&|\|\||!)/g, type: 'logical' },
        { regex: /(=|\+=|\-=|\*=|\/=|%=|\|=|&=|\^=)/g, type: 'assignment' },
        { regex: /(\+|\-|\*|\/|%|\*\*)/g, type: 'operator' },
        { regex: /(\?|:)/g, type: 'operator' },

        { regex: /([()[\]{}])/g, type: 'bracket' },
        { regex: /([.,;])/g, type: 'punctuation' },
    ];

    const calculateBracketNesting = (code: string) => {
        const nestingMap = new Map<number, number>();
        const stack: Array<{ char: string; pos: number }> = [];

        for (let i = 0; i < code.length; i++) {
            const char = code[i];

            if (openBrackets.includes(char)) {
                stack.push({ char, pos: i });
                nestingMap.set(i, stack.length);
            } else if (closeBrackets.includes(char)) {
                if (stack.length > 0) {
                    const lastOpen = stack.pop();
                    if (lastOpen && bracketPairs[lastOpen.char as keyof typeof bracketPairs] === char) {
                        nestingMap.set(i, stack.length + 1);
                    }
                }
            }
        }

        return nestingMap;
    };

    const nestingMap = calculateBracketNesting(code);

    const lines = code.split('\n');
    let globalOffset = 0;

    lines.forEach((line, lineIndex) => {
        if (lineIndex > 0) {
            tokens.push({ text: '\n', type: 'default' });
            globalOffset += 1;
        }

        const lineTokens: Array<{ start: number; end: number; type: string; text: string; captureGroup?: number }> = [];

        patterns.forEach(pattern => {
            let match;
            pattern.regex.lastIndex = 0;
            while ((match = pattern.regex.exec(line)) !== null) {
                const tokenText = pattern.captureGroup ? match[pattern.captureGroup] : match[0];
                const tokenStart = pattern.captureGroup ? match.index + match[0].indexOf(tokenText) : match.index;

                lineTokens.push({
                    start: tokenStart,
                    end: tokenStart + tokenText.length,
                    type: pattern.type,
                    text: tokenText,
                    captureGroup: pattern.captureGroup
                });
            }
        });

        lineTokens.sort((a, b) => a.start - b.start);

        const filteredTokens: typeof lineTokens = [];
        let lastEnd = 0;
        lineTokens.forEach(token => {
            if (token.start >= lastEnd) {
                filteredTokens.push(token);
                lastEnd = token.end;
            }
        });

        let currentIndex = 0;
        filteredTokens.forEach(token => {
            if (token.start > currentIndex) {
                const beforeText = line.slice(currentIndex, token.start);
                if (beforeText) {
                    tokens.push({ text: beforeText, type: 'default' });
                }
            }

            if (token.type === 'bracket') {
                const globalPos = globalOffset + token.start;
                const nestLevel = nestingMap.get(globalPos) || 1;
                tokens.push({
                    text: token.text,
                    type: token.type,
                    nestLevel: nestLevel
                });
            } else {
                tokens.push({ text: token.text, type: token.type });
            }

            currentIndex = token.end;
        });

        if (currentIndex < line.length) {
            const remainingText = line.slice(currentIndex);
            if (remainingText) {
                tokens.push({ text: remainingText, type: 'default' });
            }
        }

        globalOffset += line.length;
    });

    return tokens;
};

const groupTokensByLine = (tokens: Token[]): HighlightedLine[] => {
    const lines: HighlightedLine[] = [];
    let currentTokens: Token[] = [];

    for (const token of tokens) {
        if (token.text === '\n') {
            lines.push({ lineNumber: lines.length + 1, tokens: currentTokens });
            currentTokens = [];
        } else if (token.text.includes('\n')) {
            // Token contains embedded newlines (e.g. when language is null)
            const parts = token.text.split('\n');
            for (let i = 0; i < parts.length; i++) {
                if (parts[i]) {
                    currentTokens.push({ text: parts[i], type: token.type, nestLevel: token.nestLevel });
                }
                if (i < parts.length - 1) {
                    lines.push({ lineNumber: lines.length + 1, tokens: currentTokens });
                    currentTokens = [];
                }
            }
        } else {
            currentTokens.push(token);
        }
    }
    lines.push({ lineNumber: lines.length + 1, tokens: currentTokens });

    return lines;
};

const getCodeStyle = (multiplier: number = 1.0) => ({
    fontFamily: Typography.mono().fontFamily,
    fontSize: Math.max(1, Math.round(14 * multiplier)),
    lineHeight: Math.max(1, Math.round(22 * multiplier)),
});

function getLineNumberWidth(lines: HighlightedLine[], multiplier: number): number {
    const maxLineNumber = lines.length > 0 ? lines[lines.length - 1].lineNumber : 1;
    const digitCount = String(maxLineNumber).length;
    const fontSize = Math.max(1, Math.round(14 * multiplier));
    return Math.max(
        Math.round(38 * multiplier),
        Math.ceil(digitCount * fontSize * 0.62) + Math.round(20 * multiplier),
    );
}

export const SimpleSyntaxHighlighter: React.FC<SimpleSyntaxHighlighterProps> = ({
    code,
    language,
    selectable,
    showLineNumbers = false,
    scaleMultiplier = 1.0,
    virtualized = true,
    surface = 'default',
    wrapLines = true,
    accessibilityLabel,
}) => {
    const { theme } = useUnistyles();
    const colors = getSyntaxHighlighterColors(theme, surface);
    const blockVisuals = getCodeBlockVisuals(theme);
    const tokens = React.useMemo(() => tokenizeCode(code, language), [code, language]);
    const lines = React.useMemo(() => groupTokensByLine(tokens), [tokens]);

    const getColorForType = React.useCallback((type: string, nestLevel?: number): string => {
        switch (type) {
            case 'keyword': return colors.keyword;
            case 'controlFlow': return colors.controlFlow;
            case 'type': return colors.type;
            case 'modifier': return colors.modifier;
            case 'string': return colors.string;
            case 'number': return colors.number;
            case 'boolean': return colors.boolean;
            case 'regex': return colors.regex;
            case 'function': return colors.function;
            case 'method': return colors.method;
            case 'property': return colors.property;
            case 'comment': return colors.comment;
            case 'docstring': return colors.docstring;
            case 'operator': return colors.operator;
            case 'assignment': return colors.assignment;
            case 'comparison': return colors.comparison;
            case 'logical': return colors.logical;
            case 'decorator': return colors.decorator;
            case 'import': return colors.import;
            case 'variable': return colors.variable;
            case 'parameter': return colors.parameter;
            case 'punctuation': return colors.punctuation;
            case 'bracket':
                switch ((nestLevel || 1) % 5) {
                    case 1: return colors.bracket1;
                    case 2: return colors.bracket2;
                    case 3: return colors.bracket3;
                    case 4: return colors.bracket4;
                    case 0: return colors.bracket5;
                    default: return colors.bracket1;
                }
            default: return colors.default;
        }
    }, [colors]);

    const codeStyle = getCodeStyle(scaleMultiplier);
    const lineNumberWidth = React.useMemo(() => getLineNumberWidth(lines, scaleMultiplier), [lines, scaleMultiplier]);
    const mode = resolveSyntaxHighlighterMode(wrapLines ? virtualized : false);

    const renderItem = React.useCallback(({ item }: { item: HighlightedLine }) => {
        const fontWeight = item.tokens.some(t => ['keyword', 'controlFlow', 'type', 'function'].includes(t.type)) ? '600' : undefined;
        const minHeight = Math.max(1, codeStyle.lineHeight);

        return (
            <View style={[
                { flexDirection: 'row', minHeight },
                !wrapLines && { alignSelf: 'flex-start', minWidth: '100%' },
            ]}>
                {showLineNumbers && (
                    <View style={{
                        width: lineNumberWidth,
                        alignItems: 'flex-end',
                        paddingRight: Math.max(1, Math.round(10 * scaleMultiplier)),
                        backgroundColor: blockVisuals.gutterBackgroundColor,
                        borderRightWidth: 1,
                        borderRightColor: blockVisuals.gutterBorderColor,
                    }}>
                        <Text style={{
                            ...codeStyle,
                            color: theme.colors.diff.lineNumberText,
                        }}>
                            {item.lineNumber}
                        </Text>
                    </View>
                )}
                <Text
                    selectable={selectable}
                    style={[{
                        ...codeStyle,
                        fontWeight: fontWeight as any,
                        paddingLeft: showLineNumbers ? Math.max(1, Math.round(12 * scaleMultiplier)) : 0,
                        paddingRight: showLineNumbers ? Math.max(1, Math.round(16 * scaleMultiplier)) : 0,
                    }, wrapLines ? {
                        flex: 1,
                        minWidth: 0,
                    } : {
                        flexGrow: 0,
                        flexShrink: 0,
                        ...(Platform.OS === 'web' ? ({ whiteSpace: 'pre' } as any) : null),
                    }]}
                >
                    {item.tokens.length === 0 ? ' ' : item.tokens.map((token, index) => (
                        <Text
                            key={index}
                            selectable={selectable}
                            style={{
                                color: getColorForType(token.type, token.nestLevel),
                                fontFamily: codeStyle.fontFamily,
                                fontWeight: ['keyword', 'controlFlow', 'type', 'function'].includes(token.type) ? '600' : '400',
                            }}
                        >
                            {token.text}
                        </Text>
                    ))}
                </Text>
            </View>
        );
    }, [selectable, showLineNumbers, theme, codeStyle, getColorForType, scaleMultiplier, lineNumberWidth, blockVisuals]);

    if (mode === 'inline') {
        return (
            <View
                style={{ alignSelf: 'flex-start', minWidth: '100%' }}
                accessibilityLabel={accessibilityLabel}
                role={accessibilityLabel ? 'region' : undefined}
                tabIndex={Platform.OS === 'web' && accessibilityLabel ? 0 : undefined}
            >
                {lines.map((line) => (
                    <React.Fragment key={line.lineNumber}>
                        {renderItem({ item: line })}
                    </React.Fragment>
                ))}
            </View>
        );
    }

    return (
        <FlashList
            data={lines}
            renderItem={renderItem}
            keyExtractor={(item) => String(item.lineNumber)}
            removeClippedSubviews={true}
            showsVerticalScrollIndicator={true}
            accessibilityLabel={accessibilityLabel}
            role={accessibilityLabel ? 'region' : undefined}
            tabIndex={Platform.OS === 'web' && accessibilityLabel ? 0 : undefined}
        />
    );
};
