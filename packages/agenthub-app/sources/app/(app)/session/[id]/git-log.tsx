import * as React from 'react';
import { View, ActivityIndicator, ScrollView, Modal as RNModal, Pressable, useWindowDimensions } from 'react-native';
import { t } from '@/text';
import { useLocalSearchParams } from 'expo-router';
import Octicons from '@expo/vector-icons/Octicons';
import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';
import { useUnistyles, StyleSheet } from 'react-native-unistyles';
import { layout } from '@/components/layout';
import { useAgentHubAction } from '@/hooks/useAgentHubAction';
import { buildGitGraphOverlayLayout, buildGitGraphTrackRows, getGitGraph, GitGraphOverlayLayout, GitGraphTrackRow } from '@/utils/gitOperations';
import { storage, useSessionProjectGitStatus } from '@/sync/storage';
import { useEnsureSessionLoaded } from '@/hooks/useEnsureSessionLoaded';
import Svg, { Circle, Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { getAmberRaisedButtonVisuals } from '@/components/amberVisuals';
import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';
import { sync } from '@/sync/sync';

function getCwd(sessionId: string): string | null {
    const session = storage.getState().sessions[sessionId];
    return session?.metadata?.path ?? null;
}

function formatRelativeTime(timestamp: number): string {
    if (!timestamp || timestamp <= 0) return t('status.unknown');
    const now = Date.now() / 1000;
    const diff = now - timestamp;

    if (diff < 60) return t('time.justNow');
    if (diff < 3600) return t('time.minutesAgo', { count: Math.floor(diff / 60) });
    if (diff < 86400) return t('time.hoursAgo', { count: Math.floor(diff / 3600) });

    return new Date(timestamp * 1000).toLocaleString();
}

const LANE_COLORS = ['#5AC8FA', '#FF9F0A', '#34C759', '#AF52DE', '#FF375F', '#64D2FF', '#FFD60A', '#30D158'];
const LANE_WIDTH = 15;
const NODE_RADIUS = 3.5;
const TRACK_THICKNESS = 2.5;
const MIN_GRAPH_WIDTH = 44;
const ROW_HEIGHT = 60;
const NODE_CENTER_Y = ROW_HEIGHT / 2;
const GRAPH_GUTTER = 6;
const GRAPH_RIGHT_PADDING = 6;

function getLaneColor(colorKey: number | null, fallback: string) {
    if (colorKey == null) return fallback;
    return LANE_COLORS[colorKey % LANE_COLORS.length];
}

function buildConnectorPath(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    direction: 'straight' | 'left' | 'right'
) {
    if (direction === 'straight' || startX === endX) {
        return `M ${startX} ${startY} L ${endX} ${endY}`;
    }

    const controlOffset = Math.max(8, Math.abs(endX - startX) * 0.5);
    const controlX = direction === 'left'
        ? Math.min(startX, endX) - controlOffset
        : Math.max(startX, endX) + controlOffset;
    const midY = startY + ((endY - startY) * 0.5);

    return `M ${startX} ${startY} C ${startX} ${midY}, ${controlX} ${midY}, ${endX} ${endY}`;
}

function buildOverlayBranchPath(points: Array<{ x: number; y: number; lockedFirst: boolean }>) {
    if (points.length === 0) return '';
    let path = '';
    const curveDepth = ROW_HEIGHT * 0.8;
    for (let index = 0; index < points.length; index += 1) {
        const point = points[index];
        const x = GRAPH_GUTTER + point.x * LANE_WIDTH + (LANE_WIDTH / 2);
        const y = NODE_CENTER_Y + point.y * ROW_HEIGHT;
        if (index === 0) {
            path += `M ${x} ${y}`;
            continue;
        }
        const prev = points[index - 1];
        const prevX = GRAPH_GUTTER + prev.x * LANE_WIDTH + (LANE_WIDTH / 2);
        const prevY = NODE_CENTER_Y + prev.y * ROW_HEIGHT;
        if (prevX === x) {
            path += ` L ${x} ${y}`;
            continue;
        }
        const offset = Math.min(curveDepth, Math.abs(y - prevY) * 0.8);
        if (point.lockedFirst) {
            path += ` C ${prevX} ${prevY + offset}, ${x} ${y - offset}, ${x} ${y}`;
        } else {
            path += ` C ${prevX} ${prevY + offset}, ${x} ${y - offset}, ${x} ${y}`;
        }
    }
    return path;
}

function GraphOverlay({
    layout,
    width,
    textSecondary,
}: {
    layout: GitGraphOverlayLayout;
    width: number;
    textSecondary: string;
}) {
    const height = Math.max(layout.rows.length * ROW_HEIGHT, ROW_HEIGHT);
    return (
        <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0, zIndex: 0 }} pointerEvents="none">
            {layout.paths.map((branchPath, index) => {
                const color = getLaneColor(branchPath.colorKey, textSecondary);
                const d = buildOverlayBranchPath(branchPath.points);
                return (
                    <React.Fragment key={`branch-${index}`}>
                        <Path d={d} stroke="rgba(255,255,255,0.55)" strokeWidth={TRACK_THICKNESS + 2} fill="none" strokeLinecap="round" />
                        <Path d={d} stroke={color} strokeWidth={TRACK_THICKNESS} fill="none" strokeLinecap="round" />
                    </React.Fragment>
                );
            })}
            {layout.nodes.map((node) => {
                const color = getLaneColor(node.colorKey, textSecondary);
                const cx = GRAPH_GUTTER + node.lane * LANE_WIDTH + (LANE_WIDTH / 2);
                const cy = NODE_CENTER_Y + node.rowIndex * ROW_HEIGHT;
                return (
                    <Circle
                        key={`node-${node.hash}`}
                        cx={cx}
                        cy={cy}
                        r={NODE_RADIUS}
                        fill={node.isHead ? undefined : color}
                        stroke={node.isHead ? color : 'rgba(255,255,255,0.55)'}
                        strokeWidth={node.isHead ? 2 : 1}
                    />
                );
            })}
        </Svg>
    );
}

function CommitDetailModal({
    entry,
    visible,
    onClose,
}: {
    entry: GitGraphTrackRow['entry'] | null;
    visible: boolean;
    onClose: () => void;
}) {
    const { theme } = useUnistyles();
    const amberVisuals = getAmberRaisedButtonVisuals(theme);

    if (!entry) return null;

    return (
        <RNModal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
            <View style={styles.modalBackdrop}>
                <Pressable
                    accessibilityLabel={t('common.close')}
                    accessibilityRole="button"
                    style={styles.modalBackdropPressable}
                    onPress={onClose}
                />
                <View
                    accessibilityLabel={t('gitActions.commitDetails')}
                    accessibilityViewIsModal
                    aria-modal
                    role="dialog"
                    style={[styles.modalCard, { backgroundColor: theme.colors.surfaceHigh, borderColor: theme.colors.glass.borderStrong, shadowColor: theme.colors.glass.shadow }]}
                >
                    <LinearGradient
                        pointerEvents="none"
                        colors={[theme.colors.glass.highlight, 'rgba(255,255,255,0)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0.7, y: 0.55 }}
                        style={styles.modalCornerHighlight}
                    />
                    <View style={[styles.modalHeader, { borderBottomColor: theme.colors.divider }]}>
                        <View style={styles.modalTitleRow}>
                            <View style={[styles.modalIconBadge, { borderColor: amberVisuals.borderColor, backgroundColor: theme.colors.accentSoft }]}>
                                <Octicons name="git-commit" size={16} color={theme.colors.accent} />
                            </View>
                            <View style={styles.modalTitleCopy}>
                                <Text style={[styles.modalTitle, { color: theme.colors.text }]}>{t('gitActions.commitDetails')}</Text>
                                <Text style={[styles.modalSubtitle, { color: theme.colors.textSecondary }]}>
                                    {entry.shortHash} · {formatRelativeTime(entry.timestamp)}
                                </Text>
                            </View>
                        </View>
                        <Pressable
                            accessibilityLabel={t('common.close')}
                            accessibilityRole="button"
                            onPress={onClose}
                            hitSlop={8}
                            style={[styles.modalCloseButton, { backgroundColor: theme.colors.input.background }]}
                        >
                            <Octicons name="x" size={17} color={theme.colors.textSecondary} />
                        </Pressable>
                    </View>
                    <View style={[styles.modalSection, styles.modalSubjectBlock, { backgroundColor: theme.colors.input.background, borderColor: theme.colors.glass.border }]}>
                        <Text style={[styles.modalSubject, { color: theme.colors.text }]}>{entry.subject}</Text>
                        <Text style={[styles.modalMeta, { color: theme.colors.textSecondary }]}>
                            {entry.author}
                        </Text>
                    </View>
                    <View style={[styles.modalInfoGrid, { borderColor: theme.colors.glass.border }]}>
                        <View style={styles.modalInfoRow}>
                            <Text style={[styles.modalLabel, { color: theme.colors.textSecondary }]}>{t('gitActions.hash')}</Text>
                            <Text style={[styles.modalValueMono, { color: theme.colors.text }]} numberOfLines={2}>{entry.hash}</Text>
                        </View>
                        {entry.parents && entry.parents.length > 0 && (
                            <View style={[styles.modalInfoRow, { borderTopColor: theme.colors.divider, borderTopWidth: StyleSheet.hairlineWidth }]}>
                                <Text style={[styles.modalLabel, { color: theme.colors.textSecondary }]}>{t('gitActions.parents')}</Text>
                                <Text style={[styles.modalValueMono, { color: theme.colors.text }]}>{entry.parents.join('\n')}</Text>
                            </View>
                        )}
                    </View>
                    {entry.refs.length > 0 && (
                        <View style={[styles.modalSection, styles.modalRefsBlock, { backgroundColor: theme.colors.input.background, borderColor: theme.colors.glass.border }]}>
                            <Text style={[styles.modalLabel, { color: theme.colors.textSecondary }]}>{t('gitActions.refs')}</Text>
                            <View style={styles.refsWrap}>
                                {entry.refs.map((ref) => (
                                    <View key={ref} style={[styles.refChip, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.accentSoft }]}>
                                        <Text style={[styles.refChipText, { color: theme.colors.accentDark }]}>{ref}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}
                </View>
            </View>
        </RNModal>
    );
}

function GraphRow({
    row,
    graphWidth,
    textColor,
    textSecondary,
    dividerColor,
    maxInlineRefs,
    onPress,
}: {
    row: GitGraphTrackRow;
    graphWidth: number;
    textColor: string;
    textSecondary: string;
    dividerColor: string;
    maxInlineRefs: number;
    onPress: () => void;
}) {
    return (
        <Pressable
            accessibilityLabel={t('gitActions.openCommitDetails', {
                subject: row.entry.subject,
                hash: row.entry.shortHash,
            })}
            accessibilityRole="button"
            onPress={onPress}
            style={[styles.graphVisualRow, { borderBottomColor: dividerColor }]}
        >
            <View style={styles.graphLaneSpacer}>
                <View style={{ width: graphWidth, minWidth: graphWidth, flexShrink: 0 }} />
            </View>
            <View style={styles.graphMeta}>
                <View style={styles.graphMetaHeader}>
                    <Text style={[styles.graphSubject, { color: textColor }]} numberOfLines={1}>
                        {row.entry.subject}
                    </Text>
                    <Text style={[styles.graphHash, { color: textSecondary }]}>{row.entry.shortHash}</Text>
                </View>
                <View style={styles.graphMetaFooter}>
                    <Text style={[styles.graphAuthor, { color: textSecondary }]} numberOfLines={1}>
                        {row.entry.author}
                    </Text>
                    <Text style={[styles.graphTime, { color: textSecondary }]} numberOfLines={1}>
                        {formatRelativeTime(row.entry.timestamp)}
                    </Text>
                    {row.entry.refs.length > 0 ? (
                        <View style={styles.refsInline}>
                            {row.entry.refs.slice(0, maxInlineRefs).map((ref) => (
                                <View key={`${row.entry.hash}-${ref}`} style={[styles.refChip, { borderColor: dividerColor, backgroundColor: `${textSecondary}14` }]}>
                                    <Text style={[styles.refChipText, { color: textSecondary }]} numberOfLines={1}>
                                        {ref}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    ) : null}
                </View>
            </View>
        </Pressable>
    );
}

export default React.memo(function GitLogScreen() {
    const { id: sessionId } = useLocalSearchParams<{ id: string }>();
    const { theme } = useUnistyles();
    const { width: windowWidth } = useWindowDimensions();
    const { session, isLoading: isEnsuringSession } = useEnsureSessionLoaded(sessionId);
    const gitStatus = useSessionProjectGitStatus(sessionId!);
    const [graphRows, setGraphRows] = React.useState<GitGraphTrackRow[]>([]);
    const [graphLayout, setGraphLayout] = React.useState<GitGraphOverlayLayout | null>(null);
    const [selectedEntry, setSelectedEntry] = React.useState<GitGraphTrackRow['entry'] | null>(null);
    const cwd = session?.metadata?.path ?? getCwd(sessionId!);
    const graphWidth = React.useMemo(() => {
        const maxLane = graphLayout?.maxLane ?? graphRows.reduce((max, row) => Math.max(max, row.maxLane), 0);
        return Math.max(MIN_GRAPH_WIDTH, GRAPH_GUTTER + ((maxLane + 1) * LANE_WIDTH) + GRAPH_RIGHT_PADDING);
    }, [graphLayout, graphRows]);
    const maxInlineRefs = windowWidth < 520 ? 1 : 2;

    const [loading, doFetch] = useAgentHubAction(async () => {
        if (!cwd) return;

        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        const graphResult = await runSessionActionRequest({
            isCurrent,
            request: () => getGitGraph(sessionId!, cwd, 120),
        });
        if (!graphResult) {
            return;
        }
        if (graphResult.success) {
            setGraphRows(buildGitGraphTrackRows(graphResult.entries));
            setGraphLayout(buildGitGraphOverlayLayout(graphResult.entries));
        }
    });

    React.useEffect(() => {
        if (!cwd) {
            setGraphRows([]);
            setGraphLayout(null);
            return;
        }
        doFetch();
    }, [cwd, doFetch]);

    return (
        <>
            <ScrollView style={[styles.container, { backgroundColor: theme.colors.canvas }]} contentContainerStyle={styles.content}>
                <View style={[styles.branchCard, { backgroundColor: theme.colors.surfaceHigh, borderColor: theme.colors.glass.border, shadowColor: theme.colors.glass.shadow }]}>
                    <View style={styles.branchHeader}>
                        <Octicons name="git-branch" size={16} color={theme.colors.textSecondary} />
                        <Text style={[styles.branchTitle, { color: theme.colors.text }]}>{gitStatus?.branch || t('files.detachedHead')}</Text>
                    </View>
                    <Text style={[styles.branchMeta, { color: theme.colors.textSecondary }]}>
                        {t('files.summary', {
                            staged: gitStatus?.stagedCount ?? 0,
                            unstaged: (gitStatus?.modifiedCount ?? 0) + (gitStatus?.untrackedCount ?? 0),
                        })}
                    </Text>
                    {(gitStatus?.aheadCount || gitStatus?.behindCount) ? (
                        <Text style={[styles.branchMeta, { color: theme.colors.textSecondary }]}>
                            {gitStatus?.aheadCount ? t('gitActions.ahead', { count: gitStatus.aheadCount }) : ''}
                            {gitStatus?.aheadCount && gitStatus?.behindCount ? ' ' : ''}
                            {gitStatus?.behindCount ? t('gitActions.behind', { count: gitStatus.behindCount }) : ''}
                        </Text>
                    ) : null}
                </View>

                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('files.gitGraph')}</Text>
                    <View style={[styles.graphCard, { backgroundColor: theme.colors.surfaceHigh, borderColor: theme.colors.glass.border, shadowColor: theme.colors.glass.shadow }]}>
                        {((isEnsuringSession && !cwd) || (loading && graphRows.length === 0)) ? (
                            <View style={styles.centerState}>
                                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                            </View>
                        ) : graphRows.length === 0 ? (
                            <View style={styles.centerState}>
                                <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>{t('gitActions.gitGraphEmpty')}</Text>
                            </View>
                        ) : (
                            <View style={styles.graphRowsContainer}>
                                {graphLayout ? <GraphOverlay layout={graphLayout} width={graphWidth} textSecondary={theme.colors.textSecondary} /> : null}
                                {graphRows.map((row) => (
                                    <GraphRow
                                        key={`graph-${row.entry.hash}`}
                                        row={row}
                                        graphWidth={graphWidth}
                                        textColor={theme.colors.text}
                                        textSecondary={theme.colors.textSecondary}
                                        dividerColor={theme.colors.divider}
                                        maxInlineRefs={maxInlineRefs}
                                        onPress={() => setSelectedEntry(row.entry)}
                                    />
                                ))}
                            </View>
                        )}
                    </View>
                </View>
            </ScrollView>

            <CommitDetailModal
                entry={selectedEntry}
                visible={!!selectedEntry}
                onClose={() => setSelectedEntry(null)}
            />
        </>
    );
});

const styles = StyleSheet.create(() => ({
    container: {
        flex: 1,
        maxWidth: layout.maxWidth,
        alignSelf: 'center',
        width: '100%',
    },
    content: {
        paddingHorizontal: 10,
        paddingVertical: 12,
        gap: 12,
    },
    branchCard: {
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 10,
        padding: 14,
        gap: 6,
        shadowOpacity: 0.10,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 2,
    },
    branchHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    branchTitle: {
        fontSize: 16,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
    branchMeta: {
        fontSize: 12,
        ...Typography.default(),
    },
    section: {
        gap: 10,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
    graphCard: {
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 8,
        overflow: 'hidden',
        shadowOpacity: 0.08,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 5 },
        elevation: 1,
    },
    graphVisualRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
        borderBottomWidth: StyleSheet.hairlineWidth,
        height: ROW_HEIGHT,
    },
    graphLaneSpacer: {
        flexShrink: 0,
    },
    graphRowsContainer: {
        position: 'relative',
    },
    graphMeta: {
        flex: 1,
        minWidth: 0,
        height: ROW_HEIGHT,
        paddingVertical: 10,
        paddingRight: 8,
        paddingLeft: 4,
        gap: 3,
        justifyContent: 'center',
        overflow: 'hidden',
        zIndex: 1,
    },
    graphMetaHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
    },
    graphMetaFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'nowrap',
        minWidth: 0,
    },
    graphSubject: {
        flex: 1,
        fontSize: 13,
        ...Typography.default('semiBold'),
    },
    graphHash: {
        fontSize: 10,
        ...Typography.mono(),
    },
    graphAuthor: {
        fontSize: 11,
        ...Typography.default(),
    },
    graphTime: {
        fontSize: 11,
        ...Typography.default(),
    },
    refsInline: {
        flexDirection: 'row',
        gap: 4,
        flexShrink: 1,
        minWidth: 0,
    },
    refsWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    refChip: {
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 999,
        paddingHorizontal: 7,
        paddingVertical: 2,
        maxWidth: 150,
    },
    refChipText: {
        fontSize: 10,
        ...Typography.mono(),
    },
    centerState: {
        minHeight: 120,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
        gap: 12,
    },
    emptyText: {
        fontSize: 14,
        textAlign: 'center',
        ...Typography.default(),
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalBackdropPressable: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    modalCard: {
        width: '100%',
        maxWidth: 720,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 16,
        padding: 0,
        gap: 14,
        overflow: 'hidden',
        shadowOpacity: 0.26,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 16 },
        elevation: 8,
    },
    modalCornerHighlight: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '72%',
        height: 150,
        zIndex: 1,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingHorizontal: 18,
        paddingTop: 16,
        paddingBottom: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        zIndex: 2,
    },
    modalTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
        minWidth: 0,
    },
    modalIconBadge: {
        width: 34,
        height: 34,
        borderRadius: 10,
        borderWidth: StyleSheet.hairlineWidth,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    modalTitleCopy: {
        flex: 1,
        minWidth: 0,
    },
    modalCloseButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    modalTitle: {
        fontSize: 17,
        ...Typography.default('semiBold'),
    },
    modalSubtitle: {
        fontSize: 12,
        marginTop: 2,
        ...Typography.default(),
    },
    modalSection: {
        gap: 6,
        marginHorizontal: 18,
        zIndex: 2,
    },
    modalSubjectBlock: {
        marginTop: 2,
        padding: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 12,
    },
    modalRefsBlock: {
        marginBottom: 18,
        padding: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 12,
    },
    modalSubject: {
        fontSize: 16,
        lineHeight: 22,
        ...Typography.default('semiBold'),
    },
    modalMeta: {
        fontSize: 13,
        ...Typography.default(),
    },
    modalLabel: {
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: 0,
        ...Typography.default('semiBold'),
    },
    modalValueMono: {
        fontSize: 12,
        lineHeight: 18,
        ...Typography.mono(),
    },
    modalInfoGrid: {
        marginHorizontal: 18,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 12,
        overflow: 'hidden',
        zIndex: 2,
    },
    modalInfoRow: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 5,
    },
}));
