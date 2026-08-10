import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('machine update failure recovery', () => {
    it('invalidates the machines sync when encrypted machine fields fail', () => {
        const dispatchSource = readFileSync(resolve(__dirname, 'machineRealtimeDispatch.ts'), 'utf8');
        const newMachineHandler = readFileSync(resolve(__dirname, 'newMachineRealtimeHandler.ts'), 'utf8');
        const updateMachineHandler = readFileSync(resolve(__dirname, 'updateMachineRealtimeHandler.ts'), 'utf8');

        expect(newMachineHandler).toMatch(/onError: \(field, error\) => \{[\s\S]*?params\.invalidateMachines\(\);/);
        expect(updateMachineHandler).toMatch(/onError: \(field, error\) => \{[\s\S]*?params\.invalidateMachines\(\);/);
        expect(dispatchSource).toContain('handleUpdateMachineRealtime');
    });
});
