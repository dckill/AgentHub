import React from 'react';
import { View, Text, ScrollView, Pressable, Share } from 'react-native';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { retrieveTempText } from '@/sync/persistence';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import * as Clipboard from 'expo-clipboard';
import { Modal } from '@/modal';
import Ionicons from '@expo/vector-icons/Ionicons';
import { HorizontalScrollView } from '@/components/HorizontalScrollView';
import { MarkdownSpan, parseMarkdown } from '@/components/markdown/parseMarkdown';
import {
    getMarkdownCodeBlockLayout,
    getMarkdownCodeBlockPresentation,
    getMarkdownCodeSelectionRendering,
} from '@/components/markdown/markdownCodeBlock';
import { SimpleSyntaxHighlighter } from '@/components/SimpleSyntaxHighlighter';
import { shareLocalContent } from '@/utils/localContentShare';
import { useAuth } from '@/auth/AuthContext';
import { getExternalShareOrigin } from '@/utils/externalShareOrigin';
import { publishSelectedTextShare } from '@/sync/publishExternalShare';
import { sync } from '@/sync/sync';
import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';

export default function TextSelectionScreen() {
    const router = useRouter();
    const navigation = useNavigation();
    const { textId, mode, language } = useLocalSearchParams<{ textId: string; mode?: string; language?: string }>();
    const { theme } = useUnistyles();
    const insets = useSafeAreaInsets();
    const auth = useAuth();
    const [fullText, setFullText] = React.useState<string>('');
    const [loading, setLoading] = React.useState(true);
    const [sharingSecurely, setSharingSecurely] = React.useState(false);
    const isCodeMode = mode === 'code';
    const codeLanguage = isCodeMode ? (language?.trim() || null) : null;

    // Copy functionality
    const handleCopyAll = React.useCallback(async () => {
        if (!fullText) {
            Modal.alert(t('common.error'), t('textSelection.noTextToCopy'));
            return;
        }

        try {
            await Clipboard.setStringAsync(fullText);
            Modal.alert(t('textSelection.textCopied'));
        } catch (error) {
            Modal.alert(t('common.error'), t('textSelection.failedToCopy'));
        }
    }, [fullText]);

    const createSecureLink = React.useCallback(async (expiresInSeconds: 3_600 | 86_400 | 604_800) => {
        const origin = getExternalShareOrigin();
        const credentials = auth.credentials;
        const generation = sync.getAccountGeneration();
        if (!origin || !credentials || generation === null) {
            Modal.alert(t('externalShares.unavailable'), t('externalShares.unavailableDescription'));
            return;
        }
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        setSharingSecurely(true);
        try {
            const result = await runSessionActionRequest({
                isCurrent,
                request: () => publishSelectedTextShare({
                    credentials,
                    text: fullText,
                    expiresInSeconds,
                    origin,
                }),
            });
            if (result === null || !isCurrent()) return;
            const link = result.link;
            if (!isCurrent()) return;
            try {
                await Share.share({ message: link, title: t('textSelection.shareTitle') });
            } catch {
                if (!isCurrent()) return;
                try {
                    await Clipboard.setStringAsync(link);
                    if (isCurrent()) Modal.alert(t('common.success'), t('externalShares.linkCopied'));
                } catch {
                    if (isCurrent()) Modal.alert(t('common.error'), t('externalShares.linkReadyCopyFailed'));
                }
            }
        } catch {
            if (isCurrent()) {
                Modal.alert(t('common.error'), t('externalShares.createFailed'));
            }
        } finally {
            if (isCurrent()) setSharingSecurely(false);
        }
    }, [auth.credentials, fullText]);

    const handleSecureShare = React.useCallback(() => {
        if (!fullText) {
            Modal.alert(t('common.error'), t('textSelection.noTextToShare'));
            return;
        }
        if (!getExternalShareOrigin()) {
            Modal.alert(t('externalShares.unavailable'), t('externalShares.unavailableDescription'));
            return;
        }
        Modal.alert(t('externalShares.createSecureLink'), t('externalShares.chooseExpiry'), [
            { text: t('externalShares.oneHour'), onPress: () => void createSecureLink(3_600) },
            { text: t('externalShares.oneDay'), onPress: () => void createSecureLink(86_400) },
            { text: t('externalShares.sevenDays'), onPress: () => void createSecureLink(604_800) },
            { text: t('common.cancel'), style: 'cancel' },
        ]);
    }, [createSecureLink, fullText]);

    const handleShare = React.useCallback(async () => {
        try {
            const outcome = await shareLocalContent({
                text: fullText,
                title: t('textSelection.shareTitle'),
                share: (payload) => Share.share(payload),
            });
            if (outcome === 'empty') {
                Modal.alert(t('common.error'), t('textSelection.noTextToShare'));
            }
        } catch {
            Modal.alert(t('common.error'), t('textSelection.failedToShare'));
        }
    }, [fullText]);

    // Set up header right button
    React.useLayoutEffect(() => {
        const headerTitle = isCodeMode
            ? getMarkdownCodeBlockPresentation(codeLanguage).label
            : t('textSelection.title');

        navigation.setOptions({
            headerTitle,
            headerRight: () => (
                <View style={styles.headerActions}>
                    <Pressable
                        accessibilityLabel={t('common.copy')}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: loading || !fullText }}
                        onPress={handleCopyAll}
                        style={({ pressed }) => [styles.headerAction, { opacity: pressed ? 0.7 : 1 }]}
                        disabled={loading || !fullText}
                    >
                        <Ionicons
                            name="copy-outline"
                            size={22}
                            color={loading || !fullText ? theme.colors.textSecondary : theme.colors.header.tint}
                        />
                    </Pressable>
                    <Pressable
                        accessibilityLabel={t('textSelection.share')}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: loading || !fullText }}
                        onPress={handleShare}
                        style={({ pressed }) => [styles.headerAction, { opacity: pressed ? 0.7 : 1 }]}
                        disabled={loading || !fullText}
                    >
                        <Ionicons
                            name="share-outline"
                            size={22}
                            color={loading || !fullText ? theme.colors.textSecondary : theme.colors.header.tint}
                        />
                    </Pressable>
                    <Pressable
                        accessibilityLabel={sharingSecurely ? t('externalShares.creating') : t('externalShares.createSecureLink')}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: loading || !fullText || sharingSecurely }}
                        onPress={handleSecureShare}
                        style={({ pressed }) => [styles.headerAction, { opacity: pressed ? 0.7 : 1 }]}
                        disabled={loading || !fullText || sharingSecurely}
                    >
                        <Ionicons
                            name="link-outline"
                            size={22}
                            color={loading || !fullText || sharingSecurely ? theme.colors.textSecondary : theme.colors.header.tint}
                        />
                    </Pressable>
                </View>
            ),
        });
    }, [navigation, handleCopyAll, handleShare, handleSecureShare, loading, fullText, sharingSecurely, theme, isCodeMode, codeLanguage]);

    React.useEffect(() => {
        if (!textId) {
            Modal.alert(t('common.error'), t('textSelection.noTextProvided'), [
                { text: t('common.ok'), onPress: () => router.back() }
            ]);
            return;
        }

        const content = retrieveTempText(textId);
        if (content) {
            setFullText(content);
        } else {
            Modal.alert(t('common.error'), t('textSelection.textNotFound'), [
                { text: t('common.ok'), onPress: () => router.back() }
            ]);
        }
        setLoading(false);
    }, [textId, router]);

    if (loading) {
        return (
            <View style={styles.container}>
                <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
                    {t('common.loading')}
                </Text>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
            <ScrollView 
                style={styles.textContainer} 
                showsVerticalScrollIndicator={true}
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: insets.bottom + 16 }
                ]}
            >
                {isCodeMode ? (
                    <SelectableCodeBlock content={fullText} language={codeLanguage} />
                ) : (
                    <SelectableMarkdownDetail markdown={fullText} />
                )}
            </ScrollView>
        </View>
    );
}

function SelectableMarkdownDetail(props: { markdown: string }) {
    const blocks = React.useMemo(() => parseMarkdown(props.markdown), [props.markdown]);

    if (blocks.length === 0) {
        return (
            <Text selectable style={styles.detailText}>
                {props.markdown}
            </Text>
        );
    }

    return (
        <View style={styles.detailRoot}>
            {blocks.map((block, index) => {
                if (block.type === 'text') {
                    return (
                        <Text selectable key={index} style={styles.detailText}>
                            <SelectableSpans spans={block.content} baseStyle={styles.detailText} />
                        </Text>
                    );
                }
                if (block.type === 'header') {
                    return (
                        <Text selectable key={index} style={[styles.detailHeader, styles[`detailHeader${block.level}` as keyof typeof styles] as any]}>
                            <SelectableSpans spans={block.content} baseStyle={styles.detailHeader} />
                        </Text>
                    );
                }
                if (block.type === 'list') {
                    return (
                        <View key={index} style={styles.detailList}>
                            {block.items.map((item, itemIndex) => (
                                <View key={itemIndex} style={styles.detailListRow}>
                                    <Text style={styles.detailListMarker}>•</Text>
                                    <Text selectable style={styles.detailListText}>
                                        <SelectableSpans spans={item} baseStyle={styles.detailListText} />
                                    </Text>
                                </View>
                            ))}
                        </View>
                    );
                }
                if (block.type === 'numbered-list') {
                    return (
                        <View key={index} style={styles.detailList}>
                            {block.items.map((item, itemIndex) => (
                                <View key={itemIndex} style={styles.detailListRow}>
                                    <Text style={styles.detailNumberMarker}>{item.number}.</Text>
                                    <Text selectable style={styles.detailListText}>
                                        <SelectableSpans spans={item.spans} baseStyle={styles.detailListText} />
                                    </Text>
                                </View>
                            ))}
                        </View>
                    );
                }
                if (block.type === 'code-block') {
                    return <SelectableCodeBlock key={index} content={block.content} language={block.language} />;
                }
                if (block.type === 'mermaid') {
                    return <SelectableCodeBlock key={index} content={block.content} language="mermaid" />;
                }
                if (block.type === 'horizontal-rule') {
                    return <View key={index} style={styles.detailRule} />;
                }
                if (block.type === 'options') {
                    return (
                        <View key={index} style={styles.detailList}>
                            {block.items.map((item, itemIndex) => (
                                <Text selectable key={itemIndex} style={styles.detailText}>{item}</Text>
                            ))}
                        </View>
                    );
                }
                if (block.type === 'table') {
                    return <SelectableTable key={index} headers={block.headers} rows={block.rows} />;
                }
                if (block.type === 'image') {
                    return (
                        <Text selectable key={index} style={styles.detailText}>
                            {block.alt ? `${block.alt}\n` : ''}{block.url}
                        </Text>
                    );
                }
                return null;
            })}
        </View>
    );
}

function SelectableCodeBlock(props: { content: string; language: string | null }) {
    const { theme } = useUnistyles();
    const presentation = React.useMemo(() => getMarkdownCodeBlockPresentation(props.language), [props.language]);
    const rendering = React.useMemo(() => getMarkdownCodeSelectionRendering(), []);
    const codeLayout = React.useMemo(() => getMarkdownCodeBlockLayout(props.content, {
        lineHeight: 20,
        minWidth: 240,
        horizontalPadding: 24,
        charWidth: 8.5,
    }), [props.content]);

    return (
        <View style={styles.detailCodeBlock}>
            <View style={styles.detailCodeHeader}>
                <Text style={styles.detailCodeLanguage}>{presentation.label}</Text>
            </View>
            <View style={styles.detailCodeBody}>
                <HorizontalScrollView contentContainerStyle={styles.detailCodeScrollContent}>
                    <View
                        style={[
                            styles.detailCodeHighlighterFrame,
                            {
                                minWidth: codeLayout.minWidth,
                                minHeight: codeLayout.minHeight,
                            },
                        ]}
                    >
                        <SimpleSyntaxHighlighter
                            code={props.content}
                            language={props.language}
                            selectable={rendering.selectable}
                            showLineNumbers={presentation.showLineNumbers}
                            scaleMultiplier={1}
                            virtualized={false}
                            surface={theme.dark ? 'terminal' : 'default'}
                        />
                    </View>
                </HorizontalScrollView>
            </View>
        </View>
    );
}

function SelectableTable(props: {
    headers: MarkdownSpan[][];
    rows: MarkdownSpan[][][];
}) {
    return (
        <View style={styles.detailTableFrame}>
            <HorizontalScrollView>
                <View>
                    <View style={[styles.detailTableRow, styles.detailTableHeaderRow]}>
                        {props.headers.map((header, index) => (
                            <Text selectable key={index} style={[styles.detailTableCell, styles.detailTableHeaderCell]}>
                                <SelectableSpans spans={header} baseStyle={styles.detailTableCell} />
                            </Text>
                        ))}
                    </View>
                    {props.rows.map((row, rowIndex) => (
                        <View key={rowIndex} style={styles.detailTableRow}>
                            {props.headers.map((_, cellIndex) => (
                                <Text selectable key={cellIndex} style={styles.detailTableCell}>
                                    <SelectableSpans spans={row[cellIndex] ?? []} baseStyle={styles.detailTableCell} />
                                </Text>
                            ))}
                        </View>
                    ))}
                </View>
            </HorizontalScrollView>
        </View>
    );
}

function SelectableSpans(props: { spans: MarkdownSpan[]; baseStyle: any }) {
    return (
        <>
            {props.spans.map((span, index) => (
                <Text
                    selectable
                    key={index}
                    style={[
                        props.baseStyle,
                        span.styles.includes('bold') && styles.detailBold,
                        span.styles.includes('italic') && styles.detailItalic,
                        span.styles.includes('code') && styles.detailInlineCode,
                    ]}
                >
                    {span.text}
                </Text>
            ))}
        </>
    );
}

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.surface,
    },
    loadingText: {
        ...Typography.default(),
        fontSize: 16,
        textAlign: 'center',
        marginTop: 50,
    },
    textContainer: {
        flex: 1,
        padding: 16,
    },
    scrollContent: {
        flexGrow: 1,
    },
    detailRoot: {
        gap: 8,
    },
    detailText: {
        ...Typography.default(),
        fontSize: 16,
        lineHeight: 24,
        color: theme.colors.text,
        marginVertical: 4,
    },
    detailHeader: {
        ...Typography.default('semiBold'),
        color: theme.colors.text,
        marginTop: 14,
        marginBottom: 6,
    },
    detailHeader1: {
        fontSize: 24,
        lineHeight: 30,
    },
    detailHeader2: {
        fontSize: 21,
        lineHeight: 28,
    },
    detailHeader3: {
        fontSize: 18,
        lineHeight: 26,
    },
    detailHeader4: {
        fontSize: 16,
        lineHeight: 24,
    },
    detailHeader5: {
        fontSize: 15,
        lineHeight: 22,
    },
    detailHeader6: {
        fontSize: 14,
        lineHeight: 22,
    },
    detailBold: {
        fontWeight: '700',
    },
    detailItalic: {
        fontStyle: 'italic',
    },
    detailInlineCode: {
        ...Typography.mono(),
        fontSize: 14,
        lineHeight: 22,
        color: theme.colors.text,
        backgroundColor: theme.colors.surfaceHighest,
        borderRadius: 4,
        paddingHorizontal: 4,
    },
    detailList: {
        gap: 6,
        marginVertical: 6,
    },
    detailListRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
    },
    detailListMarker: {
        ...Typography.default('semiBold'),
        color: theme.colors.textSecondary,
        fontSize: 16,
        lineHeight: 24,
        minWidth: 18,
        textAlign: 'center',
    },
    detailNumberMarker: {
        ...Typography.default('semiBold'),
        color: theme.colors.textSecondary,
        fontSize: 16,
        lineHeight: 24,
        minWidth: 28,
        textAlign: 'right',
    },
    detailListText: {
        ...Typography.default(),
        color: theme.colors.text,
        fontSize: 16,
        lineHeight: 24,
        flex: 1,
    },
    detailRule: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.divider,
        marginVertical: 12,
    },
    detailCodeBlock: {
        backgroundColor: theme.colors.codeSurface.background,
        borderColor: theme.colors.codeSurface.border,
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
        marginVertical: 10,
        overflow: 'hidden',
    },
    detailCodeHeader: {
        alignItems: 'center',
        backgroundColor: theme.colors.codeSurface.headerBackground,
        borderBottomColor: theme.colors.codeSurface.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
        flexDirection: 'row',
        minHeight: 38,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    detailCodeLanguage: {
        ...Typography.mono(),
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontWeight: '600',
        lineHeight: 16,
    },
    detailCodeBody: {
        backgroundColor: theme.colors.codeSurface.background,
    },
    detailCodeScrollContent: {
        flexDirection: 'row',
        paddingVertical: 12,
    },
    detailCodeHighlighterFrame: {
        alignSelf: 'flex-start',
    },
    detailTableFrame: {
        borderColor: theme.colors.divider,
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
        marginVertical: 10,
        overflow: 'hidden',
    },
    detailTableRow: {
        flexDirection: 'row',
    },
    detailTableHeaderRow: {
        backgroundColor: theme.colors.surfaceHigh,
    },
    detailTableCell: {
        ...Typography.default(),
        color: theme.colors.text,
        fontSize: 14,
        lineHeight: 20,
        minWidth: 120,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    detailTableHeaderCell: {
        fontWeight: '700',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        marginRight: 4,
    },
    headerAction: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
    },
}));
