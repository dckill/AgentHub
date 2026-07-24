import { describe, expect, it } from 'vitest';
import { getSessionRowActionMenuKind, OFFICIAL_CANDIDATE_ACTION_LABEL_KEYS } from './sessionRowActions';

describe('getSessionRowActionMenuKind', () => {
    it('routes official Codex and Claude rows to the official action menu', () => {
        expect(getSessionRowActionMenuKind({ source: 'official-codex' })).toBe('official');
        expect(getSessionRowActionMenuKind({ source: 'official-claude' })).toBe('official');
    });

    it('routes AgentHub rows to the session action popover', () => {
        expect(getSessionRowActionMenuKind({ source: 'agenthub' })).toBe('agenthub');
        expect(getSessionRowActionMenuKind({})).toBe('agenthub');
    });

    it('uses takeover and remove-from-workbench label keys for official candidate actions', () => {
        const visibleActionLabelKeys = Object.values(OFFICIAL_CANDIDATE_ACTION_LABEL_KEYS);

        expect(visibleActionLabelKeys).not.toContain('official-codex');
        expect(visibleActionLabelKeys).not.toContain('official-claude');
        expect(visibleActionLabelKeys).not.toContain('mirror');
        expect(visibleActionLabelKeys).not.toContain('project.ignoreOfficialThread');
        expect(visibleActionLabelKeys).toContain('project.takeOverComputerSession');
        expect(visibleActionLabelKeys).toContain('project.hideComputerSession');
    });
});
