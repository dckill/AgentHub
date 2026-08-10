import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => fs.readFileSync(path.resolve(__dirname, '../components', file), 'utf8');

describe('accessibility coverage batch', () => {
    it('names archived-session navigation and rows', () => {
        const content = source('ArchivedSessionsOverlay.tsx');
        expect(content).toContain('accessibilityRole="button"');
        expect(content).toContain("accessibilityLabel={t('common.back')}");
        expect(content).toContain('accessibilityLabel={item.name}');
    });

    it('names file-reference removal controls', () => {
        const content = source('FileReferenceChips.tsx');
        expect(content).toContain('accessibilityRole="button"');
        expect(content).toContain('accessibilityLabel={`${t(\'common.close\')} ${name}`}');
    });

    it('names URL authentication controls and fields', () => {
        const content = source('ConnectButton.tsx');
        expect(content).toContain("accessibilityLabel={t('connectButton.authenticateWithUrlPaste')}");
        expect(content).toContain("accessibilityLabel={t('connectButton.pasteAuthUrl')}");
        expect(content).toContain("accessibilityLabel={t('connectButton.authenticate')}");
    });
});
