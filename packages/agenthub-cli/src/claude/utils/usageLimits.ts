import type { UsageLimits, UsageLimitWindow, UsageLimitWindowStatus } from '@/api/types';

export type UnboundRateLimit = {
    status: UsageLimitWindowStatus;
    utilization?: number | null;
    resetsAt?: number | null;
};

export type UsageLimitsPatch = {
    capturedAt: number;
    windows: UsageLimitWindow[];
    unbound?: UnboundRateLimit;
    replace?: boolean;
};

export function synthesizeStatus(utilization: number | null | undefined): UsageLimitWindowStatus | undefined {
    if (typeof utilization !== 'number' || !Number.isFinite(utilization)) return undefined;
    if (utilization >= 100) return 'rejected';
    if (utilization >= 90) return 'allowed_warning';
    return 'allowed';
}

function normalizeEventUtilization(value: number | undefined): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    const percent = value <= 1 ? value * 100 : value;
    return Math.min(100, Math.max(0, Math.round(percent * 10) / 10));
}

function normalizeEventResetsAt(value: number | undefined): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
}

function normalizeIsoResetsAt(value: string | null | undefined): number | null {
    if (!value) return null;
    const milliseconds = Date.parse(value);
    return Number.isFinite(milliseconds) ? milliseconds : null;
}

export function windowsFromGetUsage(rateLimits: Record<string, unknown>): UsageLimitWindow[] {
    const windows: UsageLimitWindow[] = [];
    for (const [id, value] of Object.entries(rateLimits)) {
        if (id === 'extra_usage' || !value || typeof value !== 'object') continue;
        if (!('utilization' in value) && !('resets_at' in value)) continue;
        const window = value as { utilization?: unknown; resets_at?: unknown };
        const utilization = typeof window.utilization === 'number' && Number.isFinite(window.utilization)
            ? Math.min(100, Math.max(0, window.utilization))
            : null;
        windows.push({
            id,
            utilization,
            resetsAt: normalizeIsoResetsAt(typeof window.resets_at === 'string' ? window.resets_at : null),
            status: synthesizeStatus(utilization),
        });
    }
    return windows;
}

export type RateLimitEventInfo = {
    status: UsageLimitWindowStatus;
    rateLimitType?: string;
    utilization?: number;
    resetsAt?: number;
};

export function fromRateLimitEvent(info: RateLimitEventInfo): { window?: UsageLimitWindow; unbound?: UnboundRateLimit } {
    const utilization = normalizeEventUtilization(info.utilization);
    const resetsAt = normalizeEventResetsAt(info.resetsAt);
    if (info.rateLimitType) {
        return {
            window: {
                id: info.rateLimitType,
                status: info.status,
                utilization: utilization ?? null,
                resetsAt: resetsAt ?? null,
            },
        };
    }
    return { unbound: { status: info.status, utilization: utilization ?? null, resetsAt: resetsAt ?? null } };
}

export function mergeUsageLimits(current: UsageLimits | null | undefined, patch: UsageLimitsPatch): UsageLimits {
    const windows = !patch.replace && Array.isArray(current?.windows) ? [...current.windows] : [];
    for (const incoming of patch.windows) {
        const index = windows.findIndex((window) => window.id === incoming.id);
        if (index >= 0) {
            windows[index] = {
                ...incoming,
                utilization: incoming.utilization ?? windows[index].utilization,
                resetsAt: incoming.resetsAt ?? windows[index].resetsAt,
            };
        } else {
            windows.push(incoming);
        }
    }
    if (patch.unbound) {
        let target = -1;
        let highestUtilization = -1;
        for (let index = 0; index < windows.length; index++) {
            const utilization = windows[index].utilization;
            if (typeof utilization === 'number' && utilization > highestUtilization) {
                highestUtilization = utilization;
                target = index;
            }
        }
        if (target < 0) target = windows.findIndex((window) => window.id === 'plan');
        if (target >= 0) {
            windows[target] = {
                ...windows[target],
                status: patch.unbound.status,
                utilization: patch.unbound.utilization ?? windows[target].utilization,
                resetsAt: patch.unbound.resetsAt ?? windows[target].resetsAt,
            };
        } else {
            windows.push({
                id: 'plan',
                status: patch.unbound.status,
                utilization: patch.unbound.utilization ?? null,
                resetsAt: patch.unbound.resetsAt ?? null,
            });
        }
    }
    return { capturedAt: patch.capturedAt, windows };
}
