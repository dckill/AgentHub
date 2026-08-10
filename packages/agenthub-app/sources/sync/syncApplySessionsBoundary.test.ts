import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Sync session store application boundary', () => {
    it('keeps session application as a direct storage projection without hidden ordering recalculation', () => {
        const source = readFileSync(resolve(__dirname, 'sync.ts'), 'utf8');
        const applyStart = source.indexOf('private applySessions =');
        const applyEnd = source.indexOf('\n    }\n\n}', applyStart);
        const applyBlock = applyStart >= 0 && applyEnd >= 0
            ? source.slice(applyStart, applyEnd)
            : '';

        expect(source).not.toContain('private recalculationLockCount');
        expect(source).not.toContain('private lastRecalculationTime');
        expect(applyBlock).toContain('storage.getState().applySessions(sessions, replace);');
        expect(applyBlock).not.toContain('getActiveSessions');
        expect(applyBlock).not.toContain('const active');
        expect(applyBlock).not.toContain('const newActive');
    });
});
