import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassButton, GlassSurface } from '@/components/glass';
import { getChangelogEntries, getLatestVersion, setLastViewedVersion } from '@/changelog';
import type { ChangelogEntry } from '@/changelog/types';
import { Typography } from '@/constants/Typography';
import { layout } from '@/components/layout';
import { getCurrentLanguage, t } from '@/text';

const entryIcons: React.ComponentProps<typeof Ionicons>['name'][] = [
    'sparkles-outline',
    'phone-portrait-outline',
    'git-branch-outline',
    'folder-open-outline',
    'shield-checkmark-outline',
];

const styles = StyleSheet.create((theme) => ({
    root: {
        flex: 1,
        backgroundColor: theme.colors.canvas,
        overflow: 'hidden',
    },
    scroll: {
        flex: 1,
    },
    content: {
        alignSelf: 'center',
        gap: 14,
        maxWidth: layout.maxWidth,
        paddingHorizontal: 14,
        paddingTop: 14,
        width: '100%',
    },
    canvasSheen: {
        position: 'absolute',
        top: -90,
        left: -90,
        right: -20,
        height: 320,
    },
    canvasMist: {
        position: 'absolute',
        top: '42%',
        left: '-26%',
        width: '82%',
        height: '42%',
        borderRadius: 280,
        opacity: theme.dark ? 0.38 : 0.72,
    },
    canvasLine: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: StyleSheet.hairlineWidth,
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.040)' : 'rgba(28, 44, 52, 0.040)',
    },
    canvasHorizontalLine: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.032)' : 'rgba(28, 44, 52, 0.030)',
    },
    hero: {
        borderRadius: 20,
        gap: 14,
        padding: 16,
    },
    heroTop: {
        alignItems: 'flex-start',
        flexDirection: 'row',
        gap: 12,
        justifyContent: 'space-between',
    },
    eyebrow: {
        ...Typography.default('semiBold'),
        color: theme.colors.accent,
        fontSize: 12,
        lineHeight: 16,
    },
    heroTitle: {
        ...Typography.default('semiBold'),
        color: theme.colors.text,
        fontSize: 26,
        lineHeight: 32,
        marginTop: 2,
    },
    heroSubtitle: {
        ...Typography.default(),
        color: theme.colors.textSecondary,
        fontSize: 14,
        lineHeight: 20,
        marginTop: 4,
    },
    heroIcon: {
        alignItems: 'center',
        backgroundColor: theme.colors.accentSoft,
        borderColor: theme.colors.glass.edgeWarm,
        borderRadius: 16,
        borderWidth: 1,
        height: 48,
        justifyContent: 'center',
        width: 48,
    },
    latestPreview: {
        borderColor: theme.dark ? 'rgba(255, 177, 66, 0.18)' : 'rgba(217, 144, 18, 0.18)',
        borderRadius: 15,
        borderWidth: 1,
        gap: 8,
        overflow: 'hidden',
        padding: 12,
    },
    latestPreviewGlow: {
        ...StyleSheet.absoluteFillObject,
        opacity: theme.dark ? 0.46 : 0.60,
    },
    latestHeader: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 8,
    },
    latestVersionText: {
        ...Typography.default('semiBold'),
        color: theme.colors.text,
        flex: 1,
        fontSize: 14,
        lineHeight: 19,
        minWidth: 0,
    },
    latestDate: {
        ...Typography.mono(),
        color: theme.colors.textMuted,
        fontSize: 11,
        lineHeight: 15,
    },
    latestSummary: {
        ...Typography.default(),
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 19,
    },
    statsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    statPill: {
        alignItems: 'center',
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(255, 255, 255, 0.62)',
        borderColor: theme.dark ? 'rgba(255, 255, 255, 0.065)' : 'rgba(28, 44, 52, 0.060)',
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: 'row',
        gap: 6,
        minHeight: 28,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    statPillText: {
        ...Typography.default('semiBold'),
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 15,
    },
    timeline: {
        gap: 12,
    },
    entryShell: {
        flexDirection: 'row',
        gap: 10,
    },
    timelineColumn: {
        alignItems: 'center',
        width: 24,
    },
    timelineLine: {
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.070)' : 'rgba(28, 44, 52, 0.070)',
        bottom: -12,
        position: 'absolute',
        top: 28,
        width: StyleSheet.hairlineWidth,
    },
    timelineDot: {
        alignItems: 'center',
        backgroundColor: theme.colors.accentSoft,
        borderColor: theme.colors.glass.edgeWarm,
        borderRadius: 999,
        borderWidth: 1,
        height: 24,
        justifyContent: 'center',
        width: 24,
    },
    entryCard: {
        borderRadius: 18,
        flex: 1,
        gap: 12,
        minWidth: 0,
        padding: 14,
    },
    entryHeader: {
        alignItems: 'flex-start',
        flexDirection: 'row',
        gap: 10,
        justifyContent: 'space-between',
    },
    entryTitleBlock: {
        flex: 1,
        minWidth: 0,
    },
    entryVersion: {
        ...Typography.default('semiBold'),
        color: theme.colors.text,
        fontSize: 18,
        lineHeight: 24,
    },
    entrySummary: {
        ...Typography.default(),
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 19,
        marginTop: 4,
    },
    datePill: {
        alignItems: 'center',
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(238, 246, 248, 0.74)',
        borderColor: theme.dark ? 'rgba(255, 255, 255, 0.060)' : 'rgba(255, 255, 255, 0.82)',
        borderRadius: 999,
        borderWidth: 1,
        minHeight: 26,
        paddingHorizontal: 9,
        paddingVertical: 5,
    },
    datePillText: {
        ...Typography.mono(),
        color: theme.colors.textMuted,
        fontSize: 11,
        lineHeight: 14,
    },
    changeList: {
        gap: 8,
    },
    changeRow: {
        alignItems: 'flex-start',
        flexDirection: 'row',
        gap: 9,
    },
    changeIcon: {
        alignItems: 'center',
        backgroundColor: theme.dark ? 'rgba(255, 177, 66, 0.11)' : 'rgba(217, 144, 18, 0.10)',
        borderColor: theme.colors.glass.edgeWarm,
        borderRadius: 999,
        borderWidth: 1,
        height: 20,
        justifyContent: 'center',
        marginTop: 2,
        width: 20,
    },
    changeText: {
        ...Typography.default(),
        color: theme.colors.text,
        flex: 1,
        fontSize: 14,
        lineHeight: 21,
        minWidth: 0,
    },
    emptyState: {
        alignItems: 'center',
        flex: 1,
        justifyContent: 'center',
        padding: 40,
    },
    emptyCard: {
        alignItems: 'center',
        borderRadius: 20,
        gap: 10,
        maxWidth: 420,
        padding: 24,
        width: '100%',
    },
    emptyIcon: {
        alignItems: 'center',
        backgroundColor: theme.colors.accentSoft,
        borderColor: theme.colors.glass.edgeWarm,
        borderRadius: 16,
        borderWidth: 1,
        height: 52,
        justifyContent: 'center',
        width: 52,
    },
    emptyText: {
        ...Typography.default(),
        color: theme.colors.textSecondary,
        fontSize: 16,
        lineHeight: 24,
        textAlign: 'center',
    },
}));

export default function ChangelogScreen() {
    const { theme } = useUnistyles();
    const insets = useSafeAreaInsets();
    const locale = getCurrentLanguage();
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [loadState, setLoadState] = useState<
        | { status: 'loading' }
        | { status: 'ready'; entries: ChangelogEntry[] }
        | { status: 'error' }
    >({ status: 'loading' });
    const entries = loadState.status === 'ready' ? loadState.entries : [];
    const latestEntry = entries[0] ?? null;
    const totalChanges = useMemo(
        () => entries.reduce((sum, entry) => sum + entry.changes.length, 0),
        [entries],
    );

    useEffect(() => {
        let active = true;
        setLoadState({ status: 'loading' });
        getChangelogEntries(locale).then((loadedEntries) => {
            if (!active) return;
            setLoadState({ status: 'ready', entries: loadedEntries });
            const latestVersion = getLatestVersion(locale);
            if (latestVersion > 0) setLastViewedVersion(latestVersion);
        }).catch((error) => {
            console.error('Failed to load localized changelog', error);
            if (active) setLoadState({ status: 'error' });
        });
        return () => {
            active = false;
        };
    }, [loadAttempt, locale]);

    const retryLoad = useCallback(() => setLoadAttempt((attempt) => attempt + 1), []);

    if (loadState.status !== 'ready') {
        return (
            <View style={styles.root}>
                <ChangelogCanvasBackground />
                <View style={styles.emptyState}>
                    <GlassSurface tone="floating" style={styles.emptyCard}>
                        {loadState.status === 'loading' ? (
                            <ActivityIndicator size="small" color={theme.colors.accent} />
                        ) : (
                            <View style={styles.emptyIcon}>
                                <Ionicons name="cloud-offline-outline" size={24} color={theme.colors.accent} />
                            </View>
                        )}
                        <Text style={styles.emptyText}>
                            {loadState.status === 'loading' ? t('common.loading') : t('changelog.loadError')}
                        </Text>
                        {loadState.status === 'error' && (
                            <GlassButton
                                title={t('common.retry')}
                                accessibilityLabel={t('common.retry')}
                                onPress={retryLoad}
                                style={{ minHeight: 44 }}
                            />
                        )}
                    </GlassSurface>
                </View>
            </View>
        );
    }

    if (entries.length === 0) {
        return (
            <View style={styles.root}>
                <ChangelogCanvasBackground />
                <View style={styles.emptyState}>
                    <GlassSurface tone="floating" style={styles.emptyCard}>
                        <View style={styles.emptyIcon}>
                            <Ionicons name="newspaper-outline" size={24} color={theme.colors.accent} />
                        </View>
                        <Text style={styles.emptyText}>
                            {t('changelog.noEntriesAvailable')}
                        </Text>
                    </GlassSurface>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <ChangelogCanvasBackground />
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={[
                    styles.content,
                    { paddingBottom: insets.bottom + 36 },
                ]}
                showsVerticalScrollIndicator={false}
            >
                <ChangelogHero
                    latestEntry={latestEntry}
                    totalEntries={entries.length}
                    totalChanges={totalChanges}
                />

                <View style={styles.timeline}>
                    {entries.map((entry, index) => (
                        <ChangelogEntryCard
                            key={entry.version}
                            entry={entry}
                            icon={entryIcons[index % entryIcons.length]}
                            isLatest={index === 0}
                            isLast={index === entries.length - 1}
                        />
                    ))}
                </View>
            </ScrollView>
        </View>
    );
}

function ChangelogCanvasBackground() {
    const { theme } = useUnistyles();

    return (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <LinearGradient
                colors={theme.dark
                    ? ['#070A0B', '#0B1012', '#070A0B']
                    : ['#FFFFFF', '#F6F9FA', '#EEF4F6']}
                start={{ x: 0.04, y: 0 }}
                end={{ x: 0.96, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            <LinearGradient
                colors={theme.dark
                    ? ['rgba(255, 177, 66, 0.12)', 'rgba(255, 255, 255, 0)']
                    : ['rgba(255, 255, 255, 0.90)', 'rgba(255, 177, 66, 0.08)', 'rgba(255, 255, 255, 0)']}
                locations={theme.dark ? [0, 1] : [0, 0.46, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.canvasSheen}
            />
            <LinearGradient
                colors={theme.dark
                    ? ['rgba(95, 168, 255, 0.10)', 'rgba(255, 255, 255, 0)']
                    : ['rgba(238, 246, 248, 0.96)', 'rgba(255, 255, 255, 0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.canvasMist}
            />
            <View style={[styles.canvasLine, { left: '23%' }]} />
            <View style={[styles.canvasLine, { left: '64%', opacity: 0.58 }]} />
            <View style={[styles.canvasHorizontalLine, { top: '28%' }]} />
            <View style={[styles.canvasHorizontalLine, { top: '72%', opacity: 0.54 }]} />
        </View>
    );
}

function ChangelogHero({
    latestEntry,
    totalEntries,
    totalChanges,
}: {
    latestEntry: ChangelogEntry | null;
    totalEntries: number;
    totalChanges: number;
}) {
    const { theme } = useUnistyles();

    return (
        <GlassSurface tone="floating" style={styles.hero}>
            <View style={styles.heroTop}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.eyebrow}>
                        {latestEntry ? latestEntry.date : t('settings.whatsNew')}
                    </Text>
                    <Text style={styles.heroTitle}>
                        {t('settings.whatsNew')}
                    </Text>
                    <Text style={styles.heroSubtitle}>
                        {t('settings.whatsNewSubtitle')}
                    </Text>
                </View>
                <View style={styles.heroIcon}>
                    <Ionicons name="megaphone-outline" size={24} color={theme.colors.accent} />
                </View>
            </View>

            {latestEntry && (
                <View style={styles.latestPreview}>
                    <LinearGradient
                        pointerEvents="none"
                        colors={theme.dark
                            ? ['rgba(255, 177, 66, 0.12)', 'rgba(255, 255, 255, 0.015)', 'rgba(255, 255, 255, 0)']
                            : ['rgba(255, 255, 255, 0.82)', 'rgba(255, 177, 66, 0.09)', 'rgba(255, 255, 255, 0)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.latestPreviewGlow}
                    />
                    <View style={styles.latestHeader}>
                        <Ionicons name="radio-outline" size={16} color={theme.colors.accent} />
                        <Text style={styles.latestVersionText} numberOfLines={1}>
                            {t('changelog.version', { version: latestEntry.version })}
                        </Text>
                        <Text style={styles.latestDate}>
                            {latestEntry.date}
                        </Text>
                    </View>
                    <Text style={styles.latestSummary}>
                        {latestEntry.summary}
                    </Text>
                </View>
            )}

            <View style={styles.statsRow}>
                <StatPill icon="albums-outline" label={t('changelog.versionCount', { count: totalEntries })} />
                <StatPill icon="checkmark-done-outline" label={t('changelog.changeCount', { count: totalChanges })} />
                {latestEntry && (
                    <StatPill icon="flash-outline" label={t('changelog.latestVersion', { version: latestEntry.version })} />
                )}
            </View>
        </GlassSurface>
    );
}

function StatPill({
    icon,
    label,
}: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
}) {
    const { theme } = useUnistyles();

    return (
        <View style={styles.statPill}>
            <Ionicons name={icon} size={14} color={theme.colors.accent} />
            <Text style={styles.statPillText} numberOfLines={1}>
                {label}
            </Text>
        </View>
    );
}

function ChangelogEntryCard({
    entry,
    icon,
    isLatest,
    isLast,
}: {
    entry: ChangelogEntry;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    isLatest: boolean;
    isLast: boolean;
}) {
    const { theme } = useUnistyles();

    return (
        <View style={styles.entryShell}>
            <View style={styles.timelineColumn}>
                {!isLast && <View style={styles.timelineLine} />}
                <View style={styles.timelineDot}>
                    <Ionicons name={icon} size={13} color={theme.colors.accent} />
                </View>
            </View>
            <GlassSurface
                tone={isLatest ? 'floating' : 'raised'}
                sheen={isLatest ? 'standard' : 'subtle'}
                edgeIntensity={isLatest ? 'standard' : 'subtle'}
                style={styles.entryCard}
            >
                <View style={styles.entryHeader}>
                    <View style={styles.entryTitleBlock}>
                        <Text style={styles.entryVersion}>
                            {t('changelog.version', { version: entry.version })}
                        </Text>
                        {!!entry.summary && (
                            <Text style={styles.entrySummary}>
                                {entry.summary}
                            </Text>
                        )}
                    </View>
                    <View style={styles.datePill}>
                        <Text style={styles.datePillText}>
                            {entry.date}
                        </Text>
                    </View>
                </View>
                <View style={styles.changeList}>
                    {entry.changes.map((change, index) => (
                        <View key={`${entry.version}-${index}`} style={styles.changeRow}>
                            <View style={styles.changeIcon}>
                                <Ionicons name="checkmark" size={12} color={theme.colors.accent} />
                            </View>
                            <Text style={styles.changeText}>
                                {change}
                            </Text>
                        </View>
                    ))}
                </View>
            </GlassSurface>
        </View>
    );
}
