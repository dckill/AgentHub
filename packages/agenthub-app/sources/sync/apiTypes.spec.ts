import { describe, expect, it } from 'vitest';
import { ApiEphemeralUpdateSchema, ApiUpdateContainerSchema, ApiUpdateSchema } from './apiTypes';

describe('ApiUpdateSchema', () => {
    it('accepts shared wire update-session payload', () => {
        const parsed = ApiUpdateSchema.safeParse({
            t: 'update-session',
            id: 'session-1',
        });
        expect(parsed.success).toBe(true);
    });

    it('accepts app-local new-session payload', () => {
        const parsed = ApiUpdateSchema.safeParse({
            t: 'new-session',
            id: 'session-2',
            createdAt: 1,
            updatedAt: 1,
        });
        expect(parsed.success).toBe(true);
    });

    it('accepts the complete server new-machine payload needed for cold onboarding', () => {
        const body = {
            t: 'new-machine',
            machineId: 'machine-1',
            seq: 7,
            metadata: 'encrypted-metadata',
            metadataVersion: 2,
            daemonState: null,
            daemonStateVersion: 0,
            dataEncryptionKey: 'encrypted-key',
            active: false,
            activeAt: 1700000000000,
            createdAt: 1700000000000,
            updatedAt: 1700000000001,
        };

        expect(ApiUpdateSchema.safeParse(body).success).toBe(true);
        expect(ApiUpdateContainerSchema.safeParse({
            id: 'update-1',
            seq: 42,
            createdAt: 1700000000001,
            body,
        }).success).toBe(true);
    });
});

describe('ApiEphemeralUpdateSchema', () => {
    it('accepts usage updates with partial token and cost breakdowns', () => {
        const parsed = ApiEphemeralUpdateSchema.safeParse({
            type: 'usage',
            id: 'session-1',
            key: 'codex-session',
            timestamp: 123,
            tokens: {
                total: 17,
                input: 10,
                cache_read: 2,
                context: 12,
                context_window: 1000,
            },
            cost: {
                total: 0.001,
            },
        });

        expect(parsed.success).toBe(true);
    });
});
