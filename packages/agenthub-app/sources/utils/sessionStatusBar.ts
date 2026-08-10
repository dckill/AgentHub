export type ContextUsageLevel = 'normal' | 'warning' | 'critical';

export function resolveStatusBarGitBranch(live: string | null | undefined, metadata: string | null | undefined): string | null {
    return live?.trim() || metadata?.trim() || null;
}

export function clampContextSize(value: number | null | undefined, maxValue: number | null | undefined): number {
    const finiteMax = typeof maxValue === 'number' && Number.isFinite(maxValue) && maxValue > 0 ? maxValue : null;
    if (!Number.isFinite(value) || finiteMax === null) return 0;
    return Math.min(Math.max(0, value ?? 0), finiteMax);
}

export function getContextUsagePercentage(value: number | null | undefined, maxValue: number | null | undefined): number {
    const finiteMax = typeof maxValue === 'number' && Number.isFinite(maxValue) && maxValue > 0 ? maxValue : null;
    if (finiteMax === null) return 0;
    return clampContextSize(value, finiteMax) / finiteMax * 100;
}

export function getContextUsageLevel(value: number | null | undefined, maxValue: number | null | undefined): ContextUsageLevel {
    const percentage = getContextUsagePercentage(value, maxValue);
    if (percentage >= 95) return 'critical';
    if (percentage >= 90) return 'warning';
    return 'normal';
}

export type UsageLimitWindowLike = {
    id: string;
    label?: string;
    status?: string;
    utilization?: number | null;
    resetsAt?: number | null;
};

export type UsageLimitsLike = { capturedAt: number; windows: UsageLimitWindowLike[] } | null | undefined;
export type UsageLimitStatus = 'allowed' | 'allowed_warning' | 'rejected';

const knownLabels: Record<string, string> = { five_hour: '5h', seven_day: '7d' };

export function getUsageLimitStatus(window: UsageLimitWindowLike): UsageLimitStatus {
    if (window.status === 'allowed' || window.status === 'allowed_warning' || window.status === 'rejected') return window.status;
    if (typeof window.utilization === 'number' && Number.isFinite(window.utilization)) {
        if (window.utilization >= 100) return 'rejected';
        if (window.utilization >= 90) return 'allowed_warning';
    }
    return 'allowed';
}

export type UsageLimitChip = { id: string; shortLabel: string; utilization: number; status: UsageLimitStatus };

export function getUsageLimitChips(limits: UsageLimitsLike, collapsed: boolean): UsageLimitChip[] {
    if (!limits || !Array.isArray(limits.windows)) return [];
    const chips: UsageLimitChip[] = [];
    for (const id of Object.keys(knownLabels)) {
        const window = limits.windows.find((candidate) => candidate.id === id);
        if (!window || typeof window.utilization !== 'number' || !Number.isFinite(window.utilization)) continue;
        chips.push({
            id,
            shortLabel: knownLabels[id],
            utilization: Math.round(Math.min(100, Math.max(0, window.utilization))),
            status: getUsageLimitStatus(window),
        });
    }
    if (chips.length === 0) {
        const fallback = limits.windows.find((window) => getUsageLimitStatus(window) === 'rejected')
            ?? limits.windows.find((window) => getUsageLimitStatus(window) === 'allowed_warning');
        if (fallback) {
            const status = getUsageLimitStatus(fallback);
            chips.push({
                id: fallback.id,
                shortLabel: fallback.label?.trim() || (fallback.id === 'plan' ? 'Plan' : fallback.id.replace(/_/g, ' ')),
                utilization: typeof fallback.utilization === 'number' && Number.isFinite(fallback.utilization)
                    ? Math.round(Math.min(100, Math.max(0, fallback.utilization)))
                    : status === 'rejected' ? 100 : 90,
                status,
            });
        }
    }
    if (collapsed && chips.length > 1) return [chips.reduce((left, right) => right.utilization > left.utilization ? right : left)];
    return chips;
}

export type UsageLimitRow = { id: string; label: string; utilization: number | null; resetsAt: number | null; status: UsageLimitStatus };

export function getUsageLimitRows(limits: UsageLimitsLike): UsageLimitRow[] {
    if (!limits || !Array.isArray(limits.windows)) return [];
    const known = Object.keys(knownLabels);
    return [...limits.windows].sort((left, right) => {
        const leftIndex = known.indexOf(left.id);
        const rightIndex = known.indexOf(right.id);
        return (leftIndex < 0 ? known.length : leftIndex) - (rightIndex < 0 ? known.length : rightIndex);
    }).map((window) => ({
        id: window.id,
        label: window.label ?? window.id.replace(/_/g, ' '),
        utilization: typeof window.utilization === 'number' && Number.isFinite(window.utilization)
            ? Math.round(Math.min(100, Math.max(0, window.utilization))) : null,
        resetsAt: typeof window.resetsAt === 'number' && Number.isFinite(window.resetsAt) ? window.resetsAt : null,
        status: getUsageLimitStatus(window),
    }));
}

export function getUsageLimitDisplayPercentage(utilization: number, showRemaining: boolean): number {
    return showRemaining ? 100 - utilization : utilization;
}

export function formatUsageLimitAge(capturedAt: number, now: number): string {
    const minutes = Math.max(0, Math.floor((now - capturedAt) / 60_000));
    if (minutes < 1) return '<1m';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours}h`;
    return `${Math.round(hours / 24)}d`;
}
