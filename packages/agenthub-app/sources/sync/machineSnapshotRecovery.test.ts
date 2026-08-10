import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('machine snapshot key recovery', () => {
    it('refreshes the authoritative machine snapshot after a key or field decryption miss', () => {
        const source = readFileSync(resolve(__dirname, 'sync.ts'), 'utf8');
        const lifecycle = readFileSync(resolve(__dirname, 'machineSnapshotSyncLifecycle.ts'), 'utf8');

        expect(source).toContain("import { runMachineSnapshotSync } from './machineSnapshotSyncLifecycle';");
        expect(source).toContain('runMachineSnapshotSync({');
        expect(source).toMatch(/scheduleRetry:\s*\(\) => this\.machinesSync\.invalidate\(\)/);
        expect(lifecycle).toMatch(/applyMachineSnapshotSync\(\{/);
        expect(lifecycle).toMatch(/appliedSnapshot\.reconciledMachines/);
    });

    it('registers machine data keys only through the snapshot application boundary', () => {
        const source = readFileSync(resolve(__dirname, 'sync.ts'), 'utf8');
        const method = source.match(/private fetchMachines[\s\S]*?private syncSettings/)?.[0] ?? '';

        expect(method.match(/this\.dataKeys\.set\('machine'/g) ?? []).toHaveLength(1);
    });
});
