import * as React from 'react';
import { Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Circle } from 'react-native-svg';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { useSetting } from '@/sync/storage';
import { getSpaceKeyActivationProps } from '@/components/keyboardActivation';
import type { EffortLevel, ModelMode, ModeOption } from './modelModeOptions';
import {
    clampContextSize,
    formatUsageLimitAge,
    getContextUsageLevel,
    getContextUsagePercentage,
    getUsageLimitChips,
    getUsageLimitDisplayPercentage,
    getUsageLimitRows,
    type UsageLimitsLike,
    type UsageLimitStatus,
} from '@/utils/sessionStatusBar';

type SessionStatusBarProps = {
    gitBranch?: string | null;
    modelLabel: string | null;
    modelMode?: ModelMode | null;
    availableModels?: ModelMode[];
    onModelModeChange?: (mode: ModelMode) => void;
    effortLabel: string | null;
    effortLevel?: EffortLevel | null;
    availableEffortLevels?: EffortLevel[];
    onEffortLevelChange?: (level: EffortLevel) => void;
    contextSize?: number | null;
    contextWindow?: number | null;
    usageLimits?: UsageLimitsLike;
    controlMode?: 'unknown' | 'unclaimed' | 'controller' | 'observer';
    onControlClaim?: () => void;
    onControlRelease?: () => void;
};

type OpenMenu = 'model' | 'effort' | 'limits' | null;

export function SessionStatusBar(props: SessionStatusBarProps) {
    const { theme } = useUnistyles();
    const [openMenu, setOpenMenu] = React.useState<OpenMenu>(null);
    const { width } = useWindowDimensions();
    const showRemaining = useSetting('usageLimitShowRemaining');
    const contextMax = typeof props.contextWindow === 'number' && Number.isFinite(props.contextWindow) && props.contextWindow > 0
        ? Math.trunc(props.contextWindow) : null;
    const contextLevel = contextMax === null ? 'normal' : getContextUsageLevel(props.contextSize, contextMax);
    const contextColor = contextLevel === 'critical'
        ? theme.colors.warningCritical
        : contextLevel === 'warning' ? theme.colors.warning : theme.colors.status.connecting;
    const limitChips = getUsageLimitChips(props.usageLimits, width < 480);
    const limitColor = (status: UsageLimitStatus) => status === 'rejected'
        ? theme.colors.warningCritical
        : status === 'allowed_warning' ? theme.colors.warning : undefined;

    return (
        <View style={styles.wrapper}>
            {openMenu === 'model' ? (
                <OptionMenu
                    options={props.availableModels ?? []}
                    selectedKey={props.modelMode?.key ?? null}
                    onSelect={(model) => { props.onModelModeChange?.(model); setOpenMenu(null); }}
                />
            ) : null}
            {openMenu === 'effort' ? (
                <OptionMenu
                    options={props.availableEffortLevels ?? []}
                    selectedKey={props.effortLevel?.key ?? null}
                    onSelect={(effort) => { props.onEffortLevelChange?.(effort); setOpenMenu(null); }}
                />
            ) : null}
            {openMenu === 'limits' ? (
                <UsageLimitMenu usageLimits={props.usageLimits} showRemaining={showRemaining} color={limitColor} />
            ) : null}
            <View style={styles.container}>
                <View style={styles.leftCluster}>
                    {props.gitBranch ? <StatusChip icon="git-branch-outline" text={props.gitBranch} wide /> : null}
                </View>
                <View style={styles.rightCluster}>
                    {props.controlMode === 'observer' ? (
                        <StatusChip icon="lock-closed-outline" text={t('common.sessionControlObserver')} tint={theme.colors.warning} />
                    ) : props.controlMode === 'controller' ? (
                        <StatusChip
                            icon="hand-left-outline"
                            text={t('common.sessionControlRelease')}
                            onPress={props.onControlRelease}
                            tint={theme.colors.accent}
                        />
                    ) : props.controlMode === 'unclaimed' ? (
                        <StatusChip
                            icon="hand-left-outline"
                            text={t('common.sessionControlClaim')}
                            onPress={props.onControlClaim}
                        />
                    ) : null}
                    {props.modelLabel ? (
                        <StatusChip
                            icon="hardware-chip-outline"
                            text={props.modelLabel}
                            active={openMenu === 'model'}
                            onPress={(props.availableModels?.length ?? 0) > 0 && props.onModelModeChange
                                ? () => setOpenMenu((current) => current === 'model' ? null : 'model') : undefined}
                        />
                    ) : null}
                    {props.effortLabel ? (
                        <StatusChip
                            icon="flash-outline"
                            text={props.effortLabel}
                            active={openMenu === 'effort'}
                            onPress={(props.availableEffortLevels?.length ?? 0) > 0 && props.onEffortLevelChange
                                ? () => setOpenMenu((current) => current === 'effort' ? null : 'effort') : undefined}
                        />
                    ) : null}
                    {limitChips.map((chip) => (
                        <StatusChip
                            key={chip.id}
                            icon="speedometer-outline"
                            text={`${chip.shortLabel} ${getUsageLimitDisplayPercentage(chip.utilization, showRemaining)}%`}
                            tint={limitColor(chip.status)}
                            active={openMenu === 'limits'}
                            onPress={() => setOpenMenu((current) => current === 'limits' ? null : 'limits')}
                        />
                    ))}
                    {contextMax !== null ? (
                        <ContextCircle
                            value={clampContextSize(props.contextSize, contextMax)}
                            maxValue={contextMax}
                            percentage={getContextUsagePercentage(props.contextSize, contextMax)}
                            color={contextColor}
                        />
                    ) : null}
                </View>
            </View>
        </View>
    );
}

function OptionMenu<T extends ModeOption>(props: { options: T[]; selectedKey: string | null; onSelect: (option: T) => void }) {
    return (
        <View accessibilityRole="menu" style={styles.menu}>
            <ScrollView style={styles.menuScroll} keyboardShouldPersistTaps="handled">
                {props.options.map((option) => {
                    const isSelected = option.key === props.selectedKey;
                    return (
                        <Pressable
                            key={option.key}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: isSelected }}
                            disabled={'disabled' in option && Boolean(option.disabled)}
                            onPress={() => props.onSelect(option)}
                            {...getSpaceKeyActivationProps(() => props.onSelect(option))}
                            style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
                        >
                            <Ionicons name={isSelected ? 'radio-button-on' : 'radio-button-off'} size={18} style={styles.radio} />
                            <View style={styles.menuTextColumn}>
                                <Text numberOfLines={1} style={styles.menuText}>{option.name}</Text>
                                {option.description ? <Text numberOfLines={2} style={styles.menuDescription}>{option.description}</Text> : null}
                            </View>
                        </Pressable>
                    );
                })}
            </ScrollView>
        </View>
    );
}

function UsageLimitMenu(props: {
    usageLimits: UsageLimitsLike;
    showRemaining: boolean;
    color: (status: UsageLimitStatus) => string | undefined;
}) {
    const { theme } = useUnistyles();
    const labels: Record<string, string> = {
        five_hour: t('components.sessionStatusBar.limitFiveHour'),
        seven_day: t('components.sessionStatusBar.limitSevenDay'),
    };
    return (
        <View accessibilityRole="summary" style={styles.menu}>
            {getUsageLimitRows(props.usageLimits).map((row) => (
                <View key={row.id} style={styles.limitRow}>
                    <View style={[styles.limitDot, { backgroundColor: props.color(row.status) ?? theme.colors.status.connecting }]} />
                    <Text numberOfLines={1} style={styles.limitLabel}>{labels[row.id] ?? row.label}</Text>
                    <Text style={styles.limitValue}>
                        {row.utilization === null ? '—' : props.showRemaining
                            ? t('components.sessionStatusBar.limitRemaining', { percent: getUsageLimitDisplayPercentage(row.utilization, true) })
                            : `${row.utilization}%`}
                    </Text>
                    {row.resetsAt !== null ? (
                        <Text numberOfLines={1} style={styles.limitReset}>
                            {t('components.sessionStatusBar.limitResets', { time: formatResetTime(row.resetsAt) })}
                        </Text>
                    ) : null}
                </View>
            ))}
            {props.usageLimits ? (
                <Text style={styles.limitFooter}>{t('components.sessionStatusBar.limitAsOf', {
                    age: formatUsageLimitAge(props.usageLimits.capturedAt, Date.now()),
                })}</Text>
            ) : null}
        </View>
    );
}

function StatusChip(props: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    text: string;
    wide?: boolean;
    tint?: string;
    active?: boolean;
    onPress?: () => void;
}) {
    const content = (
        <>
            <Ionicons name={props.icon} size={13} color={props.tint} />
            <Text numberOfLines={1} style={[styles.chipText, props.tint ? { color: props.tint } : null]}>{props.text}</Text>
        </>
    );
    if (!props.onPress) return <View style={[styles.chip, props.wide && styles.chipWide]}>{content}</View>;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={props.text}
            accessibilityState={{ expanded: props.active }}
            onPress={props.onPress}
            {...getSpaceKeyActivationProps(props.onPress)}
            style={({ pressed }) => [styles.chip, props.wide && styles.chipWide, props.active && styles.chipActive, pressed && styles.pressed]}
        >{content}</Pressable>
    );
}

function ContextCircle(props: { value: number; maxValue: number; percentage: number; color: string }) {
    const { theme } = useUnistyles();
    const size = 19;
    const radius = 7.5;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.min(100, Math.max(0, props.percentage));
    return (
        <View
            accessible
            accessibilityLabel={t('components.sessionStatusBar.contextUsage', {
                used: props.value.toLocaleString(),
                total: props.maxValue.toLocaleString(),
                percent: Math.round(progress),
            })}
            style={styles.contextCircle}
        >
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.colors.divider} strokeWidth={3} fill="none" />
                <Circle
                    cx={size / 2} cy={size / 2} r={radius} stroke={props.color} strokeWidth={3} fill="none"
                    strokeDasharray={`${circumference} ${circumference}`}
                    strokeDashoffset={circumference * (1 - progress / 100)}
                    strokeLinecap="round" rotation="-90" origin={`${size / 2}, ${size / 2}`}
                />
            </Svg>
        </View>
    );
}

function formatResetTime(milliseconds: number): string {
    const date = new Date(milliseconds);
    return milliseconds - Date.now() < 22 * 3_600_000
        ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create((theme) => ({
    wrapper: { position: 'relative', zIndex: 8, paddingHorizontal: 12 },
    container: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    leftCluster: { flex: 1, minWidth: 0, flexDirection: 'row' },
    rightCluster: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5 },
    chip: { minHeight: 30, maxWidth: 132, paddingHorizontal: 8, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.colors.surfaceHigh },
    chipWide: { maxWidth: 180 },
    chipActive: { borderWidth: 1, borderColor: theme.colors.divider },
    chipText: { color: theme.colors.textSecondary, fontSize: 11, fontWeight: '600', flexShrink: 1 },
    contextCircle: { minWidth: 30, minHeight: 30, alignItems: 'center', justifyContent: 'center' },
    menu: { position: 'absolute', right: 12, bottom: 35, width: 300, maxHeight: 300, paddingVertical: 6, borderRadius: 12, backgroundColor: theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.divider, ...Platform.select({ android: { elevation: 8 }, default: {} }) },
    menuScroll: { maxHeight: 286 },
    menuItem: { minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
    radio: { color: theme.colors.textSecondary, marginRight: 9 },
    menuTextColumn: { flex: 1, minWidth: 0 },
    menuText: { color: theme.colors.text, fontSize: 14, fontWeight: '600' },
    menuDescription: { color: theme.colors.textSecondary, fontSize: 12, lineHeight: 16, marginTop: 2 },
    limitRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
    limitDot: { width: 8, height: 8, borderRadius: 4 },
    limitLabel: { color: theme.colors.text, fontSize: 13, flex: 1 },
    limitValue: { color: theme.colors.text, fontSize: 12, fontWeight: '700' },
    limitReset: { color: theme.colors.textSecondary, fontSize: 11, maxWidth: 90 },
    limitFooter: { color: theme.colors.textSecondary, fontSize: 11, paddingHorizontal: 12, paddingTop: 5, paddingBottom: 4, textAlign: 'right' },
    pressed: { opacity: 0.7 },
}));
