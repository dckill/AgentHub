import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('project customization sync boundary', () => {
    it('routes project customizations through the account settings synchronizer', () => {
        const source = fs.readFileSync(
            path.join(process.cwd(), 'sources/components/ActiveSessionsGroupCompact.tsx'),
            'utf8',
        );

        expect(source).toContain('sync.applySettings({ projectCustomizations: updated })');
        expect(source).not.toContain('storage.getState().applySettingsLocal({ projectCustomizations: updated })');
    });
});
