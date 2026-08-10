import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('account update recovery boundary', () => {
    it('invalidates settings sync when realtime settings application fails', () => {
        const source = readFileSync(resolve(__dirname, 'updateAccountRealtimeHandler.ts'), 'utf8');
        expect(source).toMatch(/onSettingsError: \(error\) => \{[\s\S]*?params\.invalidateSettings\(\);/);
    });
});
