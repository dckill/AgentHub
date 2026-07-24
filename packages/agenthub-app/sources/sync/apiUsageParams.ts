import type { UsageQueryParams } from './apiUsage';

export type UsagePeriod = 'today' | '7days' | '30days';

export function buildUsageQueryParams(
    period: UsagePeriod,
    sessionId?: string,
    nowMs: number = Date.now(),
): UsageQueryParams {
    const now = Math.floor(nowMs / 1000);
    const oneDaySeconds = 24 * 60 * 60;

    let startTime: number;
    let groupBy: UsageQueryParams['groupBy'];

    switch (period) {
        case 'today': {
            const today = new Date(nowMs);
            today.setHours(0, 0, 0, 0);
            startTime = Math.floor(today.getTime() / 1000);
            groupBy = '15min';
            break;
        }
        case '7days':
            startTime = now - (7 * oneDaySeconds);
            groupBy = 'day';
            break;
        case '30days':
            startTime = now - (30 * oneDaySeconds);
            groupBy = 'day';
            break;
    }

    return {
        sessionId,
        startTime,
        endTime: now,
        groupBy,
    };
}
