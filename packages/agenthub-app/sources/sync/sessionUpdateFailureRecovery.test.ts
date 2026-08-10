import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('session update failure recovery', () => {
    it('invalidates the sessions sync when an encrypted field cannot be applied', () => {
        const source = readFileSync(resolve(__dirname, 'updateSessionRealtimeHandler.ts'), 'utf8');
        expect(source).toMatch(/onError: \(field, error\) => \{[\s\S]*?params\.invalidateSessions\(\);/);
    });
});
