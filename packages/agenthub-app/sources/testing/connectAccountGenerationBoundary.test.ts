import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => fs.readFileSync(
    path.resolve(__dirname, '..', relativePath),
    'utf8',
);

describe('QR account connection lifecycle boundary', () => {
    it('binds terminal approval to the originating account generation', () => {
        const source = read('hooks/useConnectTerminal.ts');
        expect(source).toContain("import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';");
        expect(source).toContain('const generation = sync.getAccountGeneration();');
        expect(source).toContain('const isCurrent = () => generation !== null');
        expect(source).toContain('request: () => authAccountApprove');
        expect(source).toContain('request: () => authApprove');
        expect(source).toContain('if (result === null || !isCurrent()) return false;');
    });

    it('binds account linking to the originating account generation', () => {
        const source = read('hooks/useConnectAccount.ts');
        expect(source).toContain("import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';");
        expect(source).toContain('const generation = sync.getAccountGeneration();');
        expect(source).toContain('const isCurrent = () => generation !== null');
        expect(source).toContain('request: () => authAccountApprove');
        expect(source).toContain('if (result === null || !isCurrent()) return false;');
    });
});
