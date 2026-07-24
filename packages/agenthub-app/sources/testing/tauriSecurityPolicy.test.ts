import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appRoot = resolve(import.meta.dirname, '../..');
const readJson = (path: string) => JSON.parse(readFileSync(resolve(appRoot, path), 'utf8')) as any;

describe('Tauri production security policy', () => {
    it('uses a restrictive CSP with no wildcard or insecure network source', () => {
        const config = readJson('src-tauri/tauri.conf.json');
        const csp = config.app?.security?.csp;

        expect(csp).toBeTypeOf('string');
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("object-src 'none'");
        expect(csp).toContain("base-uri 'none'");
        expect(csp).toContain("style-src-elem 'self' 'unsafe-inline'");
        expect(csp).toContain("style-src-attr 'unsafe-inline'");
        expect(csp).not.toContain('*');
        expect(csp.replace('http://ipc.localhost', '')).not.toContain('http://');
    });

    it('does not grant the production WebView arbitrary HTTP plugin access', () => {
        const capability = readJson('src-tauri/capabilities/default.json');
        const serialized = JSON.stringify(capability.permissions);

        expect(serialized).not.toContain('http:default');
        expect(serialized).not.toContain('http://**');
        expect(serialized).not.toContain('https://**');
    });

    it('keeps relaxed development CSP isolated to the dev overlay', () => {
        const production = readJson('src-tauri/tauri.conf.json');
        const development = readJson('src-tauri/tauri.dev.conf.json');

        expect(production.app.security.csp).not.toBeNull();
        expect(development.app?.security?.csp).toBeNull();
        expect(production.build.beforeBuildCommand).toContain('--clear');
    });

    it('pins the Cargo toolchain to the declared minimum Rust release', () => {
        const cargo = readFileSync(resolve(appRoot, 'src-tauri/Cargo.toml'), 'utf8');
        const toolchain = readFileSync(resolve(appRoot, 'src-tauri/rust-toolchain.toml'), 'utf8');

        expect(cargo).toContain('rust-version = "1.85"');
        expect(cargo).toContain('custom-protocol = ["tauri/custom-protocol"]');
        expect(toolchain).toContain('channel = "1.85.1"');
    });

    it('patches Unistyles dynamic CSS updates for WebKitGTK compatibility', () => {
        const patchScript = readFileSync(
            resolve(appRoot, '../../patches/fix-unistyles-webkit-style-tag.cjs'),
            'utf8',
        );
        const rootPostinstall = readFileSync(resolve(appRoot, '../../scripts/postinstall.cjs'), 'utf8');

        expect(patchScript).toContain('this.styleTag.textContent = this.getStyles()');
        expect(patchScript).toContain('this.styleTag.innerText = this.getStyles()');
        expect(rootPostinstall).toContain("require('../patches/fix-unistyles-webkit-style-tag.cjs')");
    });
});
