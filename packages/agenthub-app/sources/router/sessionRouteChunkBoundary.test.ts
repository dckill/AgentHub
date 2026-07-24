import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourcesRoot = resolve(__dirname, '..');

describe('session route chunk boundary', () => {
    it('loads the full session workspace asynchronously on Web only', () => {
        const nativeAdapter = readFileSync(resolve(sourcesRoot, '-session/SessionViewRoute.tsx'), 'utf8');
        const webAdapter = readFileSync(resolve(sourcesRoot, '-session/SessionViewRoute.web.tsx'), 'utf8');
        const route = readFileSync(resolve(sourcesRoot, 'app/(app)/session/[id].tsx'), 'utf8');

        expect(nativeAdapter).toContain("from './SessionView'");
        expect(nativeAdapter).not.toContain('import(');
        expect(webAdapter).toContain("import('./SessionView')");
        expect(webAdapter).toContain('React.lazy');
        expect(webAdapter).toContain('React.Suspense');
        expect(webAdapter).toContain("accessibilityRole=\"progressbar\"");
        expect(webAdapter).toContain("t('common.loading')");
        expect(route).toContain("from '@/-session/SessionViewRoute'");
        expect(route).not.toContain("from '@/-session/SessionView'");
    });
});
