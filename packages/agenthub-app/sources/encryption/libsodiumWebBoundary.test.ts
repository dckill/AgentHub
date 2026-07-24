import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Web libsodium loading boundary', () => {
    it('does not start the E2EE implementation until an authenticated or QR flow requests it', () => {
        const webAdapter = readFileSync(resolve(__dirname, 'libsodium.lib.web.ts'), 'utf8');
        const rootLayout = readFileSync(resolve(__dirname, '../app/_layout.tsx'), 'utf8');
        const encryption = readFileSync(resolve(__dirname, '../sync/encryption/encryption.ts'), 'utf8');
        const qrAuth = readFileSync(resolve(__dirname, '../auth/authQRStart.ts'), 'utf8');
        const tokenAuth = readFileSync(resolve(__dirname, '../auth/authGetToken.ts'), 'utf8');

        expect(webAdapter).not.toMatch(/^import sodium from ['"]libsodium-wrappers['"];?$/m);
        expect(webAdapter).toContain("import('libsodium-wrappers')");
        expect(webAdapter).toContain('function ensureReady()');
        expect(webAdapter.indexOf("ready = import('libsodium-wrappers')"))
            .toBeGreaterThan(webAdapter.indexOf('function ensureReady()'));
        expect(webAdapter).toContain("property === 'ready'");
        expect(webAdapter).toContain('if (!implementation)');
        expect(webAdapter).toContain("throw new Error('libsodium is not ready')");

        expect(rootLayout).not.toContain("import sodium from '@/encryption/libsodium.lib'");
        expect(rootLayout).not.toContain('await sodium.ready');
        expect(encryption).toContain('await sodium.ready');
        expect(qrAuth).toContain('export async function prepareAuthKeyPair');
        expect(qrAuth).toContain('await sodium.ready');
        expect(tokenAuth).toContain('await sodium.ready');
    });
});
