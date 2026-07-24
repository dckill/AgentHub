import { parseMarkdown } from './parseMarkdown';
import type { MarkdownBlock, MarkdownSpan } from './parseMarkdown';
import * as React from 'react';
import { Image, Pressable, View, Platform } from 'react-native';
import { HorizontalScrollView } from '../HorizontalScrollView';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Text } from '../StyledText';
import { Typography } from '@/constants/Typography';
import { SimpleSyntaxHighlighter } from '../SimpleSyntaxHighlighter';
import { Modal } from '@/modal';
import { useLocalSetting } from '@/sync/storage';
import { storeTempText } from '@/sync/persistence';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { MermaidRenderer } from './MermaidRenderer';
import { t } from '@/text';
import { isHttpMarkdownLink } from './linkUtils';
import { buildTextSelectionRoute, getMarkdownCodeBlockPresentation, getMarkdownSelectionTarget, type MarkdownSelectionTarget } from './markdownCodeBlock';
import { useChatScale } from '@/hooks/useScale';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getCodeBlockVisuals } from '../codeSurfaceVisuals';

// Option type for callback
export type Option = {
    title: string;
};

export const MarkdownView = React.memo((props: { 
    markdown: string;
    onOptionPress?: (option: Option) => void;
    sessionId?: string;
    showOptions?: boolean;
    variant?: 'agent' | 'user';
}) => {
    const blocks = React.useMemo(() => parseMarkdown(props.markdown), [props.markdown]);
    const { theme } = useUnistyles();
    
    // Backwards compatibility: The original version just returned the view, wrapping the list of blocks.
    // It made each of the individual text elements selectable. When we enable the markdownCopyV2 feature,
    // we disable the selectable property on individual text segments on mobile only. Instead, the long press
    // will be handled by a block-level long press gesture. If we don't disable the selectable property, then you will see
    // the native copy modal come up at the same time as the long press handler is fired.
    const markdownCopyV2 = useLocalSetting('markdownCopyV2');
    const selectable = Platform.OS === 'web' || !markdownCopyV2;
    const router = useRouter();
    const { s } = useChatScale();
    const textColor = props.variant === 'user' ? theme.colors.userMessageText : theme.colors.agentMessageText;

    const handleLinkPress = React.useCallback((url: string) => {
        if (!isHttpMarkdownLink(url)) {
            return;
        }

        if (Platform.OS === 'web') {
            if (typeof window !== 'undefined') {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
            return;
        }

        void WebBrowser.openBrowserAsync(url);
    }, []);

    const openTextSelection = React.useCallback((target: MarkdownSelectionTarget) => {
        try {
            const textId = storeTempText(target.content);
            router.push(buildTextSelectionRoute(textId, target) as any);
        } catch (error) {
            console.error('Error storing text for selection:', error);
            Modal.alert('Error', 'Failed to open text selection. Please try again.');
        }
    }, [router]);

    const handleBlockLongPress = React.useCallback((block: MarkdownBlock) => {
        openTextSelection(getMarkdownSelectionTarget(block, props.markdown));
    }, [openTextSelection, props.markdown]);

    const longPressSelectionEnabled = markdownCopyV2 && Platform.OS !== 'web';

    const renderLongPressTarget = React.useCallback((block: MarkdownBlock, index: number, node: React.ReactNode) => {
        if (!longPressSelectionEnabled) {
            return <React.Fragment key={index}>{node}</React.Fragment>;
        }

        return (
            <MarkdownLongPressTarget key={index} onLongPress={() => handleBlockLongPress(block)}>
                {node}
            </MarkdownLongPressTarget>
        );
    }, [handleBlockLongPress, longPressSelectionEnabled]);

    const renderContent = () => {
        return (
            <View style={{ width: '100%' }}>
                {blocks.map((block, index) => {
                    if (block.type === 'text') {
                        return renderLongPressTarget(block, index, <RenderTextBlock spans={block.content} first={index === 0} last={index === blocks.length - 1} selectable={selectable} onLinkPress={handleLinkPress} s={s} textColor={textColor} />);
                    } else if (block.type === 'header') {
                        return renderLongPressTarget(block, index, <RenderHeaderBlock level={block.level} spans={block.content} first={index === 0} last={index === blocks.length - 1} selectable={selectable} onLinkPress={handleLinkPress} s={s} textColor={textColor} />);
                    } else if (block.type === 'horizontal-rule') {
                        return renderLongPressTarget(block, index, <View style={[style.horizontalRule, { marginTop: s(8), marginBottom: s(8) }]} />);
                    } else if (block.type === 'list') {
                        return renderLongPressTarget(block, index, <RenderListBlock items={block.items} first={index === 0} last={index === blocks.length - 1} selectable={selectable} onLinkPress={handleLinkPress} s={s} textColor={textColor} />);
                    } else if (block.type === 'numbered-list') {
                        return renderLongPressTarget(block, index, <RenderNumberedListBlock items={block.items} first={index === 0} last={index === blocks.length - 1} selectable={selectable} onLinkPress={handleLinkPress} s={s} textColor={textColor} />);
                    } else if (block.type === 'task-list') {
                        return renderLongPressTarget(block, index, <RenderTaskListBlock items={block.items} first={index === 0} last={index === blocks.length - 1} selectable={selectable} onLinkPress={handleLinkPress} s={s} textColor={textColor} />);
                    } else if (block.type === 'blockquote') {
                        return renderLongPressTarget(block, index, <RenderBlockquoteBlock spans={block.content} first={index === 0} last={index === blocks.length - 1} selectable={selectable} onLinkPress={handleLinkPress} s={s} textColor={textColor} />);
                    } else if (block.type === 'code-block') {
                        return renderLongPressTarget(block, index, <RenderCodeBlock content={block.content} language={block.language} first={index === 0} last={index === blocks.length - 1} selectable={selectable} s={s} />);
                    } else if (block.type === 'mermaid') {
                        return renderLongPressTarget(block, index, <MermaidRenderer content={block.content} />);
                    } else if (block.type === 'options') {
                        if (props.showOptions === false) {
                            return null;
                        }
                        return renderLongPressTarget(block, index, <RenderOptionsBlock items={block.items} first={index === 0} last={index === blocks.length - 1} selectable={selectable} onOptionPress={props.onOptionPress} s={s} iconColor={theme.colors.textLink} />);
                    } else if (block.type === 'table') {
                        return renderLongPressTarget(block, index, <RenderTableBlock headers={block.headers} rows={block.rows} onLinkPress={handleLinkPress} selectable={selectable} first={index === 0} last={index === blocks.length - 1} s={s} textColor={textColor} />);
                    } else if (block.type === 'image') {
                        return renderLongPressTarget(block, index, <RenderImageBlock url={block.url} alt={block.alt} first={index === 0} last={index === blocks.length - 1} />);
                    } else {
                        return null;
                    }
                })}
            </View>
        );
    }

    return renderContent();
});

function MarkdownLongPressTarget(props: { children: React.ReactNode; onLongPress: () => void }) {
    const longPressGesture = Gesture.LongPress()
        .minDuration(500)
        .onStart(() => {
            props.onLongPress();
        })
        .runOnJS(true);

    return (
        <GestureDetector gesture={longPressGesture}>
            <View style={{ width: '100%' }}>
                {props.children}
            </View>
        </GestureDetector>
    );
}

type RenderSpanProps = {
    spans: MarkdownSpan[];
    baseStyle?: any;
    selectable: boolean;
    onLinkPress: (url: string) => void;
    s: (base: number) => number;
};

function RenderTextBlock(props: { spans: MarkdownSpan[], first: boolean, last: boolean, selectable: boolean, onLinkPress: (url: string) => void, s: (base: number) => number, textColor: string }) {
    const textStyle = [style.text, { fontSize: props.s(16), lineHeight: props.s(24), marginTop: props.s(8), marginBottom: props.s(8), color: props.textColor }, props.first && style.first, props.last && style.last];
    return <Text selectable={props.selectable} style={textStyle}><RenderSpans spans={props.spans} baseStyle={textStyle} selectable={props.selectable} onLinkPress={props.onLinkPress} s={props.s} /></Text>;
}

function RenderHeaderBlock(props: { level: 1 | 2 | 3 | 4 | 5 | 6, spans: MarkdownSpan[], first: boolean, last: boolean, selectable: boolean, onLinkPress: (url: string) => void, s: (base: number) => number, textColor: string }) {
    const h = (style as any)[`header${props.level}`];
    // Scale font sizes and line heights based on header level
    const scaledOverrides: Record<string, { fontSize: number; lineHeight: number }> = {
        header1: { fontSize: props.s(16), lineHeight: props.s(24) },
        header2: { fontSize: props.s(20), lineHeight: props.s(24) },
        header3: { fontSize: props.s(16), lineHeight: props.s(28) },
        header4: { fontSize: props.s(16), lineHeight: props.s(24) },
        header5: { fontSize: props.s(16), lineHeight: props.s(24) },
        header6: { fontSize: props.s(16), lineHeight: props.s(24) },
    };
    const overrides = scaledOverrides[`header${props.level}`] ?? { fontSize: props.s(16), lineHeight: props.s(24) };
    const headerStyle = [style.header, h, overrides, { color: props.textColor }, props.first && style.first, props.last && style.last];
    return <Text selectable={props.selectable} style={headerStyle}><RenderSpans spans={props.spans} baseStyle={headerStyle} selectable={props.selectable} onLinkPress={props.onLinkPress} s={props.s} /></Text>;
}

function RenderListBlock(props: { items: MarkdownSpan[][], first: boolean, last: boolean, selectable: boolean, onLinkPress: (url: string) => void, s: (base: number) => number, textColor: string }) {
    const listStyle = [style.text, style.list, { fontSize: props.s(16), lineHeight: props.s(24), color: props.textColor, marginTop: 0, marginBottom: 0, flex: 1 }];
    return (
        <View style={{ flexDirection: 'column', marginBottom: props.s(8), gap: props.s(6) }}>
            {props.items.map((item, index) => (
                <View key={index} style={style.listItemRow}>
                    <View style={[style.listBulletBadge, { width: props.s(20), height: props.s(20), borderRadius: props.s(10), marginTop: props.s(2), marginRight: props.s(8) }]}>
                        <Text style={[style.listBulletText, { fontSize: props.s(14), lineHeight: props.s(18) }]}>•</Text>
                    </View>
                    <Text selectable={props.selectable} style={listStyle}>
                        <RenderSpans spans={item} baseStyle={listStyle} selectable={props.selectable} onLinkPress={props.onLinkPress} s={props.s} />
                    </Text>
                </View>
            ))}
        </View>
    );
}

function RenderNumberedListBlock(props: { items: { number: number, spans: MarkdownSpan[] }[], first: boolean, last: boolean, selectable: boolean, onLinkPress: (url: string) => void, s: (base: number) => number, textColor: string }) {
    const listStyle = [style.text, style.list, { fontSize: props.s(16), lineHeight: props.s(24), color: props.textColor, marginTop: 0, marginBottom: 0, flex: 1 }];
    return (
        <View style={{ flexDirection: 'column', marginBottom: props.s(8), gap: props.s(6) }}>
            {props.items.map((item, index) => (
                <View key={index} style={style.listItemRow}>
                    <View style={[style.listNumberBadge, { minWidth: props.s(24), height: props.s(20), borderRadius: props.s(10), marginTop: props.s(2), marginRight: props.s(8), paddingHorizontal: props.s(6) }]}>
                        <Text style={[style.listNumberText, { fontSize: props.s(11), lineHeight: props.s(18) }]}>{item.number}</Text>
                    </View>
                    <Text selectable={props.selectable} style={listStyle}>
                        <RenderSpans spans={item.spans} baseStyle={listStyle} selectable={props.selectable} onLinkPress={props.onLinkPress} s={props.s} />
                    </Text>
                </View>
            ))}
        </View>
    );
}

function RenderTaskListBlock(props: { items: { checked: boolean, spans: MarkdownSpan[] }[], first: boolean, last: boolean, selectable: boolean, onLinkPress: (url: string) => void, s: (base: number) => number, textColor: string }) {
    const { theme } = useUnistyles();
    const listStyle = [style.text, style.list, { fontSize: props.s(16), lineHeight: props.s(24), color: props.textColor, marginTop: 0, marginBottom: 0, flex: 1 }];
    return (
        <View style={{ flexDirection: 'column', marginBottom: props.s(8), gap: props.s(6) }}>
            {props.items.map((item, index) => (
                <View key={index} style={style.listItemRow}>
                    <View
                        style={[
                            style.taskCheckbox,
                            {
                                width: props.s(20),
                                height: props.s(20),
                                borderRadius: props.s(6),
                                marginTop: props.s(2),
                                marginRight: props.s(8),
                                backgroundColor: item.checked ? theme.colors.textLink : theme.colors.surfaceHigh,
                                borderColor: item.checked ? theme.colors.textLink : theme.colors.divider,
                            },
                        ]}
                    >
                        {item.checked ? (
                            <Ionicons name="checkmark" size={props.s(14)} color={theme.colors.canvas} />
                        ) : null}
                    </View>
                    <Text selectable={props.selectable} style={listStyle}>
                        <RenderSpans spans={item.spans} baseStyle={listStyle} selectable={props.selectable} onLinkPress={props.onLinkPress} s={props.s} />
                    </Text>
                </View>
            ))}
        </View>
    );
}

function RenderBlockquoteBlock(props: { spans: MarkdownSpan[], first: boolean, last: boolean, selectable: boolean, onLinkPress: (url: string) => void, s: (base: number) => number, textColor: string }) {
    const { theme } = useUnistyles();
    const textStyle = [style.blockquoteText, { fontSize: props.s(15), lineHeight: props.s(23), color: props.textColor }];
    return (
        <View
            style={[
                style.blockquote,
                {
                    marginTop: props.first ? props.s(4) : props.s(8),
                    marginBottom: props.last ? props.s(4) : props.s(8),
                    paddingHorizontal: props.s(12),
                    paddingVertical: props.s(10),
                    backgroundColor: theme.colors.glass.background,
                    borderColor: theme.colors.divider,
                    borderLeftColor: theme.colors.textLink,
                },
            ]}
        >
            <Text selectable={props.selectable} style={textStyle}>
                <RenderSpans spans={props.spans} baseStyle={textStyle} selectable={props.selectable} onLinkPress={props.onLinkPress} s={props.s} />
            </Text>
        </View>
    );
}

function RenderCodeBlock(props: { content: string, language: string | null, first: boolean, last: boolean, selectable: boolean, s: (base: number) => number }) {
    const [isHovered, setIsHovered] = React.useState(false);
    const { theme } = useUnistyles();
    const visuals = getCodeBlockVisuals(theme);
    const isEmpty = props.content.trim().length === 0;
    const presentation = React.useMemo(() => getMarkdownCodeBlockPresentation(props.language), [props.language]);

    const copyCode = React.useCallback(async () => {
        try {
            await Clipboard.setStringAsync(props.content);
            Modal.alert(t('common.success'), t('markdown.codeCopied'), [{ text: t('common.ok'), style: 'cancel' }]);
        } catch (error) {
            console.error('Failed to copy code:', error);
            Modal.alert(t('common.error'), t('markdown.copyFailed'), [{ text: t('common.ok'), style: 'cancel' }]);
        }
    }, [props.content]);

    if (isEmpty) {
        return (
            <View
                style={[
                    style.codeBlock,
                    style.emptyCodeBlock,
                    { marginVertical: props.s(8), backgroundColor: visuals.backgroundColor, borderColor: visuals.borderColor },
                    props.first && style.first,
                    props.last && style.last,
                ]}
            >
                <View style={[style.codeBlockHeader, { paddingHorizontal: props.s(12), paddingVertical: props.s(8), backgroundColor: visuals.headerBackgroundColor, borderBottomColor: visuals.headerBorderColor }]}>
                    <Text selectable={props.selectable} style={[style.codeLanguage, { fontSize: props.s(12), lineHeight: props.s(16), color: visuals.languageColor }]}>
                        {presentation.label}
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <View
            style={[style.codeBlock, { marginVertical: props.s(8), backgroundColor: visuals.backgroundColor, borderColor: visuals.borderColor }, props.first && style.first, props.last && style.last]}
            // @ts-ignore - Web only events
            onMouseEnter={() => setIsHovered(true)}
            // @ts-ignore - Web only events
            onMouseLeave={() => setIsHovered(false)}
        >
            <View style={[style.codeBlockHeader, { minHeight: props.s(36), paddingHorizontal: props.s(12), paddingVertical: props.s(8), backgroundColor: visuals.headerBackgroundColor, borderBottomColor: visuals.headerBorderColor }]}>
                <Text selectable={props.selectable} style={[style.codeLanguage, { fontSize: props.s(12), lineHeight: props.s(16), color: visuals.languageColor }]}>
                    {presentation.label}
                </Text>
                <View
                    style={[
                        style.copyButtonWrapper,
                        (isHovered || Platform.OS !== 'web') && style.copyButtonWrapperVisible,
                    ]}
                    {...(Platform.OS === 'web' ? ({ className: 'copy-button-wrapper' } as any) : {})}
                >
                    <Pressable
                        style={({ pressed }) => [style.copyButton, { backgroundColor: visuals.copyButtonBackgroundColor, borderColor: visuals.copyButtonBorderColor }, pressed && style.copyButtonPressed]}
                        onPress={copyCode}
                    >
                        <Text style={[style.copyButtonText, { fontSize: props.s(12), lineHeight: props.s(16), color: visuals.copyButtonTextColor }]}>{t('common.copy')}</Text>
                    </Pressable>
                </View>
            </View>
            <View style={[style.codeBlockBody, { backgroundColor: visuals.backgroundColor }]}>
                <HorizontalScrollView
                    contentContainerStyle={{ paddingVertical: props.s(12) }}
                >
                    <SimpleSyntaxHighlighter
                        code={props.content}
                        language={props.language}
                        selectable={props.selectable}
                        showLineNumbers={presentation.showLineNumbers}
                        scaleMultiplier={props.s(1)}
                        virtualized={false}
                        surface={theme.dark ? 'terminal' : 'default'}
                    />
                </HorizontalScrollView>
            </View>
        </View>
    );
}

function RenderImageBlock(props: { url: string, alt: string, first: boolean, last: boolean }) {
    const accessibleLabel = props.alt || 'Markdown image';

    return (
        <View style={[style.imageBlock, props.first && style.first, props.last && style.last]}>
            <Image
                source={{ uri: props.url }}
                style={style.image}
                accessibilityLabel={accessibleLabel}
                resizeMode="contain"
            />
            {props.alt ? (
                <Text style={style.imageCaption}>{props.alt}</Text>
            ) : null}
        </View>
    );
}

function RenderOptionsBlock(props: {
    items: string[],
    first: boolean,
    last: boolean,
    selectable: boolean,
    onOptionPress?: (option: Option) => void,
    s: (base: number) => number,
    iconColor: string
}) {
    return (
        <View style={[style.optionsContainer, { marginVertical: props.s(8), gap: props.s(8) }, props.first && style.first, props.last && style.last]}>
            {props.items.map((item, index) => {
                if (props.onOptionPress) {
                    return (
                        <Pressable
                            key={index}
                            style={({ pressed }) => [
                                style.optionItem,
                                { paddingHorizontal: props.s(14), paddingVertical: props.s(12), borderRadius: props.s(10), minHeight: props.s(48) },
                                pressed && style.optionItemPressed
                            ]}
                            onPress={() => props.onOptionPress?.({ title: item })}
                        >
                            <Text selectable={props.selectable} style={[style.optionText, { fontSize: props.s(16), lineHeight: props.s(24), flex: 1 }]}>{item}</Text>
                            <Ionicons name="arrow-forward-circle-outline" size={props.s(20)} color={props.iconColor} />
                        </Pressable>
                    );
                } else {
                    return (
                        <View key={index} style={[style.optionItem, { paddingHorizontal: props.s(14), paddingVertical: props.s(12), borderRadius: props.s(10), minHeight: props.s(48) }]}>
                            <Text selectable={props.selectable} style={[style.optionText, { fontSize: props.s(16), lineHeight: props.s(24), flex: 1 }]}>{item}</Text>
                        </View>
                    );
                }
            })}
        </View>
    );
}

function RenderSpans(props: RenderSpanProps) {
    return (<>
        {props.spans.map((span, index) => {
            // Build span styles, applying scaling for code spans
            const spanStyles = span.styles.map(st => {
                if (st === 'code') {
                    return [style[st], { fontSize: props.s(16), lineHeight: props.s(24) }];
                }
                return style[st];
            });
            if (span.url) {
                const isExternalLink = isHttpMarkdownLink(span.url);
                return (
                    <Text
                        key={index}
                        selectable={props.selectable}
                        accessibilityRole={isExternalLink ? 'link' : undefined}
                        style={[props.baseStyle, isExternalLink && style.link, spanStyles]}
                        {...(isExternalLink && Platform.OS === 'web' ? { onClick: () => { if (typeof window !== 'undefined') window.open(span.url!, '_blank', 'noopener,noreferrer'); } } as any : {})}
                        onPress={isExternalLink && Platform.OS !== 'web'
                            ? () => props.onLinkPress(span.url!)
                            : undefined}
                    >
                        {span.text}
                    </Text>
                );
            } else {
                return <Text key={index} selectable={props.selectable} style={[props.baseStyle, spanStyles]}>{span.text}</Text>
            }
        })}
    </>)
}

// Plain-text length of a span array — used to estimate column widths.
function spansLength(spans: MarkdownSpan[]): number {
    let n = 0;
    for (const s of spans) n += s.text.length;
    return n;
}

const TABLE_MIN_COL_WIDTH = 96;
const TABLE_MAX_COL_WIDTH = 360;
const TABLE_CHAR_WIDTH = 8.5;  // approx px per char at 16px default font
const TABLE_CELL_H_PADDING = 24;

// Row-first layout with content-estimated column widths.
//
// - Each column's width is picked from the widest text in that column (header +
//   rows), clamped to [MIN, MAX]. This gives column-alignment across rows and
//   lets narrow columns (like "1, 2, 3") stay narrow.
// - Each row is a flex row — default `alignItems: 'stretch'` makes all cells in
//   a row match the tallest cell's height.
// - Wrapped in a horizontal ScrollView so wide tables still scroll instead of
//   being squashed unreadably.
function RenderTableBlock(props: {
    headers: MarkdownSpan[][],
    rows: MarkdownSpan[][][],
    onLinkPress: (url: string) => void,
    selectable: boolean,
    first: boolean,
    last: boolean,
    s: (base: number) => number,
    textColor: string
}) {
    const columnCount = props.headers.length;
    const rowCount = props.rows.length;
    const isLastCol = (colIndex: number) => colIndex === columnCount - 1;
    const isLastRow = (rowIndex: number) => rowIndex === rowCount - 1;

    const columnWidths = React.useMemo(() => {
        const widths = new Array(columnCount).fill(0);
        for (let c = 0; c < columnCount; c++) {
            widths[c] = Math.max(widths[c], spansLength(props.headers[c] ?? []));
        }
        for (const row of props.rows) {
            for (let c = 0; c < columnCount; c++) {
                widths[c] = Math.max(widths[c], spansLength(row[c] ?? []));
            }
        }
        return widths.map(len => Math.min(TABLE_MAX_COL_WIDTH, Math.max(TABLE_MIN_COL_WIDTH, len * TABLE_CHAR_WIDTH + TABLE_CELL_H_PADDING)));
    }, [props.headers, props.rows, columnCount]);

    return (
        <View style={[style.tableContainer, { marginVertical: props.s(8) }, props.first && style.first, props.last && style.last]}>
            {/* flexGrow:0 stops iOS from stretching the horizontal ScrollView
                vertically to fill the parent — the cause of the table's frame
                extending down past the last row into empty space. */}
            <HorizontalScrollView style={{ flexGrow: 0 }}>
                <View>
                    {/* Header row */}
                    <View style={[style.tableRow, style.tableHeaderRow]}>
                        {props.headers.map((header, colIndex) => (
                            <View
                                key={`header-${colIndex}`}
                                style={[style.tableCell, style.tableHeaderCell, { width: columnWidths[colIndex], paddingHorizontal: props.s(12), paddingVertical: props.s(8) }, !isLastCol(colIndex) && style.tableCellBorderRight]}
                            >
                                <Text style={[style.tableHeaderText, { fontSize: props.s(16), lineHeight: props.s(24) }]}>
                                    <RenderSpans spans={header} baseStyle={[style.tableHeaderText, { fontSize: props.s(16), lineHeight: props.s(24) }]} onLinkPress={props.onLinkPress} selectable={props.selectable} s={props.s} />
                                </Text>
                            </View>
                        ))}
                    </View>
                    {/* Data rows */}
                    {props.rows.map((row, rowIndex) => (
                        <View
                            key={`row-${rowIndex}`}
                            style={[
                                style.tableRow,
                                rowIndex % 2 === 1 && style.tableDataRowAlt,
                                !isLastRow(rowIndex) && style.tableRowBorderBottom
                            ]}
                        >
                            {props.headers.map((_, colIndex) => (
                                <View
                                    key={`cell-${rowIndex}-${colIndex}`}
                                    style={[style.tableCell, { width: columnWidths[colIndex], paddingHorizontal: props.s(12), paddingVertical: props.s(8) }, !isLastCol(colIndex) && style.tableCellBorderRight]}
                                >
                                    <Text style={[style.tableCellText, { fontSize: props.s(16), lineHeight: props.s(24), color: props.textColor }]}>
                                        <RenderSpans spans={row[colIndex] ?? []} baseStyle={[style.tableCellText, { fontSize: props.s(16), lineHeight: props.s(24), color: props.textColor }]} onLinkPress={props.onLinkPress} selectable={props.selectable} s={props.s} />
                                    </Text>
                                </View>
                            ))}
                        </View>
                    ))}
                </View>
            </HorizontalScrollView>
        </View>
    );
}


const style = StyleSheet.create((theme) => ({

    // Plain text

    text: {
        ...Typography.default(),
        fontSize: 16,
        lineHeight: 24, // Reduced from 28 to 24
        marginTop: 8,
        marginBottom: 8,
        color: theme.colors.text,
        fontWeight: '400',
    },

    italic: {
        fontStyle: 'italic',
    },
    bold: {
        fontWeight: 'bold',
    },
    semibold: {
        fontWeight: '600',
    },
    strikethrough: {
        textDecorationLine: 'line-through',
    },
    code: {
        ...Typography.mono(),
        fontSize: 16,
        lineHeight: 24,
        color: theme.colors.text,
    },
    link: {
        ...Typography.default(),
        color: theme.colors.text,
        fontWeight: '400',
        textDecorationLine: 'underline',
        cursor: 'pointer',
    },

    // Headers

    header: {
        ...Typography.default('semiBold'),
        color: theme.colors.text,
    },
    header1: {
        fontSize: 16,
        lineHeight: 24,  // Reduced from 36 to 24
        fontWeight: '900',
        marginTop: 16,
        marginBottom: 8
    },
    header2: {
        fontSize: 20,
        lineHeight: 24,  // Reduced from 36 to 32
        fontWeight: '600',
        marginTop: 16,
        marginBottom: 8
    },
    header3: {
        fontSize: 16,
        lineHeight: 28,  // Reduced from 32 to 28
        fontWeight: '600',
        marginTop: 16,
        marginBottom: 8,
    },
    header4: {
        fontSize: 16,
        lineHeight: 24,
        fontWeight: '600',
        marginTop: 8,
        marginBottom: 8,
    },
    header5: {
        fontSize: 16,
        lineHeight: 24,  // Reduced from 28 to 24
        fontWeight: '600'
    },
    header6: {
        fontSize: 16,
        lineHeight: 24, // Reduced from 28 to 24
        fontWeight: '600'
    },

    //
    // List
    //

    list: {
        ...Typography.default(),
        color: theme.colors.text,
        marginTop: 0,
        marginBottom: 0,
    },
    listItemRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        width: '100%',
    },
    listBulletBadge: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceHigh,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    listBulletText: {
        ...Typography.default('semiBold'),
        color: theme.colors.textLink,
    },
    listNumberBadge: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceHigh,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    listNumberText: {
        ...Typography.default('semiBold'),
        color: theme.colors.textLink,
    },
    taskCheckbox: {
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
    },
    blockquote: {
        borderRadius: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderLeftWidth: 3,
    },
    blockquoteText: {
        ...Typography.default(),
    },

    //
    // Common
    //

    first: {
        // marginTop: 0
    },
    last: {
        // marginBottom: 0
    },

    //
    // Code Block
    //

    codeBlock: {
        backgroundColor: theme.colors.surfaceHigh,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        borderRadius: 8,
        marginVertical: 8,
        position: 'relative',
        zIndex: 1,
        width: '100%',
        overflow: 'hidden',
    },
    emptyCodeBlock: {
        minHeight: 0,
    },
    codeBlockHeader: {
        backgroundColor: theme.colors.surfaceHigh,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    codeBlockBody: {
        backgroundColor: theme.colors.codeSurface.background,
    },
    copyButtonWrapper: {
        opacity: 0,
        zIndex: 10,
        elevation: 10,
        pointerEvents: 'none',
    },
    copyButtonWrapperVisible: {
        opacity: 1,
        pointerEvents: 'auto',
    },
    codeLanguage: {
        ...Typography.mono(),
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontWeight: '600',
    },
    codeText: {
        ...Typography.mono(),
        color: theme.colors.text,
        fontSize: 14,
        lineHeight: 20,
    },
    horizontalRule: {
        height: 1,
        backgroundColor: theme.colors.divider,
        marginTop: 8,
        marginBottom: 8,
    },
    imageBlock: {
        width: '100%',
        maxWidth: 520,
        marginVertical: 8,
        alignSelf: 'flex-start',
        gap: 8,
    },
    image: {
        width: '100%',
        minHeight: 160,
        height: 240,
        borderRadius: 12,
        backgroundColor: theme.colors.surfaceHighest,
    },
    imageCaption: {
        ...Typography.default(),
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.textSecondary,
    },
    copyButtonContainer: {
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 10,
        elevation: 10,
        opacity: 1,
    },
    copyButtonContainerHidden: {
        opacity: 0,
    },
    copyButton: {
        backgroundColor: theme.colors.surfaceHighest,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        cursor: 'pointer',
    },
    copyButtonPressed: {
        opacity: 0.7,
    },
    copyButtonHidden: {
        display: 'none',
    },
    copyButtonCopied: {
        backgroundColor: theme.colors.success,
        borderColor: theme.colors.success,
        opacity: 1,
    },
    copyButtonText: {
        ...Typography.default(),
        color: theme.colors.text,
        fontSize: 12,
        lineHeight: 16,
    },

    //
    // Options Block
    //

    optionsContainer: {
        flexDirection: 'column',
        gap: 8,
        marginVertical: 8,
    },
    optionItem: {
        backgroundColor: theme.colors.surfaceHigh,
        borderRadius: 10,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: theme.colors.textLink,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    optionItemPressed: {
        opacity: 0.7,
        backgroundColor: theme.colors.surfaceHighest,
    },
    optionText: {
        ...Typography.default(),
        fontSize: 16,
        lineHeight: 24,
        color: theme.colors.text,
    },
    //
    // Table
    //

    tableContainer: {
        marginVertical: 8,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        borderRadius: 8,
        overflow: 'hidden',
        maxWidth: '100%',
        alignSelf: 'flex-start',
        backgroundColor: theme.colors.surface,
    },
    tableRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
    },
    tableRowBorderBottom: {
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
    },
    tableHeaderRow: {
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
    },
    tableCell: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        alignItems: 'flex-start',
    },
    tableCellBorderRight: {
        borderRightWidth: 1,
        borderRightColor: theme.colors.divider,
    },
    tableHeaderCell: {
        backgroundColor: theme.colors.surfaceHighest,
    },
    tableDataRowAlt: {
        backgroundColor: theme.colors.surfaceHigh,
    },
    tableHeaderText: {
        ...Typography.default('semiBold'),
        color: theme.colors.text,
        fontSize: 16,
        lineHeight: 24,
        ...Platform.select({
            web: {
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
            } as any,
        }),
    },
    tableCellText: {
        ...Typography.default(),
        color: theme.colors.text,
        fontSize: 16,
        lineHeight: 24,
        ...Platform.select({
            web: {
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
            } as any,
        }),
    },

    // Add global style for Web platform (Unistyles supports this via compiler plugin)
    ...(Platform.OS === 'web' ? {
        // Web-only CSS styles
        _____web_global_styles: {}
    } : {}),
}));
