import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/components/StyledText';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useAuth } from '@/auth/AuthContext';
import { UsageChart } from './UsageChart';
import { calculateTotals, getUsageForPeriod, sumUsageMetric, UsageDataPoint } from '@/sync/apiUsage';
import { UsageDimensionTotal } from '@/sync/apiUsageTotals';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AgentHubError } from '@/utils/errors';
import { getCurrentLanguage, t } from '@/text';
import { sync } from '@/sync/sync';
import { GlassSurface } from '@/components/glass';
import { Typography } from '@/constants/Typography';
import { getSpaceKeyActivationProps } from '@/components/keyboardActivation';

type TimePeriod = 'today' | '7days' | '30days';
type TokenMetricKey = 'input' | 'cache_read' | 'cache_creation' | 'output' | 'reasoning_output' | 'other';

const tokenMetricOrder: TokenMetricKey[] = ['input', 'cache_read', 'cache_creation', 'output', 'reasoning_output', 'other'];

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.canvas,
    },
    content: {
        paddingHorizontal: 14,
        paddingTop: 14,
        paddingBottom: 28,
        gap: 14,
    },
    selectorGroup: {
        gap: 8,
    },
    selectorLabel: {
        ...Typography.default('semiBold'),
        fontSize: 11,
        lineHeight: 15,
        color: theme.colors.textSecondary,
    },
    periodSelector: {
        flexDirection: 'row',
        gap: 6,
        padding: 4,
        borderRadius: 12,
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(238, 246, 248, 0.74)',
        borderWidth: 1,
        borderColor: theme.dark ? 'rgba(255, 255, 255, 0.055)' : 'rgba(255, 255, 255, 0.80)',
    },
    periodButton: {
        flex: 1,
        minHeight: 44,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    periodButtonActive: {
        backgroundColor: theme.colors.accent,
    },
    periodText: {
        ...Typography.default('semiBold'),
        fontSize: 13,
        lineHeight: 17,
        color: theme.colors.text,
    },
    periodTextActive: {
        color: theme.colors.button.primary.tint,
    },
    hero: {
        padding: 14,
        borderRadius: 16,
        gap: 12,
    },
    heroTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
    },
    eyebrow: {
        ...Typography.default('semiBold'),
        fontSize: 12,
        lineHeight: 16,
        color: theme.colors.textLink,
    },
    title: {
        ...Typography.default('semiBold'),
        fontSize: 22,
        lineHeight: 28,
        color: theme.colors.text,
    },
    subtitle: {
        ...Typography.default(),
        fontSize: 13,
        lineHeight: 18,
        color: theme.colors.textSecondary,
        marginTop: 2,
    },
    heroIcon: {
        width: 42,
        height: 42,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.accentSoft,
        borderWidth: 1,
        borderColor: theme.colors.glass.edgeWarm,
    },
    metricGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    metricCard: {
        flexGrow: 1,
        flexBasis: 145,
        minWidth: 0,
        padding: 13,
        borderRadius: 12,
        gap: 8,
    },
    metricLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
    },
    metricLabel: {
        ...Typography.default('semiBold'),
        fontSize: 12,
        lineHeight: 16,
        color: theme.colors.textSecondary,
    },
    metricValue: {
        ...Typography.default('semiBold'),
        fontSize: 22,
        lineHeight: 27,
        color: theme.colors.text,
    },
    metricHint: {
        ...Typography.default(),
        fontSize: 12,
        lineHeight: 16,
        color: theme.colors.textSecondary,
    },
    panel: {
        padding: 14,
        borderRadius: 16,
        gap: 12,
    },
    panelHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
    },
    panelTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sectionTitle: {
        ...Typography.default('semiBold'),
        fontSize: 16,
        lineHeight: 21,
        color: theme.colors.text,
    },
    sectionSubtitle: {
        ...Typography.default(),
        fontSize: 12,
        lineHeight: 16,
        color: theme.colors.textSecondary,
        marginTop: 1,
    },
    loadingContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: 28,
        gap: 10,
    },
    errorContainer: {
        padding: 28,
        alignItems: 'center',
        gap: 10,
    },
    errorText: {
        ...Typography.default(),
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.status.error,
        textAlign: 'center',
    },
    retryButton: {
        minWidth: 96,
        minHeight: 44,
        paddingHorizontal: 18,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.accent,
    },
    retryButtonText: {
        ...Typography.default('semiBold'),
        fontSize: 14,
        lineHeight: 19,
        color: theme.colors.button.primary.tint,
    },
    infoButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.050)' : 'rgba(28, 44, 52, 0.055)',
        borderWidth: 1,
        borderColor: theme.colors.glass.border,
    },
    infoPanel: {
        padding: 11,
        borderRadius: 10,
        backgroundColor: theme.dark ? 'rgba(95, 168, 255, 0.075)' : 'rgba(39, 109, 212, 0.070)',
        borderWidth: 1,
        borderColor: theme.dark ? 'rgba(95, 168, 255, 0.22)' : 'rgba(39, 109, 212, 0.16)',
    },
    infoText: {
        ...Typography.default(),
        fontSize: 12,
        lineHeight: 17,
        color: theme.colors.textSecondary,
    },
    compositionTrack: {
        height: 14,
        borderRadius: 5,
        overflow: 'hidden',
        flexDirection: 'row',
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(28, 44, 52, 0.060)',
        borderWidth: 1,
        borderColor: theme.colors.glass.border,
    },
    compositionSegment: {
        height: '100%',
    },
    compositionGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 9,
    },
    compositionItem: {
        flexGrow: 1,
        flexBasis: 128,
        minWidth: 0,
        gap: 5,
        padding: 10,
        borderRadius: 10,
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.032)' : 'rgba(255, 255, 255, 0.50)',
        borderWidth: 1,
        borderColor: theme.colors.glass.border,
    },
    compositionLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    compositionDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    compositionLabel: {
        ...Typography.default('semiBold'),
        fontSize: 11,
        lineHeight: 15,
        color: theme.colors.textSecondary,
    },
    compositionValue: {
        ...Typography.default('semiBold'),
        fontSize: 15,
        lineHeight: 19,
        color: theme.colors.text,
    },
    compositionShare: {
        ...Typography.default(),
        fontSize: 11,
        lineHeight: 15,
        color: theme.colors.textSecondary,
    },
    modelList: {
        gap: 10,
    },
    modelRow: {
        gap: 9,
        padding: 12,
        borderRadius: 12,
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.032)' : 'rgba(255, 255, 255, 0.54)',
        borderWidth: 1,
        borderColor: theme.colors.glass.border,
    },
    modelTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
    },
    modelNameGroup: {
        flex: 1,
        minWidth: 0,
        gap: 5,
    },
    modelName: {
        ...Typography.default('semiBold'),
        fontSize: 14,
        lineHeight: 18,
        color: theme.colors.text,
    },
    agentChip: {
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: theme.colors.accentSoft,
        borderWidth: 1,
        borderColor: theme.colors.glass.edgeWarm,
    },
    agentChipText: {
        ...Typography.default('semiBold'),
        fontSize: 10,
        lineHeight: 13,
        color: theme.colors.textLink,
    },
    modelValueGroup: {
        alignItems: 'flex-end',
        gap: 3,
    },
    modelValue: {
        ...Typography.default('semiBold'),
        fontSize: 15,
        lineHeight: 19,
        color: theme.colors.text,
    },
    modelShare: {
        ...Typography.default(),
        fontSize: 11,
        lineHeight: 15,
        color: theme.colors.textSecondary,
    },
    modelMetaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    modelMeta: {
        ...Typography.default(),
        fontSize: 11,
        lineHeight: 15,
        color: theme.colors.textSecondary,
    },
    emptyText: {
        ...Typography.default(),
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.textSecondary,
        textAlign: 'center',
    }
}));

function formatTokens(tokens: number): string {
    if (tokens >= 1000000) {
        return `${(tokens / 1000000).toFixed(2)}M`;
    }
    if (tokens >= 1000) {
        return `${(tokens / 1000).toFixed(tokens >= 10000 ? 0 : 1)}K`;
    }
    return tokens.toLocaleString();
}

function formatPercent(value: number): string {
    if (!Number.isFinite(value)) {
        return '0%';
    }
    return `${Math.round(value * 100)}%`;
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

function getMetricLabel(key: string): string {
    switch (key) {
        case 'input':
            return t('usage.metricInput');
        case 'output':
            return t('usage.metricOutput');
        case 'cache_creation':
            return t('usage.metricCacheCreation');
        case 'cache_read':
            return t('usage.metricCacheRead');
        case 'reasoning_output':
            return t('usage.metricReasoning');
        case 'other':
            return t('usage.metricOther');
        default:
            return key;
    }
}

function getAgentLabel(agent?: string | null): string {
    switch (agent) {
        case 'claude':
            return 'Claude';
        case 'codex':
            return 'Codex';
        case 'unknown':
        case null:
        case undefined:
            return t('usage.agentUnknown');
        default:
            return agent;
    }
}

function getModelLabel(item: UsageDimensionTotal): string {
    if (item.model && item.model.trim().length > 0) {
        return item.model;
    }
    return t('usage.unrecordedModel');
}

function getTokenColors(theme: ReturnType<typeof useUnistyles>['theme']): Record<TokenMetricKey, string> {
    return {
        input: theme.colors.textLink,
        cache_read: theme.colors.status.connected,
        cache_creation: theme.colors.accent,
        output: theme.colors.permission.safeYolo,
        reasoning_output: theme.colors.permission.acceptEdits,
        other: theme.dark ? 'rgba(255, 255, 255, 0.24)' : 'rgba(28, 44, 52, 0.24)',
    };
}

function buildTokenComposition(tokensByMetric: Record<string, number>, totalTokens: number) {
    const knownTotal = tokenMetricOrder
        .filter(key => key !== 'other')
        .reduce((sum, key) => sum + (tokensByMetric[key] || 0), 0);
    const values: Record<TokenMetricKey, number> = {
        input: tokensByMetric.input || 0,
        cache_read: tokensByMetric.cache_read || 0,
        cache_creation: tokensByMetric.cache_creation || 0,
        output: tokensByMetric.output || 0,
        reasoning_output: tokensByMetric.reasoning_output || 0,
        other: Math.max(totalTokens - knownTotal, 0),
    };
    const compositionTotal = Object.values(values).reduce((sum, value) => sum + value, 0);

    return tokenMetricOrder
        .map(key => ({ key, value: values[key], share: compositionTotal > 0 ? values[key] / compositionTotal : 0 }))
        .filter(item => item.value > 0);
}

export const UsagePanel: React.FC<{ sessionId?: string }> = ({ sessionId }) => {
    const { theme } = useUnistyles();
    const auth = useAuth();
    const [period, setPeriod] = useState<TimePeriod>('7days');
    const [agentFilter, setAgentFilter] = useState('all');
    const [showModelGuide, setShowModelGuide] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [usageData, setUsageData] = useState<UsageDataPoint[]>([]);
    const [retryKey, setRetryKey] = useState(0);
    const generation = sync.getAccountGeneration();

    useEffect(() => {
        const controller = new AbortController();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;

        const loadUsageData = async () => {
            if (!auth.credentials || generation === null) {
                setError(t('usage.notAuthenticated'));
                setLoading(false);
                return;
            }

            setLoading(true);
            setError(null);

            try {
                const response = await getUsageForPeriod(auth.credentials, period, sessionId, controller.signal);
                if (controller.signal.aborted || !isCurrent()) return;
                setUsageData(response.usage || []);
            } catch (err) {
                if (controller.signal.aborted || !isCurrent()) return;
                console.warn('Failed to load usage data:', err);
                if (err instanceof AgentHubError) {
                    setError(err.message);
                } else {
                    setError(t('usage.loadFailed'));
                }
            } finally {
                if (!controller.signal.aborted && isCurrent()) {
                    setLoading(false);
                }
            }
        };

        void loadUsageData();
        return () => {
            controller.abort();
        };
    }, [auth.credentials, generation, period, retryKey, sessionId]);

    const allTotals = useMemo(() => calculateTotals(usageData), [usageData]);
    const totals = useMemo(() => calculateTotals(usageData, agentFilter), [usageData, agentFilter]);
    const tokenColors = getTokenColors(theme);

    const periodLabels: Record<TimePeriod, string> = {
        today: t('usage.today'),
        '7days': t('usage.last7Days'),
        '30days': t('usage.last30Days')
    };

    const agentOptions = useMemo(() => {
        const agents = allTotals.agentBreakdowns
            .filter(agent => agent.totalTokens > 0)
            .slice(0, 3)
            .map(agent => ({
                value: agent.key,
                label: getAgentLabel(agent.key),
            }));
        return [{ value: 'all', label: t('usage.agentAll') }, ...agents];
    }, [allTotals.agentBreakdowns]);

    useEffect(() => {
        if (agentFilter !== 'all' && !agentOptions.some(option => option.value === agentFilter)) {
            setAgentFilter('all');
        }
    }, [agentFilter, agentOptions]);

    const timeSpan = usageData.length > 1
        ? usageData[usageData.length - 1].timestamp - usageData[0].timestamp
        : 0;
    const isIntraday = timeSpan > 0 && timeSpan <= 36 * 60 * 60;
    const peakPoint = usageData.reduce<{ point: UsageDataPoint | null; value: number }>((best, point) => {
        const value = sumUsageMetric(getScopedTokens(point, agentFilter));
        return value > best.value ? { point, value } : best;
    }, { point: null, value: 0 });
    const cacheBase = (totals.tokensByMetric.input || 0) + (totals.tokensByMetric.cache_creation || 0) + (totals.tokensByMetric.cache_read || 0);
    const cacheReuseRate = cacheBase > 0 ? (totals.tokensByMetric.cache_read || 0) / cacheBase : 0;
    const averagePerRecord = totals.reportCount > 0 ? totals.totalTokens / totals.reportCount : 0;
    const composition = buildTokenComposition(totals.tokensByMetric, totals.totalTokens);
    const topModels = totals.modelBreakdowns.slice(0, 8);
    const activeAgentLabel = agentFilter === 'all' ? t('usage.agentAll') : getAgentLabel(agentFilter);

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <GlassSurface tone="floating" style={styles.hero}>
                <View style={styles.heroTop}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.eyebrow}>{periodLabels[period]} · {activeAgentLabel}</Text>
                        <Text style={styles.title}>{t('settings.usage')}</Text>
                        <Text style={styles.subtitle}>{t('settings.usageSubtitle')}</Text>
                    </View>
                    <View style={styles.heroIcon}>
                        <Ionicons name="analytics-outline" size={23} color={theme.colors.accent} />
                    </View>
                </View>

                <View style={styles.selectorGroup}>
                    <Text style={styles.selectorLabel}>{t('usage.period')}</Text>
                    <View
                        role="radiogroup"
                        accessibilityLabel={t('usage.period')}
                        style={styles.periodSelector}
                    >
                        {(['today', '7days', '30days'] as TimePeriod[]).map((p) => (
                            <Pressable
                                key={p}
                                accessibilityRole="radio"
                                accessibilityState={{ checked: period === p }}
                                aria-checked={period === p}
                                {...getSpaceKeyActivationProps(() => setPeriod(p))}
                                style={[styles.periodButton, period === p && styles.periodButtonActive]}
                                onPress={() => setPeriod(p)}
                            >
                                <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                                    {periodLabels[p]}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                </View>

                <View style={styles.selectorGroup}>
                    <Text style={styles.selectorLabel}>{t('usage.agentScope')}</Text>
                    <View
                        role="radiogroup"
                        accessibilityLabel={t('usage.agentScope')}
                        style={styles.periodSelector}
                    >
                        {agentOptions.map((option) => (
                            <Pressable
                                key={option.value}
                                accessibilityRole="radio"
                                accessibilityState={{ checked: agentFilter === option.value }}
                                aria-checked={agentFilter === option.value}
                                {...getSpaceKeyActivationProps(() => setAgentFilter(option.value))}
                                style={[styles.periodButton, agentFilter === option.value && styles.periodButtonActive]}
                                onPress={() => setAgentFilter(option.value)}
                            >
                                <Text style={[styles.periodText, agentFilter === option.value && styles.periodTextActive]}>
                                    {option.label}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                </View>
            </GlassSurface>

            <View style={styles.metricGrid}>
                <UsageMetricCard
                    icon="layers-outline"
                    label={t('usage.periodTokens')}
                    value={formatTokens(totals.totalTokens)}
                    hint={t('usage.activeBucketsHint', { count: totals.activeBuckets })}
                />
                <UsageMetricCard
                    icon="pulse-outline"
                    label={t('usage.activeReports')}
                    value={String(totals.reportCount)}
                    hint={t('usage.avgPerReport', { tokens: formatTokens(averagePerRecord) })}
                />
                <UsageMetricCard
                    icon="trending-up-outline"
                    label={t('usage.peakBucket')}
                    value={peakPoint.point ? formatBucketLabel(peakPoint.point.timestamp, isIntraday) : '--'}
                    hint={peakPoint.value > 0 ? `${formatTokens(peakPoint.value)} ${t('usage.tokens')}` : t('usage.noData')}
                />
                <UsageMetricCard
                    icon="file-tray-full-outline"
                    label={t('usage.cacheReuse')}
                    value={formatPercent(cacheReuseRate)}
                    hint={`${formatTokens(totals.tokensByMetric.cache_read || 0)} ${t('usage.metricCacheRead')}`}
                />
            </View>

            {loading && (
                <GlassSurface tone="raised" style={styles.panel}>
                    <View
                        role="status"
                        accessibilityLiveRegion="polite"
                        style={styles.loadingContainer}
                    >
                        <ActivityIndicator size="small" color={theme.colors.accent} />
                        <Text style={styles.emptyText}>{t('common.loading')}</Text>
                    </View>
                </GlassSurface>
            )}

            {!loading && error && (
                <GlassSurface tone="raised" style={styles.panel}>
                    <View
                        role="status"
                        accessibilityLiveRegion="polite"
                        style={styles.errorContainer}
                    >
                        <Ionicons name="alert-circle-outline" size={48} color={theme.colors.status.error} />
                        <Text style={styles.errorText}>{error}</Text>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t('common.retry')}
                            onPress={() => setRetryKey(value => value + 1)}
                            style={styles.retryButton}
                        >
                            <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
                        </Pressable>
                    </View>
                </GlassSurface>
            )}

            {!loading && !error && usageData.length > 0 && (
                <GlassSurface tone="raised" style={styles.panel}>
                    <View style={styles.panelHeader}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.sectionTitle}>{t('usage.tokenMix')}</Text>
                            <Text style={styles.sectionSubtitle}>
                                {t('usage.tokenMixSubtitle', { total: formatTokens(totals.totalTokens) })}
                            </Text>
                        </View>
                    </View>
                    <View style={styles.compositionTrack}>
                        {composition.map(item => (
                            <View
                                key={item.key}
                                style={[
                                    styles.compositionSegment,
                                    {
                                        width: `${Math.max(item.share * 100, 1)}%`,
                                        backgroundColor: tokenColors[item.key],
                                    }
                                ]}
                            />
                        ))}
                    </View>
                    <View style={styles.compositionGrid}>
                        {composition.map(item => (
                            <View key={item.key} style={styles.compositionItem}>
                                <View style={styles.compositionLabelRow}>
                                    <View style={[styles.compositionDot, { backgroundColor: tokenColors[item.key] }]} />
                                    <Text style={styles.compositionLabel}>{getMetricLabel(item.key)}</Text>
                                </View>
                                <Text style={styles.compositionValue}>{formatTokens(item.value)}</Text>
                                <Text style={styles.compositionShare}>{formatPercent(item.share)}</Text>
                            </View>
                        ))}
                    </View>
                </GlassSurface>
            )}

            {!loading && !error && usageData.length > 0 && (
                <GlassSurface tone="raised" style={styles.panel}>
                    <View style={styles.panelHeader}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.sectionTitle}>{t('usage.usageOverTime')}</Text>
                            <Text style={styles.sectionSubtitle}>
                                {t('usage.trendSubtitle', { buckets: usageData.length, active: totals.activeBuckets })}
                            </Text>
                        </View>
                    </View>
                    <UsageChart
                        data={usageData}
                        agentFilter={agentFilter}
                        height={190}
                    />
                </GlassSurface>
            )}

            {!loading && !error && usageData.length === 0 && (
                <GlassSurface tone="raised" style={styles.panel}>
                    <View
                        role="status"
                        accessibilityLiveRegion="polite"
                        style={styles.errorContainer}
                    >
                        <Ionicons name="analytics-outline" size={38} color={theme.colors.textMuted} />
                        <Text style={styles.emptyText}>{t('usage.noData')}</Text>
                    </View>
                </GlassSurface>
            )}

            {!loading && !error && usageData.length > 0 && (
                <GlassSurface tone="raised" style={styles.panel}>
                    <View style={styles.panelHeader}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <View style={styles.panelTitleRow}>
                                <Text style={styles.sectionTitle}>{t('usage.byModel')}</Text>
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={t('usage.modelGuideButton')}
                                    onPress={() => setShowModelGuide(value => !value)}
                                    style={styles.infoButton}
                                >
                                    <Ionicons name="information" size={16} color={theme.colors.textSecondary} />
                                </Pressable>
                            </View>
                            <Text style={styles.sectionSubtitle}>
                                {t('usage.modelSubtitle', { count: topModels.length })}
                            </Text>
                        </View>
                    </View>

                    {showModelGuide && (
                        <View style={styles.infoPanel}>
                            <Text style={styles.infoText}>{t('usage.modelGuide')}</Text>
                        </View>
                    )}

                    {topModels.length > 0 ? (
                        <View style={styles.modelList}>
                            {topModels.map((model) => (
                                <ModelUsageRow
                                    key={model.key}
                                    item={model}
                                    totalTokens={totals.totalTokens}
                                    tokenColors={tokenColors}
                                />
                            ))}
                        </View>
                    ) : (
                        <Text style={styles.emptyText}>{t('usage.noModelData')}</Text>
                    )}
                </GlassSurface>
            )}
        </ScrollView>
    );
};

function UsageMetricCard(props: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    value: string;
    hint: string;
}) {
    const { theme } = useUnistyles();

    return (
        <GlassSurface tone="raised" style={styles.metricCard}>
            <View style={styles.metricLabelRow}>
                <Ionicons name={props.icon} size={15} color={theme.colors.accent} />
                <Text style={styles.metricLabel}>{props.label}</Text>
            </View>
            <Text style={styles.metricValue} numberOfLines={1}>{props.value}</Text>
            <Text style={styles.metricHint} numberOfLines={1}>{props.hint}</Text>
        </GlassSurface>
    );
}

function ModelUsageRow(props: {
    item: UsageDimensionTotal;
    totalTokens: number;
    tokenColors: Record<TokenMetricKey, string>;
}) {
    const composition = buildTokenComposition(props.item.tokensByMetric, props.item.totalTokens);
    const share = props.totalTokens > 0 ? props.item.totalTokens / props.totalTokens : 0;
    const average = props.item.reportCount > 0 ? props.item.totalTokens / props.item.reportCount : 0;

    return (
        <View style={styles.modelRow}>
            <View style={styles.modelTopRow}>
                <View style={styles.modelNameGroup}>
                    <Text style={styles.modelName} numberOfLines={2}>{getModelLabel(props.item)}</Text>
                    <View style={styles.agentChip}>
                        <Text style={styles.agentChipText}>{getAgentLabel(props.item.agent)}</Text>
                    </View>
                </View>
                <View style={styles.modelValueGroup}>
                    <Text style={styles.modelValue}>{formatTokens(props.item.totalTokens)}</Text>
                    <Text style={styles.modelShare}>{t('usage.modelShare', { share: formatPercent(share) })}</Text>
                </View>
            </View>

            <View style={styles.compositionTrack}>
                {composition.map(item => (
                    <View
                        key={item.key}
                        style={[
                            styles.compositionSegment,
                            {
                                width: `${Math.max(item.share * 100, 1)}%`,
                                backgroundColor: props.tokenColors[item.key],
                            }
                        ]}
                    />
                ))}
            </View>

            <View style={styles.modelMetaRow}>
                <Text style={styles.modelMeta}>{t('usage.modelRecords', { count: props.item.reportCount })}</Text>
                <Text style={styles.modelMeta}>{t('usage.modelAverage', { tokens: formatTokens(average) })}</Text>
                {composition.slice(0, 3).map(item => (
                    <Text key={item.key} style={styles.modelMeta}>
                        {getMetricLabel(item.key)} {formatPercent(item.share)}
                    </Text>
                ))}
            </View>
        </View>
    );
}
