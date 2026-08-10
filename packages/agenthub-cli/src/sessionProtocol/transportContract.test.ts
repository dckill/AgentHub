import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const contract = readFileSync(new URL('./transportContract.md', import.meta.url), 'utf8');

describe('Claude/Codex transport reliability contract', () => {
    it('keeps both transports and their observable terminal guarantees explicit', () => {
        for (const required of [
            'Claude 适配位置',
            'Codex 适配位置',
            'turn-end',
            'reconnectAndResumeThread()',
            'S-14',
            'pending approval',
        ]) {
            expect(contract).toContain(required);
        }
    });

    it('keeps all terminal reasons and compatibility behavior explicit', () => {
        expect(contract).toContain('三类 reason 已落地');
        expect(contract).toContain('`aborted` 只能作为兼容布尔字段保留');
        expect(contract).toContain("reason: 'timeout' | 'interrupt' | 'backend-failure'");
    });
});
