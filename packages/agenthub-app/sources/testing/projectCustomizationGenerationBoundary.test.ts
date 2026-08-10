import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('project customization generation boundary', () => {
    it('guards reset customization confirmation and write by account generation', () => {
        const source = fs.readFileSync(
            path.resolve(__dirname, '..', 'components/ActiveSessionsGroupCompact.tsx'),
            'utf8',
        );

        expect(source).toContain('const generation = sync.getAccountGeneration();');
        expect(source).toContain('const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;');
        expect(source).toContain('if (!isCurrent()) {');
        expect(source).toContain('if (!confirmed || !isCurrent())');
    });
});
