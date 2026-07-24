import type { AuthCredentials } from '@/auth/tokenStorage';
import { buildUsageQueryParams, type UsagePeriod } from './apiUsageParams';
import { httpClient } from './authenticatedHttpClient';
import { HttpStatusError } from '@/utils/time';

export { buildUsageQueryParams };
export { calculateTotals, sumUsageMetric } from './apiUsageTotals';

export interface UsageBreakdown {
    tokens: Record<string, number>;
    cost: Record<string, number>;
    reportCount: number;
    agent?: string | null;
    model?: string | null;
}

export interface UsageDataPoint {
    timestamp: number;
    tokens: Record<string, number>;
    cost: Record<string, number>;
    reportCount: number;
    byAgent?: Record<string, UsageBreakdown>;
    byModel?: Record<string, UsageBreakdown>;
}

export interface UsageQueryParams {
    sessionId?: string;
    startTime?: number; // Unix timestamp in seconds
    endTime?: number;   // Unix timestamp in seconds
    groupBy?: '15min' | 'hour' | 'day';
}

export interface UsageResponse {
    usage: UsageDataPoint[];
}

/**
 * Query usage data from the server
 */
export async function queryUsage(
    credentials: AuthCredentials,
    params: UsageQueryParams = {},
    signal?: AbortSignal,
): Promise<UsageResponse> {
    try {
        const response = await httpClient.request<UsageResponse>(credentials, '/v1/usage/query', {
        method: 'POST',
            body: params,
            signal,
            idempotent: true,
        });
        return response.data;
    } catch (error) {
        if (error instanceof HttpStatusError && error.status === 404 && params.sessionId) {
            throw new Error('Session not found');
        }
        throw error;
    }
}

/**
 * Helper function to get usage for a specific time period
 */
export async function getUsageForPeriod(
    credentials: AuthCredentials,
    period: UsagePeriod,
    sessionId?: string,
    signal?: AbortSignal,
): Promise<UsageResponse> {
    const params = buildUsageQueryParams(period, sessionId);
    try {
        return await queryUsage(credentials, params, signal);
    } catch (error) {
        if (period === 'today' && params.groupBy === '15min') {
            return queryUsage(credentials, { ...params, groupBy: 'hour' }, signal);
        }
        throw error;
    }
}
