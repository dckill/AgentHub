import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => fs.readFileSync(path.resolve(__dirname, '../app/(app)', file), 'utf8');
const componentSource = (file: string) => fs.readFileSync(path.resolve(__dirname, '../components', file), 'utf8');

describe('session history and artifacts accessibility boundary', () => {
    it('names session history cards as navigable buttons', () => {
        const content = source('session/recent.tsx');
        expect(content).toContain('accessibilityRole="button"');
        expect(content).toContain('accessibilityLabel={sessionName}');
    });

    it('names artifact rows and uses a screen-specific create label', () => {
        const content = source('artifacts/index.tsx');
        expect(content).toContain('accessibilityRole="button"');
        expect(content).toContain("const artifactTitle = item.title || t('artifacts.untitled');");
        expect(content).toContain('accessibilityLabel={artifactTitle}');
        expect(content).toContain("<FAB accessibilityLabel={t('artifacts.new')}");
        expect(componentSource('FAB.tsx')).toContain('accessibilityLabel?: string');
        expect(componentSource('FAB.tsx')).toContain('accessibilityLabel ?? t(\'newSession.title\')');
    });
});
