import { describe, expect, it } from 'vitest';

import { buildCommandsForSessionMetadata } from './suggestionCommandRules';

describe('suggestionCommands', () => {
    it('uses Codex-focused commands and filters commands that are not useful in mobile chat', () => {
        const commands = buildCommandsForSessionMetadata({
            flavor: 'codex',
            slashCommands: ['compact', 'init', 'model', 'permissions', 'diff', 'review'],
        }).map((item) => item.command);

        expect(commands.slice(0, 3)).toEqual(['compact', 'clear', 'goal']);
        expect(commands).not.toContain('init');
        expect(commands).not.toContain('model');
        expect(commands).not.toContain('permissions');
    });

    it('turns available skills into insertable templates instead of a dead generic skills command', () => {
        const commands = buildCommandsForSessionMetadata({
            flavor: 'claude',
            slashCommands: ['compact', 'clear', 'mcp', 'skills'],
            skills: ['frontend-design', 'test-driven-development'],
        });

        expect(commands.find((item) => item.command === 'skills')).toBeUndefined();
        expect(commands).toContainEqual(expect.objectContaining({
            command: 'skill:frontend-design',
            insertText: 'Use the frontend-design skill: ',
        }));
        expect(commands).toContainEqual(expect.objectContaining({
            command: 'skill:test-driven-development',
            insertText: 'Use the test-driven-development skill: ',
        }));
    });

    it('accepts a locale-owned skill insertion template', () => {
        const commands = buildCommandsForSessionMetadata({
            flavor: 'codex',
            skills: ['frontend-design'],
        }, {}, undefined, {
            getSkillInsertText: (skill) => `localized:${skill}`,
        });

        expect(commands).toContainEqual(expect.objectContaining({
            command: 'skill:frontend-design',
            insertText: 'localized:frontend-design',
        }));
    });

    it('can hide compact when the composer exposes a dedicated context control', () => {
        const commands = buildCommandsForSessionMetadata({
            flavor: 'codex',
            slashCommands: ['compact', 'clear'],
            skills: ['frontend-design'],
        }, {}, undefined, { hideCompact: true }).map((item) => item.command);

        expect(commands).not.toContain('compact');
        expect(commands).toContain('clear');
        expect(commands).toContain('skill:frontend-design');
    });
});
