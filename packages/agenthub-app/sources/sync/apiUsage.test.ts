import { describe, expect, it } from 'vitest';

import { buildUsageQueryParams } from './apiUsageParams';
import { calculateTotals, sumUsageMetric } from './apiUsageTotals';

describe('apiUsage', () => {
    it('uses 15 minute buckets for today', () => {
        const now = new Date('2026-06-27T10:32:00Z').getTime();

        expect(buildUsageQueryParams('today', undefined, now)).toMatchObject({
            groupBy: '15min',
            endTime: Math.floor(now / 1000),
        });
    });

    it('keeps day buckets for longer ranges', () => {
        const params = buildUsageQueryParams('30days', 'session-1', new Date('2026-06-27T10:32:00Z').getTime());

        expect(params.groupBy).toBe('day');
        expect(params.sessionId).toBe('session-1');
    });

    it('does not double count total token and cost fields', () => {
        expect(sumUsageMetric({ total: 12, input: 5, output: 7 })).toBe(12);
        expect(sumUsageMetric({ input: 5, output: 7 })).toBe(12);
        expect(sumUsageMetric({ input: 5, output: 7, context: 99, context_window: 200000 })).toBe(12);

        const totals = calculateTotals([{
            timestamp: 1,
            tokens: { total: 12, input: 5, output: 7 },
            cost: { total: 0.12, input: 0.05, output: 0.07 },
            reportCount: 1,
        }]);

        expect(totals.totalTokens).toBe(12);
        expect(totals.totalCost).toBe(0.12);
    });

    it('aggregates usage by agent and model dimensions', () => {
        const totals = calculateTotals([{
            timestamp: 1,
            tokens: { total: 30, input: 20, output: 10 },
            cost: { total: 0 },
            reportCount: 2,
            byAgent: {
                codex: {
                    agent: 'codex',
                    model: null,
                    tokens: { total: 20, input: 15, output: 5 },
                    cost: { total: 0 },
                    reportCount: 1,
                },
                claude: {
                    agent: 'claude',
                    model: null,
                    tokens: { total: 10, input: 5, output: 5 },
                    cost: { total: 0 },
                    reportCount: 1,
                },
            },
            byModel: {
                'codex:gpt-test': {
                    agent: 'codex',
                    model: 'gpt-test',
                    tokens: { total: 20, input: 15, output: 5 },
                    cost: { total: 0 },
                    reportCount: 1,
                },
                'claude:claude-test': {
                    agent: 'claude',
                    model: 'claude-test',
                    tokens: { total: 10, input: 5, output: 5 },
                    cost: { total: 0 },
                    reportCount: 1,
                },
            },
        }]);

        expect(totals.tokensByAgent).toEqual({ codex: 20, claude: 10 });
        expect(totals.tokensByModel).toMatchObject({
            'codex:gpt-test': 20,
            'claude:claude-test': 10,
        });

        const codexTotals = calculateTotals([{
            timestamp: 1,
            tokens: { total: 30, input: 20, output: 10 },
            cost: { total: 0 },
            reportCount: 2,
            byAgent: {
                codex: {
                    agent: 'codex',
                    model: null,
                    tokens: { total: 20, input: 15, output: 5 },
                    cost: { total: 0 },
                    reportCount: 1,
                },
            },
            byModel: {
                'codex:gpt-test': {
                    agent: 'codex',
                    model: 'gpt-test',
                    tokens: { total: 20, input: 15, output: 5 },
                    cost: { total: 0 },
                    reportCount: 1,
                },
            },
        }], 'codex');

        expect(codexTotals.totalTokens).toBe(20);
        expect(codexTotals.modelBreakdowns[0]?.model).toBe('gpt-test');
    });
});
