import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../..');
const rootLayout = readFileSync(resolve(appRoot, 'sources/app/_layout.tsx'), 'utf8');

describe('root font asset boundary', () => {
    it('blocks startup only on the three fonts used by production typography', () => {
        expect(rootLayout).toContain("require('@/assets/fonts/IBMPlexSans-Regular.ttf')");
        expect(rootLayout).toContain("require('@/assets/fonts/IBMPlexSans-SemiBold.ttf')");
        expect(rootLayout).toContain("require('@/assets/fonts/IBMPlexMono-Regular.ttf')");

        expect(rootLayout).not.toContain("require('@/assets/fonts/SpaceMono-Regular.ttf')");
        expect(rootLayout).not.toContain("require('@/assets/fonts/IBMPlexSans-Italic.ttf')");
        expect(rootLayout).not.toContain("require('@/assets/fonts/IBMPlexMono-Italic.ttf')");
        expect(rootLayout).not.toContain("require('@/assets/fonts/IBMPlexMono-SemiBold.ttf')");
        expect(rootLayout).not.toContain("require('@/assets/fonts/BricolageGrotesque-Bold.ttf')");
    });

    it('lets vector icon components load their own font only when rendered', () => {
        expect(rootLayout).not.toContain("import FontAwesome from '@expo/vector-icons/FontAwesome'");
        expect(rootLayout).not.toContain('...FontAwesome.font');
    });
});
