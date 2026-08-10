import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
    path.resolve(__dirname, '..', 'components/usage/UsagePanel.tsx'),
    'utf8',
);

describe('usage panel account boundary', () => {
    it('does not apply usage data or errors after the account generation changes', () => {
        expect(source).toContain("import { sync } from '@/sync/sync';");
        expect(source).toContain('const generation = sync.getAccountGeneration();');
        expect(source).toContain('const isCurrent = () => generation !== null');
        expect(source).toContain('if (controller.signal.aborted || !isCurrent()) return;');
        expect(source).toContain('if (!controller.signal.aborted && isCurrent())');
    });
});
