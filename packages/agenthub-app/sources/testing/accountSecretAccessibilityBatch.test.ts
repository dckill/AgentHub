import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../-settings/AccountSettingsView.tsx'), 'utf8');

describe('account secret accessibility boundary', () => {
    it('exposes the revealed secret copy surface as a named button', () => {
        const copySurface = source.match(/<Pressable[\s\S]*?onPress=\{handleCopySecret\}[\s\S]*?<\/Pressable>/)?.[0] ?? '';
        expect(copySurface).toContain('accessibilityRole="button"');
        expect(copySurface).toContain("accessibilityLabel={t('settingsAccount.secretKeyLabel')}");
    });
});
