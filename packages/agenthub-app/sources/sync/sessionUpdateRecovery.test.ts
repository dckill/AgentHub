import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('session update recovery boundary', () => {
    it('refreshes a missing session before applying update-session payloads', () => {
        const source = readFileSync(resolve(__dirname, 'updateSessionRealtimeHandler.ts'), 'utf8');
        expect(source).toMatch(/handleMissingSessionForUpdate\(\{[\s\S]*?updateType: 'update-session'[\s\S]*?hasSession: Boolean\(params\.session\)[\s\S]*?refreshMissingSession\(sessionId\)/);
    });
});
