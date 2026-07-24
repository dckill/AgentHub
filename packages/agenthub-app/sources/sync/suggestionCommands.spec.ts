import { describe, expect, it, vi } from 'vitest';
import type { Session } from './storageTypes';

const mockSessions: Record<string, Partial<Session>> = {};

vi.mock('./storage', () => ({
    storage: {
        getState: () => ({ sessions: mockSessions }),
    },
}));

vi.mock('@/text', () => ({
    getCurrentLanguage: () => 'en',
    t: vi.fn((key: string) => ({
        'slashCommands.compact': 'Compact the conversation history',
        'slashCommands.clear': 'Clear the conversation',
        'slashCommands.goal': 'Set a session goal',
        'slashCommands.mcp': 'Show connected MCP servers',
        'slashCommands.skills': 'Show available skills',
    }[key] ?? key)),
}));

import { t } from '@/text';
import { getAllCommands } from './suggestionCommands';

describe('suggestionCommands', () => {
    it('includes /goal in the default slash command suggestions', () => {
        const commands = getAllCommands('missing-session');

        expect(commands).toEqual(expect.arrayContaining([
            expect.objectContaining({
                command: 'goal',
                description: 'Set a session goal',
            }),
        ]));
    });

    it('includes skills from session metadata in slash command suggestions', () => {
        mockSessions['codex-session'] = {
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                skills: ['plan-to-beads', 'superpowers:brainstorming'],
            },
        } as Partial<Session>;

        const commands = getAllCommands('codex-session');

        expect(commands).toEqual(expect.arrayContaining([
            expect.objectContaining({ command: 'skill:plan-to-beads', label: 'plan-to-beads' }),
            expect.objectContaining({ command: 'skill:superpowers:brainstorming', label: 'superpowers:brainstorming' }),
        ]));
    });

    it('uses the generic description without probing a dynamic translation key', () => {
        mockSessions['dynamic-session'] = {
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                slashCommands: ['plugin-command'],
            },
        } as Partial<Session>;
        vi.mocked(t).mockClear();

        const commands = getAllCommands('dynamic-session');

        expect(commands).toEqual(expect.arrayContaining([
            expect.objectContaining({ command: 'plugin-command' }),
        ]));
        expect(t).not.toHaveBeenCalledWith('slashCommands.plugin-command');
    });
});
