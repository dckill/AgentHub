import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('machine activity recovery boundary', () => {
    it('invalidates machine sync when a realtime activity update has no local machine', () => {
        const source = readFileSync(resolve(__dirname, 'ephemeralRealtimeHandler.ts'), 'utf8');
        expect(source).toMatch(/applyMachineActivityUpdate\(params\.getMachine\(update\.id\), update\)/);
        expect(source).toMatch(/result\.kind === 'missing'[\s\S]*?params\.invalidateMachines\(\);/);
    });
});
