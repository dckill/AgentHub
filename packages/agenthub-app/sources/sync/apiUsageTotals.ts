export interface UsageTotalsDataPoint {
    timestamp: number;
    tokens: Record<string, number>;
    cost: Record<string, number>;
    reportCount: number;
    byAgent?: Record<string, UsageBreakdownData>;
    byModel?: Record<string, UsageBreakdownData>;
}

export interface UsageBreakdownData {
    tokens: Record<string, number>;
    cost: Record<string, number>;
    reportCount: number;
    agent?: string | null;
    model?: string | null;
}

export interface UsageDimensionTotal {
    key: string;
    agent?: string | null;
    model?: string | null;
    totalTokens: number;
    totalCost: number;
    reportCount: number;
    tokensByMetric: Record<string, number>;
}

export interface UsageTotalsResult {
    totalTokens: number;
    totalCost: number;
    reportCount: number;
    activeBuckets: number;
    tokensByMetric: Record<string, number>;
    tokensByAgent: Record<string, number>;
    tokensByModel: Record<string, number>;
    agentBreakdowns: UsageDimensionTotal[];
    modelBreakdowns: UsageDimensionTotal[];
}

const tokenMetadataKeys = new Set(['context', 'context_window']);

export function sumUsageMetric(values: Record<string, number>): number {
    if (typeof values.total === 'number') {
        return values.total;
    }
    return Object.entries(values).reduce((sum, [key, value]) => {
        if (tokenMetadataKeys.has(key)) {
            return sum;
        }
        return sum + (typeof value === 'number' ? value : 0);
    }, 0);
}

function emptyBreakdown(): UsageBreakdownData {
    return {
        tokens: {},
        cost: {},
        reportCount: 0,
    };
}

function addMetricValues(target: Record<string, number>, values: Record<string, number>) {
    for (const [key, value] of Object.entries(values)) {
        if (typeof value !== 'number' || tokenMetadataKeys.has(key)) {
            continue;
        }
        target[key] = (target[key] || 0) + value;
    }
}

function addDimensionTotal(
    map: Map<string, UsageDimensionTotal>,
    key: string,
    breakdown: UsageBreakdownData,
) {
    if (!map.has(key)) {
        map.set(key, {
            key,
            agent: breakdown.agent ?? null,
            model: breakdown.model ?? null,
            totalTokens: 0,
            totalCost: 0,
            reportCount: 0,
            tokensByMetric: {},
        });
    }

    const total = map.get(key)!;
    total.totalTokens += sumUsageMetric(breakdown.tokens);
    total.totalCost += sumUsageMetric(breakdown.cost);
    total.reportCount += breakdown.reportCount || 0;
    addMetricValues(total.tokensByMetric, breakdown.tokens);
}

function getScopedBreakdown(point: UsageTotalsDataPoint, agentFilter: string): UsageBreakdownData {
    if (agentFilter === 'all') {
        return {
            tokens: point.tokens,
            cost: point.cost,
            reportCount: point.reportCount,
        };
    }

    return point.byAgent?.[agentFilter] ?? emptyBreakdown();
}

export function calculateTotals(usage: UsageTotalsDataPoint[], agentFilter: string = 'all'): UsageTotalsResult {
    const result: UsageTotalsResult = {
        totalTokens: 0,
        totalCost: 0,
        reportCount: 0,
        activeBuckets: 0,
        tokensByMetric: {},
        tokensByAgent: {},
        tokensByModel: {},
        agentBreakdowns: [],
        modelBreakdowns: [],
    };

    const agentTotals = new Map<string, UsageDimensionTotal>();
    const modelTotals = new Map<string, UsageDimensionTotal>();

    for (const dataPoint of usage) {
        const scoped = getScopedBreakdown(dataPoint, agentFilter);
        const scopedTokens = sumUsageMetric(scoped.tokens);

        if (scopedTokens > 0) {
            result.activeBuckets++;
        }

        result.totalTokens += scopedTokens;
        result.totalCost += sumUsageMetric(scoped.cost);
        result.reportCount += scoped.reportCount || 0;
        addMetricValues(result.tokensByMetric, scoped.tokens);

        if (dataPoint.byAgent) {
            for (const [agent, breakdown] of Object.entries(dataPoint.byAgent)) {
                addDimensionTotal(agentTotals, agent, breakdown);
            }
        }

        if (dataPoint.byModel) {
            for (const [modelKey, breakdown] of Object.entries(dataPoint.byModel)) {
                if (agentFilter !== 'all' && breakdown.agent !== agentFilter) {
                    continue;
                }
                addDimensionTotal(modelTotals, modelKey, breakdown);
            }
        }
    }

    result.agentBreakdowns = Array.from(agentTotals.values()).sort((a, b) => b.totalTokens - a.totalTokens);
    result.modelBreakdowns = Array.from(modelTotals.values()).sort((a, b) => b.totalTokens - a.totalTokens);
    result.tokensByAgent = Object.fromEntries(result.agentBreakdowns.map(item => [item.key, item.totalTokens]));
    result.tokensByModel = Object.fromEntries(result.modelBreakdowns.map(item => [item.key, item.totalTokens]));

    return result;
}
