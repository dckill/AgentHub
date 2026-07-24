import { describe, expect, it } from 'vitest';

import { resolveSessionDisplayTitle } from './sessionTitle';

describe('resolveSessionDisplayTitle', () => {
    it('prefers summary text over other title candidates', () => {
        expect(resolveSessionDisplayTitle({
            name: 'Existing title',
            lastUserMessage: 'latest prompt',
            summary: { text: 'Summarized title' },
        })).toBe('Summarized title');
    });

    it('uses the existing title when no summary exists', () => {
        expect(resolveSessionDisplayTitle({
            name: 'Existing title',
            lastUserMessage: 'latest prompt',
        })).toBe('Existing title');
    });

    it('uses the latest user message when no title exists', () => {
        expect(resolveSessionDisplayTitle({
            lastUserMessage: 'fix login flow',
        })).toBe('fix login flow');
    });

    it('uses the project directory name when no conversation title exists', () => {
        expect(resolveSessionDisplayTitle({
            path: '/home/user/projects/Happy-AgentRemote',
        })).toBe('Happy-AgentRemote');
    });

    it('handles trailing separators in the session path', () => {
        expect(resolveSessionDisplayTitle({
            path: '/home/user/projects/Happy-AgentRemote/',
        })).toBe('Happy-AgentRemote');
    });

    it('handles Windows session paths', () => {
        expect(resolveSessionDisplayTitle({
            path: 'C:\\Users\\me\\projects\\Happy-AgentRemote',
        })).toBe('Happy-AgentRemote');
    });
});
