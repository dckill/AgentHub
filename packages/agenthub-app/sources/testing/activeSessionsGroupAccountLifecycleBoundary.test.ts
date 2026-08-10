import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, '..', 'components', 'ActiveSessionsGroupCompact.tsx'), 'utf8');

function sectionBetween(start: string, end: string): string {
    const startIndex = source.indexOf(start);
    const endIndex = source.indexOf(end, startIndex + start.length);
    return source.slice(startIndex, endIndex === -1 ? undefined : endIndex);
}

describe('active sessions group account lifecycle boundary', () => {
    it('captures generation before project confirmation actions', () => {
        const endProject = sectionBetween(
            'const [endingProjectSessions, performEndProjectSessions]',
            'const [hidingProject, performHideProject]',
        );
        const hideProject = sectionBetween(
            'const [hidingProject, performHideProject]',
            'const handleResetCustomization',
        );
        const ignoreOfficial = sectionBetween(
            'const [ignoringOfficial, performIgnoreOfficial]',
            'const handlePress',
        );

        for (const section of [endProject, hideProject, ignoreOfficial]) {
            expect(section).toContain('const generation = sync.getAccountGeneration();');
            expect(section).toContain('const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;');
            expect(section).toContain('if (!confirmed || !isCurrent())');
        }
    });

    it('does not save project customization from an editor opened by an old account', () => {
        expect(source).toContain('const editGenerationRef = React.useRef<number | null>(null);');
        expect(source).toContain('editGenerationRef.current = sync.getAccountGeneration();');
        expect(source).toContain('const editGeneration = editGenerationRef.current;');
        expect(source).toContain('if (editGeneration === null || sync.getAccountGeneration() !== editGeneration)');
    });
});
