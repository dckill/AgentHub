import type { ApiEphemeralUpdate } from './apiTypes';

export type LatestSessionUsage = {
    inputTokens: number;
    outputTokens: number;
    cacheCreation: number;
    cacheRead: number;
    contextSize: number;
    contextWindow?: number;
    timestamp: number;
};

type UsageEphemeralUpdate = Extract<ApiEphemeralUpdate, { type: 'usage' }>;

function tokenValue(tokens: Record<string, unknown>, key: string): number {
    const value = tokens[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function optionalTokenValue(tokens: Record<string, unknown>, keys: string[]): number | undefined {
    for (const key of keys) {
        const value = tokens[key];
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
            return value;
        }
    }
    return undefined;
}

export function buildLatestUsageFromEphemeral(update: UsageEphemeralUpdate): LatestSessionUsage {
    const inputTokens = tokenValue(update.tokens, 'input');
    const outputTokens = tokenValue(update.tokens, 'output');
    const cacheCreation = tokenValue(update.tokens, 'cache_creation');
    const cacheRead = tokenValue(update.tokens, 'cache_read');
    const explicitContextSize = optionalTokenValue(update.tokens, [
        'context',
        'context_size',
        'contextSize',
        'context_tokens',
        'contextTokens',
    ]);
    const contextWindow = optionalTokenValue(update.tokens, [
        'context_window',
        'contextWindow',
        'model_context_window',
        'modelContextWindow',
    ]);
    const hasContextBreakdown = 'input' in update.tokens
        || 'cache_creation' in update.tokens
        || 'cache_read' in update.tokens;
    const contextSize = explicitContextSize ?? (hasContextBreakdown
        ? inputTokens + cacheCreation + cacheRead
        : tokenValue(update.tokens, 'total'));

    return {
        inputTokens,
        outputTokens,
        cacheCreation,
        cacheRead,
        contextSize,
        ...(contextWindow !== undefined ? { contextWindow } : {}),
        timestamp: update.timestamp,
    };
}
