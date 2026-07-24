import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { UsageDataPoint } from '@/sync/apiUsage';
import { sumUsageMetric } from '@/sync/apiUsage';
import { getCurrentLanguage, t } from '@/text';
import { Typography } from '@/constants/Typography';

interface UsageChartProps {
    data: UsageDataPoint[];
    height?: number;
    agentFilter?: string;
}

type SegmentKey = 'input' | 'cache_read' | 'cache_creation' | 'output' | 'reasoning_output' | 'other';

const segmentOrder: SegmentKey[] = ['input', 'cache_read', 'cache_creation', 'output', 'reasoning_output', 'other'];

const styles = StyleSheet.create((theme) => ({
    container: {
        marginTop: 4,
        gap: 10,
    },
    axisCaptionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
    },
    axisCaption: {
        ...Typography.default('semiBold'),
        fontSize: 11,
        lineHeight: 15,
        color: theme.colors.textSecondary,
    },
    legend: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    legendDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    legendText: {
        ...Typography.default(),
        fontSize: 11,
        lineHeight: 15,
        color: theme.colors.textSecondary,
    },
    chartFrame: {
        flexDirection: 'row',
        borderRadius: 10,
        padding: 10,
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.026)' : 'rgba(250, 253, 253, 0.62)',
        borderWidth: 1,
        borderColor: theme.dark ? 'rgba(255, 255, 255, 0.055)' : 'rgba(255, 255, 255, 0.78)',
    },
    yAxis: {
        width: 46,
        paddingRight: 8,
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    },
    yAxisText: {
        ...Typography.default(),
        fontSize: 10,
        lineHeight: 13,
        color: theme.colors.textSecondary,
    },
    plotShell: {
        position: 'relative',
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 2,
    },
    gridLine: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.080)' : 'rgba(28, 44, 52, 0.11)',
    },
    barColumn: {
        width: 44,
        alignItems: 'center',
    },
    barPressable: {
        alignItems: 'center',
        justifyContent: 'flex-end',
        width: '100%',
    },
    barStack: {
        width: 20,
        borderRadius: 4,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: theme.dark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(28, 44, 52, 0.12)',
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(28, 44, 52, 0.050)',
        flexDirection: 'column-reverse',
    },
    selectedBar: {
        borderColor: theme.colors.accent,
        shadowColor: theme.colors.accentGlow,
        shadowOpacity: 0.34,
        shadowRadius: 8,
    },
    xLabel: {
        ...Typography.default(),
        height: 24,
        marginTop: 6,
        fontSize: 10,
        lineHeight: 12,
        color: theme.colors.textSecondary,
        textAlign: 'center',
    },
    selectedPanel: {
        borderRadius: 10,
        paddingHorizontal: 11,
        paddingVertical: 9,
        gap: 6,
        backgroundColor: theme.dark ? 'rgba(255, 178, 46, 0.075)' : 'rgba(217, 144, 18, 0.080)',
        borderWidth: 1,
        borderColor: theme.colors.glass.edgeWarm,
    },
    selectedHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
    },
    selectedTitle: {
        ...Typography.default('semiBold'),
        fontSize: 12,
        lineHeight: 16,
        color: theme.colors.text,
    },
    selectedValue: {
        ...Typography.default('semiBold'),
        fontSize: 12,
        lineHeight: 16,
        color: theme.colors.accent,
    },
    selectedMeta: {
        ...Typography.default(),
        fontSize: 11,
        lineHeight: 15,
        color: theme.colors.textSecondary,
    },
    emptyState: {
        padding: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.028)' : 'rgba(250, 253, 253, 0.62)',
        borderWidth: 1,
        borderColor: theme.colors.glass.border,
    },
    emptyText: {
        ...Typography.default(),
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.textSecondary,
    },
}));

function formatTokens(tokens: number): string {
    if (tokens >= 1000000) {
        return `${(tokens / 1000000).toFixed(1)}M`;
    }
    if (tokens >= 1000) {
        return `${(tokens / 1000).toFixed(tokens >= 10000 ? 0 : 1)}K`;
    }
    return tokens.toLocaleString();
}

function formatBucketLabel(timestamp: number, isIntraday: boolean): string {
    const date = new Date(timestamp * 1000);
    const locale = getCurrentLanguage();
    if (isIntraday) {
        return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    return date.toLocaleDateString(locale, { month: 'numeric', day: 'numeric' });
}

function getScopedTokens(point: UsageDataPoint, agentFilter: string): Record<string, number> {
    if (agentFilter === 'all') {
        return point.tokens;
    }
    return point.byAgent?.[agentFilter]?.tokens ?? {};
}

function getScopedReportCount(point: UsageDataPoint, agentFilter: string): number {
    if (agentFilter === 'all') {
        return point.reportCount || 0;
    }
    return point.byAgent?.[agentFilter]?.reportCount || 0;
}

function buildSegments(tokens: Record<string, number>, total: number) {
    const known = segmentOrder.filter(key => key !== 'other').reduce((sum, key) => sum + (tokens[key] || 0), 0);
    const values: Record<SegmentKey, number> = {
        input: tokens.input || 0,
        cache_read: tokens.cache_read || 0,
        cache_creation: tokens.cache_creation || 0,
        output: tokens.output || 0,
        reasoning_output: tokens.reasoning_output || 0,
        other: Math.max(total - known, 0),
    };
    return segmentOrder
        .map(key => ({ key, value: values[key] }))
        .filter(segment => segment.value > 0);
}

export const UsageChart: React.FC<UsageChartProps> = ({
    data,
    height = 190,
    agentFilter = 'all',
}) => {
    const { theme } = useUnistyles();
    const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null);

    if (!data || data.length === 0) {
        return (
            <View style={styles.emptyState}>
                <Text style={styles.emptyText}>{t('usage.noData')}</Text>
            </View>
        );
    }

    const maxBarsToShow = 30;
    const displayData = data.length > maxBarsToShow ? data.slice(-maxBarsToShow) : data;
    const values = displayData.map(point => sumUsageMetric(getScopedTokens(point, agentFilter)));
    const maxValue = Math.max(...values, 1);
    const selected = selectedIndex == null
        ? displayData.length - 1
        : Math.min(selectedIndex, displayData.length - 1);
    const selectedPoint = displayData[selected];
    const selectedTokens = selectedPoint ? getScopedTokens(selectedPoint, agentFilter) : {};
    const selectedValue = sumUsageMetric(selectedTokens);
    const timeSpan = displayData.length > 1
        ? displayData[displayData.length - 1].timestamp - displayData[0].timestamp
        : 0;
    const isIntraday = timeSpan > 0 && timeSpan <= 36 * 60 * 60;
    const labelEvery = displayData.length > 18 ? Math.ceil(displayData.length / 8) : displayData.length > 10 ? 2 : 1;

    const colors: Record<SegmentKey, string> = {
        input: theme.colors.textLink,
        cache_read: theme.colors.status.connected,
        cache_creation: theme.colors.accent,
        output: theme.colors.permission.safeYolo,
        reasoning_output: theme.colors.permission.acceptEdits,
        other: theme.dark ? 'rgba(255, 255, 255, 0.24)' : 'rgba(28, 44, 52, 0.24)',
    };
    const labels: Record<SegmentKey, string> = {
        input: t('usage.metricInput'),
        cache_read: t('usage.metricCacheRead'),
        cache_creation: t('usage.metricCacheCreation'),
        output: t('usage.metricOutput'),
        reasoning_output: t('usage.metricReasoning'),
        other: t('usage.metricOther'),
    };
    const activeSegments = segmentOrder.filter(key => displayData.some(point => {
        const tokens = getScopedTokens(point, agentFilter);
        if (key === 'other') {
            const total = sumUsageMetric(tokens);
            const known = segmentOrder.filter(segment => segment !== 'other').reduce((sum, segment) => sum + (tokens[segment] || 0), 0);
            return total - known > 0;
        }
        return (tokens[key] || 0) > 0;
    }));

    return (
        <View style={styles.container}>
            <View style={styles.axisCaptionRow}>
                <Text style={styles.axisCaption}>{t('usage.axisTokens')}</Text>
                <Text style={styles.axisCaption}>{t('usage.axisTime')}</Text>
            </View>

            <View style={styles.legend}>
                {activeSegments.map(key => (
                    <View key={key} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: colors[key] }]} />
                        <Text style={styles.legendText}>{labels[key]}</Text>
                    </View>
                ))}
            </View>

            <View style={styles.chartFrame}>
                <View style={[styles.yAxis, { height: height + 30 }]}>
                    <Text style={styles.yAxisText}>{formatTokens(maxValue)}</Text>
                    <Text style={styles.yAxisText}>{formatTokens(maxValue / 2)}</Text>
                    <Text style={styles.yAxisText}>0</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
                    <View style={[styles.plotShell, { height: height + 30 }]}>
                        <View pointerEvents="none" style={[styles.gridLine, { bottom: 30 + height }]} />
                        <View pointerEvents="none" style={[styles.gridLine, { bottom: 30 + height / 2 }]} />
                        <View pointerEvents="none" style={[styles.gridLine, { bottom: 30 }]} />
                        {displayData.map((point, index) => {
                            const tokens = getScopedTokens(point, agentFilter);
                            const value = sumUsageMetric(tokens);
                            const barHeight = value > 0 ? Math.max((value / maxValue) * height, 3) : 0;
                            const segments = buildSegments(tokens, value);
                            const showLabel = index === 0 || index === displayData.length - 1 || index % labelEvery === 0;
                            const isSelected = index === selected;

                            return (
                                <View key={`${point.timestamp}-${index}`} style={styles.barColumn}>
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={`${formatBucketLabel(point.timestamp, isIntraday)} ${formatTokens(value)} ${t('usage.tokens')}`}
                                        onPress={() => setSelectedIndex(index)}
                                        style={[styles.barPressable, { height }]}
                                    >
                                        <View style={[
                                            styles.barStack,
                                            isSelected && styles.selectedBar,
                                            { height: barHeight }
                                        ]}>
                                            {segments.map(segment => (
                                                <View
                                                    key={segment.key}
                                                    style={{
                                                        flex: segment.value,
                                                        backgroundColor: colors[segment.key],
                                                    }}
                                                />
                                            ))}
                                        </View>
                                    </Pressable>
                                    <Text style={styles.xLabel} numberOfLines={2}>
                                        {showLabel ? formatBucketLabel(point.timestamp, isIntraday) : ''}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                </ScrollView>
            </View>

            {selectedPoint && (
                <View style={styles.selectedPanel}>
                    <View style={styles.selectedHeader}>
                        <Text style={styles.selectedTitle}>
                            {formatBucketLabel(selectedPoint.timestamp, isIntraday)}
                        </Text>
                        <Text style={styles.selectedValue}>
                            {formatTokens(selectedValue)} {t('usage.tokens')}
                        </Text>
                    </View>
                    <Text style={styles.selectedMeta}>
                        {t('usage.bucketDetail', {
                            reports: getScopedReportCount(selectedPoint, agentFilter),
                            input: formatTokens(selectedTokens.input || 0),
                            output: formatTokens(selectedTokens.output || 0),
                        })}
                    </Text>
                </View>
            )}
        </View>
    );
};
