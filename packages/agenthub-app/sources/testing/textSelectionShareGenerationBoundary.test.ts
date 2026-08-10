import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
    path.resolve(__dirname, '..', 'app/(app)/text-selection.tsx'),
    'utf8',
);

describe('text selection secure share account boundary', () => {
    it('drops a secure-share result after the account changes', () => {
        expect(source).toContain("import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';");
        expect(source).toContain('const generation = sync.getAccountGeneration();');
        expect(source).toContain('const isCurrent = () => generation !== null');
        expect(source).toContain('request: () => publishSelectedTextShare');
        expect(source).toContain('if (result === null || !isCurrent()) return;');
    });
});
