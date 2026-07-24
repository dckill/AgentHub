import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../..');

describe('production diff bundle boundary', () => {
    it('does not preload the unused Pierre/Shiki renderer from the session shell', () => {
        const sessionView = readFileSync(resolve(appRoot, 'sources/-session/SessionView.tsx'), 'utf8');
        const diffView = readFileSync(resolve(appRoot, 'sources/components/diff/PierreDiffView.tsx'), 'utf8');
        const manifest = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8')) as {
            dependencies?: Record<string, string>;
        };

        expect(sessionView).not.toContain('prefetchPierreDiff');
        expect(diffView).not.toContain("import('@pierre/diffs')");
        expect(diffView).not.toContain("import('@pierre/diffs/react')");
        expect(manifest.dependencies?.['@pierre/diffs']).toBeUndefined();
    });
});
