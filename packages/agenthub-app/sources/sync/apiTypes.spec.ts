import { describe, expect, it } from 'vitest';
import { ApiEphemeralUpdateSchema, ApiUpdateSchema } from './apiTypes';

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
