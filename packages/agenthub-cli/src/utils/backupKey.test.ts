import { describe, expect, it } from 'vitest';
import { formatSecretKeyForBackup } from './backupKey';

describe('CLI backup key formatting', () => {
    it('matches the shared Wire Base32 display contract', () => {
        const bytes = Uint8Array.from({ length: 32 }, (_, index) => index);

        expect(formatSecretKeyForBackup(bytes)).toBe('AAAQE-AYEAU-DAOCA-JBIFQ-YDIOB-4IBCE-QTCQK-RMFYY-DENBW-HA5DY-PQ');
    });
});
