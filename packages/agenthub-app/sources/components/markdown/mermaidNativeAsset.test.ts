import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../..');
const assetPath = resolve(appRoot, 'sources/assets/vendor/mermaid-11.16.0.mermaidjs');

describe('bundled Native Mermaid asset', () => {
    it('ships the exact audited Mermaid 11.16.0 browser bundle for offline rendering', () => {
        expect(existsSync(assetPath)).toBe(true);
        const digest = createHash('sha384').update(readFileSync(assetPath)).digest('base64');
        expect(digest).toBe('T/0lMUdJpd2S1ZHtRiofG3htU3xPCrFVeAQ1UUE2TJwlEJSV5NUwn30kP28n238E');
        expect(JSON.parse(readFileSync(require.resolve('mermaid/package.json'), 'utf8')).version).toBe('11.16.0');
        const installedDigest = createHash('sha384')
            .update(readFileSync(require.resolve('mermaid/dist/mermaid.min.js')))
            .digest('base64');
        expect(installedDigest).toBe(digest);
    });

    it('registers the vendored extension as a Metro asset', () => {
        const metroConfig = readFileSync(resolve(appRoot, 'metro.config.js'), 'utf8');
        expect(metroConfig).toContain("assetExts.push('mermaidjs')");
    });

    it('keeps the npm Mermaid graph out of the Web bootstrap', () => {
        const renderer = readFileSync(resolve(appRoot, 'sources/components/markdown/MermaidRenderer.tsx'), 'utf8');
        expect(renderer).not.toContain("import('mermaid')");
        expect(renderer).toContain('sandbox="allow-scripts"');
    });

    it('fetches the Web asset directly without triggering a duplicate Expo download', () => {
        const webLoader = readFileSync(resolve(appRoot, 'sources/components/markdown/mermaidNativeAsset.ts'), 'utf8');
        expect(webLoader).not.toContain('.downloadAsync(');
        expect(webLoader).toContain('const uri = asset.uri;');
    });
});
