import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const syncSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'sync/sync.ts'),
    'utf8',
);

describe('account activity generation boundary', () => {
    it('clears accumulated activity before stopping account syncs', () => {
        expect(syncSource).toMatch(
            /private stopAccountSyncs\(\) \{[\s\S]{0,420}this\.activityAccumulator\.reset\(\);[\s\S]{0,420}stopAccountSyncs\(/,
        );
    });
});
