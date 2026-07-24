import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
    return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Account settings route chunk boundary', () => {
    it('loads the account implementation lazily on Web and statically on Native', () => {
        const web = source('sources/-settings/AccountSettingsRoute.web.tsx');
        const native = source('sources/-settings/AccountSettingsRoute.tsx');
        const route = source('sources/app/(app)/settings/account.tsx');
        expect(web).toContain("import('./AccountSettingsView')");
        expect(web).toContain("accessibilityLabel={t('common.loading')}");
        expect(native).not.toContain('import(');
        expect(native).toContain("from './AccountSettingsView'");
        expect(route).toContain("@/-settings/AccountSettingsRoute");
        expect(route).not.toContain('LocalAuthentication');
        expect(route).not.toContain('ScreenCapture');
    });
});
