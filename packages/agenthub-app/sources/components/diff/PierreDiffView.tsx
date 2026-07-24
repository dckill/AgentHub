import * as React from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { calculateUnifiedDiff } from '@/components/diff/calculateDiff';
import { getDiffCodeRowLayout } from '@/components/diff/diffLineLayout';
import { parsePatchLines } from '@/components/diff/parsePatchLines';
import { HorizontalScrollView } from '@/components/HorizontalScrollView';
import { Typography } from '@/constants/Typography';
import { detectLanguageFromPath } from '@/utils/fileLanguage';

export interface PierreDiffViewProps {
    oldFile?: { name: string; contents: string };
    newFile?: { name: string; contents: string };
    /** Unified diff string — alternative to oldFile/newFile. */
    patch?: string;
    /** File name/path, used for syntax coloring when `patch` is supplied. */
    fileName?: string;
    diffStyle?: 'unified' | 'split';
    overflow?: 'scroll' | 'wrap';
    disableLineNumbers?: boolean;
    /** Hide Pierre's built-in file-name/stats header — useful when the surrounding UI already shows one. Web-only. */
    disableFileHeader?: boolean;
    /** Adds bounded vertical scrolling when the diff lives inside a full-screen reader frame. */
    scrollable?: boolean;
    /** Forces a theme override; defaults to the current app theme. */
    theme?: 'dark' | 'light';
    /** Multiplies diff font, line height, and gutters. Defaults to 1.0. */
    scaleMultiplier?: number;
    /** Replace Pierre's default header with custom React content. Web-only. */
    renderCustomHeader?: (fileDiff: any) => React.ReactNode;
}

export const PierreDiffView = React.memo(function PierreDiffView(props: PierreDiffViewProps) {
    return <EditorDiffView {...props} />;
});

type EditorDiffRow =
    | { kind: 'line'; change: 'context' | 'add' | 'remove'; text: string; oldLineNumber?: number; newLineNumber?: number }
    | { kind: 'fold'; count: number };

function getLineNumber(row: Extract<EditorDiffRow, { kind: 'line' }>): number | undefined {
    if (row.change === 'remove') return row.oldLineNumber;
    return row.newLineNumber ?? row.oldLineNumber;
}

function getLanguage(props: PierreDiffViewProps): string | null {
    const fileName = props.fileName ?? props.newFile?.name ?? props.oldFile?.name;
    return fileName ? detectLanguageFromPath(fileName) : null;
}

function getRowsFromPatch(patch: string): EditorDiffRow[] {
    const rows: EditorDiffRow[] = [];
    const lines = parsePatchLines(patch);
    let lastOldLine = 0;
    let lastNewLine = 0;

    for (const line of lines) {
        if (line.kind === 'file') continue;

        if (line.kind === 'hunk') {
            const nextOld = line.oldStart ?? 1;
            const nextNew = line.newStart ?? 1;
            const hidden = Math.max(nextOld - lastOldLine - 1, nextNew - lastNewLine - 1);
            if (hidden > 0) rows.push({ kind: 'fold', count: hidden });
            continue;
        }

        if (line.kind === 'note') {
            rows.push({ kind: 'line', change: 'context', text: line.text, oldLineNumber: lastOldLine || undefined, newLineNumber: lastNewLine || undefined });
            continue;
        }

        if (line.kind === 'add') {
            rows.push({ kind: 'line', change: 'add', text: line.text, newLineNumber: line.newLineNumber });
            if (line.newLineNumber != null) lastNewLine = line.newLineNumber;
            continue;
        }

        if (line.kind === 'remove') {
            rows.push({ kind: 'line', change: 'remove', text: line.text, oldLineNumber: line.oldLineNumber });
            if (line.oldLineNumber != null) lastOldLine = line.oldLineNumber;
            continue;
        }

        rows.push({
            kind: 'line',
            change: 'context',
            text: line.text,
            oldLineNumber: line.oldLineNumber,
            newLineNumber: line.newLineNumber,
        });
        if (line.oldLineNumber != null) lastOldLine = line.oldLineNumber;
        if (line.newLineNumber != null) lastNewLine = line.newLineNumber;
    }

    return rows;
}

function getRowsFromFiles(oldText: string, newText: string): EditorDiffRow[] {
    const { hunks } = calculateUnifiedDiff(oldText, newText, 3);
    const rows: EditorDiffRow[] = [];
    let lastOldLine = 0;
    let lastNewLine = 0;

    for (const hunk of hunks) {
        const hidden = Math.max(hunk.oldStart - lastOldLine - 1, hunk.newStart - lastNewLine - 1);
        if (hidden > 0) rows.push({ kind: 'fold', count: hidden });

        for (const line of hunk.lines) {
            if (line.type === 'add') {
                rows.push({ kind: 'line', change: 'add', text: line.content, newLineNumber: line.newLineNumber });
            } else if (line.type === 'remove') {
                rows.push({ kind: 'line', change: 'remove', text: line.content, oldLineNumber: line.oldLineNumber });
            } else {
                rows.push({
                    kind: 'line',
                    change: 'context',
                    text: line.content,
                    oldLineNumber: line.oldLineNumber,
                    newLineNumber: line.newLineNumber,
                });
            }
        }

        const lastLine = hunk.lines[hunk.lines.length - 1];
        if (lastLine?.oldLineNumber != null) lastOldLine = lastLine.oldLineNumber;
        if (lastLine?.newLineNumber != null) lastNewLine = lastLine.newLineNumber;
    }

    return rows;
}

function EditorDiffView(props: PierreDiffViewProps) {
    const { theme } = useUnistyles();
    const wrapLines = props.overflow === 'wrap';
    const showLineNumbers = !props.disableLineNumbers;
    const language = getLanguage(props);
    const scaleMultiplier = props.scaleMultiplier ?? 1;

    const rows = React.useMemo(() => {
        if (props.patch) return getRowsFromPatch(props.patch);
        if (props.oldFile && props.newFile) {
            return getRowsFromFiles(props.oldFile.contents, props.newFile.contents);
        }
        return [];
    }, [props.newFile, props.oldFile, props.patch]);

    const renderedLines = rows.map((row, i) => row.kind === 'fold'
        ? <FoldRow key={`fold-${i}`} count={row.count} showLineNumbers={showLineNumbers} scaleMultiplier={scaleMultiplier} />
        : (
            <DiffCodeRow
                key={`line-${i}`}
                row={row}
                language={language}
                wrapLines={wrapLines}
                showLineNumbers={showLineNumbers}
                scaleMultiplier={scaleMultiplier}
            />
        ));
    const renderedContent = wrapLines ? (
        renderedLines
    ) : (
        <HorizontalScrollView contentContainerStyle={{ minWidth: '100%' }}>
            <View style={{ minWidth: '100%' }}>
                {renderedLines}
            </View>
        </HorizontalScrollView>
    );

    const frameStyle = {
        backgroundColor: theme.dark ? '#151515' : '#FFFFFF',
        borderColor: theme.dark ? 'rgba(255, 255, 255, 0.10)' : theme.colors.codeSurface.border,
        borderRadius: 8,
        borderWidth: 1,
        flex: 1,
        overflow: 'hidden' as const,
    };

    if (props.scrollable) {
        return (
            <View style={frameStyle}>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
                    {renderedContent}
                </ScrollView>
            </View>
        );
    }

    return (
        <View style={frameStyle}>
            {renderedContent}
        </View>
    );
}

const DiffCodeRow = React.memo(function DiffCodeRow({
    row,
    language,
    wrapLines,
    showLineNumbers,
    scaleMultiplier,
}: {
    row: Extract<EditorDiffRow, { kind: 'line' }>;
    language: string | null;
    wrapLines: boolean;
    showLineNumbers: boolean;
    scaleMultiplier: number;
}) {
    const { theme } = useUnistyles();
    const lineNumber = getLineNumber(row);
    const isAdd = row.change === 'add';
    const isRemove = row.change === 'remove';
    const fontSize = scaled(13, scaleMultiplier);
    const lineHeight = scaled(26, scaleMultiplier);
    const gutterWidth = scaled(48, scaleMultiplier);
    const gutterPadding = scaled(10, scaleMultiplier);
    const codePaddingLeft = showLineNumbers ? scaled(10, scaleMultiplier) : scaled(12, scaleMultiplier);
    const codePaddingRight = scaled(12, scaleMultiplier);
    const layout = getDiffCodeRowLayout(wrapLines, { preserveWhitespace: Platform.OS === 'web' });
    const backgroundColor = isAdd
        ? (theme.dark ? 'rgba(35, 94, 55, 0.62)' : 'rgba(18, 131, 74, 0.13)')
        : isRemove
            ? (theme.dark ? 'rgba(108, 45, 39, 0.62)' : 'rgba(190, 51, 44, 0.13)')
            : (theme.dark ? '#151515' : '#FFFFFF');
    const lineNumberColor = isAdd
        ? (theme.dark ? '#38F28B' : theme.colors.gitAddedText)
        : isRemove
            ? (theme.dark ? '#FF574D' : theme.colors.gitRemovedText)
            : theme.colors.diff.lineNumberText;

    return (
        <View style={[{ flexDirection: 'row', minHeight: lineHeight, backgroundColor }, layout.rowStyle]}>
            {showLineNumbers && (
                <Text style={{
                    ...Typography.mono(),
                    width: gutterWidth,
                    fontSize,
                    lineHeight,
                    paddingRight: gutterPadding,
                    textAlign: 'right',
                    color: lineNumberColor,
                    backgroundColor: theme.dark ? '#141414' : '#F6F8FA',
                }}>
                    {lineNumber == null ? ' ' : String(lineNumber)}
                </Text>
            )}
            <Text
                {...layout.contentTextProps}
                style={[{
                    ...Typography.mono(),
                    fontSize,
                    lineHeight,
                    paddingLeft: codePaddingLeft,
                    paddingRight: codePaddingRight,
                }, layout.codeTextStyle]}
            >
                <HighlightedCode text={row.text} language={language} />
            </Text>
        </View>
    );
});

const FoldRow = React.memo(function FoldRow({
    count,
    showLineNumbers,
    scaleMultiplier,
}: {
    count: number;
    showLineNumbers: boolean;
    scaleMultiplier: number;
}) {
    const { theme } = useUnistyles();
    const height = scaled(34, scaleMultiplier);
    const gutterWidth = scaled(48, scaleMultiplier);
    const iconSize = scaled(16, scaleMultiplier);
    const fontSize = scaled(13, scaleMultiplier);
    return (
        <View style={{ flexDirection: 'row', minHeight: height, backgroundColor: theme.dark ? '#1F1F1F' : '#F1F3F5' }}>
            {showLineNumbers && (
                <View style={{
                    width: gutterWidth,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.dark ? '#191919' : '#E9ECEF',
                }}>
                    <Text style={{ color: theme.colors.diff.lineNumberText, fontSize: iconSize, lineHeight: scaled(18, scaleMultiplier) }}>⌄</Text>
                </View>
            )}
            <Text style={{
                ...Typography.default(),
                flex: 1,
                color: theme.colors.textSecondary,
                fontSize,
                lineHeight: height,
                paddingHorizontal: scaled(10, scaleMultiplier),
            }}>
                {count} unmodified lines
            </Text>
        </View>
    );
});

type SyntaxToken = { text: string; color: string };

function scaled(value: number, multiplier: number): number {
    return Math.max(1, Math.round(value * multiplier));
}

function tokenizeInlineCode(text: string, language: string | null, theme: ReturnType<typeof useUnistyles>['theme']): SyntaxToken[] {
    if (!language) return [{ text, color: theme.colors.syntaxDefault }];

    const tokenPattern = /(\/\/.*$|(["'`])(?:\\.|(?!\2).)*\2|\b(?:import|from|export|return|const|let|var|function|interface|type|class|if|else|async|await)\b|\b(?:true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b|[{}()[\].,;:=<>+\-*/?])/g;
    const tokens: SyntaxToken[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenPattern.exec(text)) !== null) {
        if (match.index > lastIndex) {
            tokens.push({ text: text.slice(lastIndex, match.index), color: theme.colors.syntaxDefault });
        }

        const value = match[0];
        let color: string = theme.colors.syntaxDefault;
        if (value.startsWith('//')) color = theme.colors.syntaxComment;
        else if (/^["'`]/.test(value)) color = theme.colors.syntaxString;
        else if (/^\d/.test(value)) color = theme.colors.syntaxNumber;
        else if (/^(import|from|export)$/.test(value)) color = theme.colors.syntaxKeyword;
        else if (/^(return|if|else|async|await)$/.test(value)) color = theme.colors.syntaxKeyword;
        else if (/^(const|let|var|function|interface|type|class)$/.test(value)) color = theme.colors.syntaxFunction;
        else if (/^(true|false|null|undefined)$/.test(value)) color = theme.colors.syntaxNumber;
        else if (/^[{}()[\]]$/.test(value)) color = theme.colors.syntaxBracket1;
        else if (/^[.,;:=<>+\-*/?]$/.test(value)) color = theme.colors.syntaxDefault;

        tokens.push({ text: value, color });
        lastIndex = match.index + value.length;
    }

    if (lastIndex < text.length) {
        tokens.push({ text: text.slice(lastIndex), color: theme.colors.syntaxDefault });
    }

    return tokens;
}

const HighlightedCode = React.memo(function HighlightedCode({ text, language }: { text: string; language: string | null }) {
    const { theme } = useUnistyles();
    const tokens = React.useMemo(() => tokenizeInlineCode(text, language, theme), [language, text, theme]);
    return (
        <>
            {tokens.length === 0 ? <Text style={{ color: theme.colors.syntaxDefault }}> </Text> : tokens.map((token, index) => (
                <Text key={index} style={{ color: token.color }}>
                    {token.text}
                </Text>
            ))}
        </>
    );
});
