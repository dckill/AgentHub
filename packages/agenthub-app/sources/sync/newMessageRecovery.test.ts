import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('new message recovery boundary', () => {
    it('invalidates message sync when realtime message decryption throws', () => {
        const source = readFileSync(resolve(__dirname, 'newMessageRealtimeHandler.ts'), 'utf8');
        expect(source).toMatch(/result\.kind === 'failed'[\s\S]*?params\.invalidateMessages\(\);/);
    });

    it('invalidates message sync when realtime message decryption returns null', () => {
        const source = readFileSync(resolve(__dirname, 'newMessageRealtimeHandler.ts'), 'utf8');
        expect(source).toMatch(/result\.kind === 'empty'[\s\S]*?params\.invalidateMessages\(\);/);
    });
});
