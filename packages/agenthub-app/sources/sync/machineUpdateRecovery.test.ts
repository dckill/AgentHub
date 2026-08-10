import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('machine update recovery boundary', () => {
    it('invalidates machine sync when the application boundary reports no local machine', () => {
        const source = readFileSync(resolve(__dirname, 'updateMachineRealtimeHandler.ts'), 'utf8');
        expect(source).toMatch(/machineUpdateResult\.kind === 'missing-machine'[\s\S]*?params\.invalidateMachines\(\);[\s\S]*?return;/);
        expect(source.indexOf("machineUpdateResult.kind === 'missing-machine'")).toBeLessThan(source.indexOf('params.applyMachine'));
    });
});
