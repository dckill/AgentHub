import { describe, expect, it } from 'vitest';
import * as metrics from './metrics2';
import * as rpcMetrics from '../api/socket/rpcHandler';

describe('bounded Prometheus labels', () => {
    it('maps known clients to stable families and aggregates arbitrary values', () => {
        expect(metrics.getMetricsLabelsFromRequest({ headers: { 'x-agenthub-client': 'web/1.2.3' } })).toEqual({
            client: 'web',
            client_type: 'web',
        });

        const labels = new Set(Array.from({ length: 10_000 }, (_, index) => (
            metrics.getMetricsLabelsFromRequest({ headers: { 'x-agenthub-client': `attacker-${index}/9.9.9` } }).client
        )));
        expect(labels).toEqual(new Set(['unknown']));
    });

    it('uses only internal route templates and aggregates attacker-controlled unmatched paths', () => {
        const normalize = (metrics as any).normalizeHttpRouteMetricLabel;
        expect(normalize).toBeTypeOf('function');
        expect(normalize('/v1/sessions/:id')).toBe('/v1/sessions/:id');

        const labels = new Set(Array.from({ length: 10_000 }, (_, index) => normalize(undefined, `/probe-${index}`)));
        expect(labels).toEqual(new Set(['unmatched']));
    });

    it('keeps registered Wire RPC methods and aggregates arbitrary extension names', () => {
        const normalize = (rpcMetrics as any).normalizeRpcMetricMethod;
        expect(normalize).toBeTypeOf('function');
        expect(normalize('machine-id:readFile')).toBe('readFile');

        const labels = new Set(Array.from({ length: 10_000 }, (_, index) => normalize(`machine-id:attacker-${index}`)));
        expect(labels).toEqual(new Set(['extension']));
        expect(normalize('')).toBe('unknown');
    });
});
