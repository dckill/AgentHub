import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(currentDir, 'SessionsList.tsx'), 'utf8');
const activeSessionsGroupSource = readFileSync(join(currentDir, 'ActiveSessionsGroupCompact.tsx'), 'utf8');

describe('SessionsList gesture behavior', () => {
    it('does not attach pull-to-refresh to the outer session list', () => {
        expect(source).not.toContain('RefreshControl');
        expect(source).not.toContain('refreshControl=');
    });

    it('keeps the computer-session submenu independently scrollable', () => {
        expect(activeSessionsGroupSource).toContain('nestedScrollEnabled');
        expect(activeSessionsGroupSource).toContain('officialCandidatesScroll');
    });
});
