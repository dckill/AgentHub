import { describe, expect, it } from 'vitest';

import { calculateNetworkThroughput } from './networkThroughput';

describe('network throughput', () => {
    it('derives download and upload bytes per second from cumulative samples', () => {
        expect(calculateNetworkThroughput(
            { sampledAt: 1_000, receivedBytes: 10_000, sentBytes: 4_000 },
            { sampledAt: 4_000, receivedBytes: 16_000, sentBytes: 7_000 },
        )).toEqual({ sampledAt: 4_000, downloadBytesPerSecond: 2_000, uploadBytesPerSecond: 1_000 });
    });

    it('clamps reset counters and rejects non-forward timestamps', () => {
        expect(calculateNetworkThroughput(
            { sampledAt: 1_000, receivedBytes: 10_000, sentBytes: 4_000 },
            { sampledAt: 4_000, receivedBytes: 500, sentBytes: 100 },
        )).toEqual({ sampledAt: 4_000, downloadBytesPerSecond: 0, uploadBytesPerSecond: 0 });
        expect(calculateNetworkThroughput(
            { sampledAt: 4_000, receivedBytes: 10_000, sentBytes: 4_000 },
            { sampledAt: 4_000, receivedBytes: 11_000, sentBytes: 5_000 },
        )).toBeNull();
    });
});
