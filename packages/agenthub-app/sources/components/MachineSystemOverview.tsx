import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Svg, { ClipPath, Defs, G, LinearGradient, Line, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import type { RpcSystemMetrics } from '@artsum/agenthub-wire';
import { Typography } from '@/constants/Typography';
import { machineGetSystemMetrics } from '@/sync/ops';
import { t } from '@/text';
import { calculateNetworkThroughput, type NetworkCounterSample, type NetworkThroughputSample } from '@/utils/networkThroughput';
import { buildNetworkTrendScale, formatNetworkRateTick } from '@/utils/networkTrendScale';

type MachineSystemOverviewProps = {
    machineId: string;
    online: boolean;
    refreshIntervalMs: number;
};

function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** unitIndex;
    return `${value >= 100 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatThroughput(bytesPerSecond: number): string {
    return `${formatBytes(bytesPerSecond)}/s`;
}

function buildTrendPath(values: number[], width: number, height: number, maximum: number): string {
    if (values.length === 0) return '';
    const lastIndex = Math.max(1, values.length - 1);
    return values.map((value, index) => {
        const x = (index / lastIndex) * width;
        const y = height - (Math.max(0, value) / maximum) * height;
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
}

function NetworkTrendChart({
    history,
    downloadColor,
    uploadColor,
}: {
    history: NetworkThroughputSample[];
    downloadColor: string;
    uploadColor: string;
}) {
    const [width, setWidth] = React.useState(0);
    const chartHeight = 118;
    const labelWidth = 64;
    const plotTop = 8;
    const plotBottom = 20;
    const plotHeight = chartHeight - plotTop - plotBottom;
    const plotWidth = Math.max(0, width - labelWidth);
    const maximumRef = React.useRef<number | null>(null);
    const chart = React.useMemo(() => {
        const downloadValues = history.map((sample) => sample.downloadBytesPerSecond);
        const uploadValues = history.map((sample) => sample.uploadBytesPerSecond);
        const peak = Math.max(0, ...downloadValues, ...uploadValues);
        const scale = buildNetworkTrendScale(peak, maximumRef.current);
        maximumRef.current = scale.maximum;
        const downloadPath = buildTrendPath(downloadValues, plotWidth, plotHeight, scale.maximum);
        const uploadPath = buildTrendPath(uploadValues, plotWidth, plotHeight, scale.maximum);
        return { downloadValues, uploadValues, downloadPath, uploadPath, scale };
    }, [history, plotHeight, plotWidth]);
    const downloadArea = chart.downloadPath ? `${chart.downloadPath} L ${plotWidth} ${plotHeight} L 0 ${plotHeight} Z` : '';
    const uploadArea = chart.uploadPath ? `${chart.uploadPath} L ${plotWidth} ${plotHeight} L 0 ${plotHeight} Z` : '';

    return (
        <View style={styles.networkChart} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
            {width > 0 ? (
                <Svg
                    accessibilityRole="image"
                    accessibilityLabel={`${t('machine.downloadSpeed')} ${formatThroughput(chart.downloadValues.at(-1) ?? 0)}, ${t('machine.uploadSpeed')} ${formatThroughput(chart.uploadValues.at(-1) ?? 0)}`}
                    width={width}
                    height={chartHeight}
                    viewBox={`0 0 ${width} ${chartHeight}`}
                >
                    <Defs>
                        <LinearGradient id="networkDownload" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={plotHeight}>
                            <Stop offset="0" stopColor={downloadColor} stopOpacity={0.32} />
                            <Stop offset="1" stopColor={downloadColor} stopOpacity={0.02} />
                        </LinearGradient>
                        <LinearGradient id="networkUpload" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={plotHeight}>
                            <Stop offset="0" stopColor={uploadColor} stopOpacity={0.24} />
                            <Stop offset="1" stopColor={uploadColor} stopOpacity={0.01} />
                        </LinearGradient>
                        <ClipPath id="networkPlotClip">
                            <Rect x={0} y={0} width={plotWidth} height={plotHeight} />
                        </ClipPath>
                    </Defs>
                    <SvgText x={labelWidth} y={chartHeight - 4} fontSize={9} fill={downloadColor} fillOpacity={0.66}>−90s</SvgText>
                    <SvgText x={labelWidth + plotWidth / 2} y={chartHeight - 4} textAnchor="middle" fontSize={9} fill={downloadColor} fillOpacity={0.66}>−45s</SvgText>
                    <SvgText x={width} y={chartHeight - 4} textAnchor="end" fontSize={9} fill={downloadColor} fillOpacity={0.66}>now</SvgText>
                    {chart.scale.ticks.map((tick, index) => {
                        const y = plotTop + (index / (chart.scale.ticks.length - 1)) * plotHeight;
                        return (
                            <React.Fragment key={`${tick}-${index}`}>
                                <SvgText x={labelWidth - 8} y={Math.min(chartHeight - plotBottom, y + 3)} textAnchor="end" fontSize={9} fill={downloadColor} fillOpacity={0.72}>
                                    {formatNetworkRateTick(tick)}
                                </SvgText>
                                <Line x1={labelWidth} y1={y} x2={width} y2={y} stroke={downloadColor} strokeOpacity={0.1} strokeWidth={1} />
                            </React.Fragment>
                        );
                    })}
                    {Array.from({ length: 7 }, (_, index) => {
                        const x = labelWidth + (index / 6) * plotWidth;
                        return <Line key={index} x1={x} y1={plotTop} x2={x} y2={plotTop + plotHeight} stroke={downloadColor} strokeOpacity={0.055} strokeWidth={1} />;
                    })}
                    <G transform={`translate(${labelWidth} ${plotTop})`} clipPath="url(#networkPlotClip)">
                        {downloadArea ? <Path d={downloadArea} fill="url(#networkDownload)" /> : null}
                        {uploadArea ? <Path d={uploadArea} fill="url(#networkUpload)" /> : null}
                        {chart.downloadPath ? <Path d={chart.downloadPath} fill="none" stroke={downloadColor} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" /> : null}
                        {chart.uploadPath ? <Path d={chart.uploadPath} fill="none" stroke={uploadColor} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" /> : null}
                    </G>
                </Svg>
            ) : null}
        </View>
    );
}

function ProgressBar({ value, color }: { value: number; color: string }) {
    const normalized = Math.min(100, Math.max(0, value));
    return (
        <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(normalized) }}
            style={styles.progressTrack}
        >
            <View style={[styles.progressFill, { width: `${normalized}%`, backgroundColor: color }]} />
        </View>
    );
}

function UsageCard(props: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    value: number;
    detail: string;
    color: string;
}) {
    return (
        <View style={styles.usageCard}>
            <View style={styles.cardHeading}>
                <View style={[styles.iconPlate, { backgroundColor: `${props.color}18` }]}>
                    <Ionicons name={props.icon} size={18} color={props.color} />
                </View>
                <Text style={styles.cardLabel}>{props.label}</Text>
                <Text style={[styles.cardValue, { color: props.color }]}>{props.value.toFixed(1)}%</Text>
            </View>
            <ProgressBar value={props.value} color={props.color} />
            <Text style={styles.cardDetail} numberOfLines={1}>{props.detail}</Text>
        </View>
    );
}

export const MachineSystemOverview = React.memo(function MachineSystemOverview({
    machineId,
    online,
    refreshIntervalMs,
}: MachineSystemOverviewProps) {
    const { theme } = useUnistyles();
    const [snapshot, setSnapshot] = React.useState<RpcSystemMetrics | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [stale, setStale] = React.useState(false);
    const [networkHistory, setNetworkHistory] = React.useState<NetworkThroughputSample[]>([]);
    const previousNetworkSample = React.useRef<NetworkCounterSample | null>(null);

    React.useEffect(() => {
        setSnapshot(null);
        setStale(false);
        setNetworkHistory([]);
        previousNetworkSample.current = null;
    }, [machineId]);

    useFocusEffect(React.useCallback(() => {
        let active = true;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let controller: AbortController | null = null;

        const poll = async () => {
            if (!active || !online) {
                if (active) setStale(true);
                return;
            }
            controller = new AbortController();
            setLoading((current) => current || snapshot === null);
            try {
                const next = await machineGetSystemMetrics(machineId, {
                    signal: controller.signal,
                    timeoutMs: Math.max(2_500, refreshIntervalMs - 250),
                });
                if (!active) return;
                const currentNetworkSample = {
                    sampledAt: next.sampledAt,
                    receivedBytes: next.network.receivedBytes,
                    sentBytes: next.network.sentBytes,
                };
                if (previousNetworkSample.current) {
                    const throughput = calculateNetworkThroughput(previousNetworkSample.current, currentNetworkSample);
                    if (throughput) setNetworkHistory((current) => [...current, throughput].slice(-30));
                }
                previousNetworkSample.current = currentNetworkSample;
                setSnapshot(next);
                setStale(false);
            } catch {
                if (active && !controller.signal.aborted) setStale(true);
            } finally {
                if (active) {
                    setLoading(false);
                    timer = setTimeout(poll, refreshIntervalMs);
                }
            }
        };

        void poll();
        return () => {
            active = false;
            previousNetworkSample.current = null;
            controller?.abort();
            if (timer) clearTimeout(timer);
        };
    }, [machineId, online, refreshIntervalMs]));

    const cpuColor = snapshot && snapshot.cpu.usagePercent >= 85 ? theme.colors.warning : theme.colors.accent;
    const memoryColor = snapshot && snapshot.memory.usagePercent >= 85 ? theme.colors.warning : theme.colors.status.connected;
    const downloadColor = theme.colors.accent;
    const uploadColor = theme.colors.status.connected;
    const currentNetwork = networkHistory.at(-1);

    return (
        <View style={styles.section}>
            <View style={styles.sectionHeading}>
                <View>
                    <Text accessibilityRole="header" style={styles.sectionTitle}>{t('machine.systemResources')}</Text>
                    {snapshot ? (
                        <Text style={styles.systemLine} numberOfLines={2}>
                            {snapshot.system.name} · {snapshot.system.architecture}
                        </Text>
                    ) : null}
                </View>
                <View style={styles.liveState}>
                    {loading ? <ActivityIndicator size="small" color={theme.colors.textSecondary} /> : (
                        <View style={[styles.liveDot, { backgroundColor: stale ? theme.colors.warning : theme.colors.status.connected }]} />
                    )}
                    <Text style={styles.liveText}>
                        {stale ? t('machine.metricsStale') : snapshot ? t('status.online') : t('common.loading')}
                    </Text>
                </View>
            </View>

            {snapshot ? (
                <>
                    <View style={styles.usageGrid}>
                        <UsageCard
                            icon="speedometer-outline"
                            label="CPU"
                            value={snapshot.cpu.usagePercent}
                            detail={`${snapshot.cpu.logicalCores} cores${snapshot.cpu.model ? ` · ${snapshot.cpu.model}` : ''}`}
                            color={cpuColor}
                        />
                        <UsageCard
                            icon="hardware-chip-outline"
                            label={t('machine.memory')}
                            value={snapshot.memory.usagePercent}
                            detail={`${t('machine.used')} ${formatBytes(snapshot.memory.usedBytes)} · ${t('machine.available')} ${formatBytes(snapshot.memory.availableBytes)}`}
                            color={memoryColor}
                        />
                    </View>

                    <View style={styles.networkSection}>
                        <View style={styles.networkHeading}>
                            <View style={styles.diskHeading}>
                                <Ionicons name="pulse-outline" size={17} color={theme.colors.textSecondary} />
                                <Text style={styles.diskTitle}>{t('machine.network')}</Text>
                            </View>
                            <Text style={styles.networkWindow}>90s</Text>
                        </View>
                        <NetworkTrendChart
                            history={networkHistory}
                            downloadColor={downloadColor}
                            uploadColor={uploadColor}
                        />
                        <View style={styles.networkLegend}>
                            <View style={styles.networkMetric}>
                                <View style={[styles.networkSwatch, { backgroundColor: downloadColor }]} />
                                <View>
                                    <Text style={styles.networkLabel}>{t('machine.downloadSpeed')}</Text>
                                    <Text style={[styles.networkValue, { color: downloadColor }]}>{formatThroughput(currentNetwork?.downloadBytesPerSecond ?? 0)}</Text>
                                </View>
                            </View>
                            <View style={styles.networkMetric}>
                                <View style={[styles.networkSwatch, { backgroundColor: uploadColor }]} />
                                <View>
                                    <Text style={styles.networkLabel}>{t('machine.uploadSpeed')}</Text>
                                    <Text style={[styles.networkValue, { color: uploadColor }]}>{formatThroughput(currentNetwork?.uploadBytesPerSecond ?? 0)}</Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    <View style={styles.diskSection}>
                        <View style={styles.diskHeading}>
                            <Ionicons name="server-outline" size={17} color={theme.colors.textSecondary} />
                            <Text style={styles.diskTitle}>{t('machine.storage')}</Text>
                        </View>
                        {snapshot.disks.map((disk) => (
                            <View key={`${disk.name}:${disk.mountPoint}`} style={styles.diskRow}>
                                <View style={styles.diskLabelRow}>
                                    <View style={styles.diskNameBlock}>
                                        <Text style={styles.diskMount} numberOfLines={1}>{disk.mountPoint}</Text>
                                        <Text style={styles.diskDevice} numberOfLines={1}>{disk.name}</Text>
                                    </View>
                                    <Text style={styles.diskPercent}>{disk.usagePercent.toFixed(1)}%</Text>
                                </View>
                                <ProgressBar
                                    value={disk.usagePercent}
                                    color={disk.usagePercent >= 90 ? theme.colors.warning : theme.colors.accent}
                                />
                                <View style={styles.diskNumbers}>
                                    <Text style={styles.diskNumber}>{t('machine.used')} {formatBytes(disk.usedBytes)}</Text>
                                    <Text style={styles.diskNumber}>{t('machine.available')} {formatBytes(disk.availableBytes)}</Text>
                                    <Text style={styles.diskNumber}>{formatBytes(disk.totalBytes)}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                </>
            ) : (
                <View style={styles.emptyState}>
                    {loading ? <ActivityIndicator size="small" color={theme.colors.accent} /> : <Ionicons name="cloud-offline-outline" size={24} color={theme.colors.textSecondary} />}
                    <Text style={styles.emptyText}>{loading ? t('common.loading') : t('machine.metricsUnavailable')}</Text>
                </View>
            )}
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    section: {
        marginHorizontal: 16,
        marginTop: 16,
        marginBottom: 4,
        padding: 16,
        borderRadius: 16,
        backgroundColor: theme.colors.surfaceRaised,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
    },
    sectionHeading: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 14,
    },
    sectionTitle: { ...Typography.default('semiBold'), fontSize: 16, color: theme.colors.text },
    systemLine: { ...Typography.default(), marginTop: 3, fontSize: 12, color: theme.colors.textSecondary },
    liveState: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '45%' },
    liveDot: { width: 7, height: 7, borderRadius: 4 },
    liveText: { ...Typography.default(), fontSize: 11, color: theme.colors.textSecondary, textAlign: 'right' },
    usageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    usageCard: {
        flexGrow: 1,
        flexBasis: 150,
        minWidth: 140,
        padding: 12,
        borderRadius: 12,
        backgroundColor: theme.colors.canvas,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
    },
    cardHeading: { flexDirection: 'row', alignItems: 'center', marginBottom: 11 },
    iconPlate: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
    cardLabel: { ...Typography.default(), flex: 1, fontSize: 13, color: theme.colors.textSecondary },
    cardValue: { ...Typography.default('semiBold'), fontSize: 18 },
    progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: theme.colors.surfaceHighest },
    progressFill: { height: '100%', borderRadius: 3 },
    cardDetail: { ...Typography.default(), marginTop: 8, fontSize: 11, color: theme.colors.textSecondary },
    networkSection: {
        marginTop: 12,
        padding: 12,
        borderRadius: 12,
        backgroundColor: theme.colors.canvas,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
    },
    networkHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    networkWindow: { ...Typography.default('semiBold'), fontSize: 10, color: theme.colors.textSecondary },
    networkChart: { width: '100%', height: 118, marginTop: 6, overflow: 'hidden' },
    networkLegend: { flexDirection: 'row', gap: 20, marginTop: 10 },
    networkMetric: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    networkSwatch: { width: 3, height: 28, borderRadius: 2 },
    networkLabel: { ...Typography.default(), fontSize: 10, color: theme.colors.textSecondary },
    networkValue: { ...Typography.default('semiBold'), marginTop: 2, fontSize: 15 },
    diskSection: { marginTop: 16 },
    diskHeading: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
    diskTitle: { ...Typography.default('semiBold'), fontSize: 13, color: theme.colors.text },
    diskRow: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.divider },
    diskLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    diskNameBlock: { flex: 1 },
    diskMount: { ...Typography.default('semiBold'), fontSize: 13, color: theme.colors.text },
    diskDevice: { ...Typography.default(), marginTop: 2, fontSize: 10, color: theme.colors.textSecondary },
    diskPercent: { ...Typography.default('semiBold'), fontSize: 13, color: theme.colors.text },
    diskNumbers: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 7 },
    diskNumber: { ...Typography.default(), flexShrink: 1, fontSize: 10, color: theme.colors.textSecondary },
    emptyState: { minHeight: 96, alignItems: 'center', justifyContent: 'center', gap: 8 },
    emptyText: { ...Typography.default(), fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center' },
}));
