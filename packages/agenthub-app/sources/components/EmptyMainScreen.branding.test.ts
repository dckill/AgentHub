import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('EmptyMainScreen AgentHub onboarding copy', () => {
    it('shows AgentHub CLI commands in the empty session helper', () => {
        const source = readFileSync(resolve(__dirname, 'EmptyMainScreen.tsx'), 'utf8');
        const legacyCommand = ['ha', 'ppy'].join('');

        expect(source).toContain('$ npm i -g @artsum/agenthub');
        expect(source).toContain('$ agenthub');
        expect(source).not.toContain(`$ npm i -g @dckill/${legacyCommand}`);
        expect(source.indexOf('$ npm i -g @artsum/agenthub')).toBeLessThan(source.indexOf('$ agenthub'));
        expect(source).not.toMatch(new RegExp(String.raw`\$\s+${legacyCommand}\s*$`, 'm'));
    });
});
