import { describe, expect, it } from 'vitest';
import {
    restoreProjectCustomizationForExplicitSession,
    shouldRenderProjectSessionCard,
} from './projectVisibility';

describe('project visibility', () => {
    it('does not render an empty session card before or after an empty desktop discovery', () => {
        expect(shouldRenderProjectSessionCard(0, 0)).toBe(false);
        expect(shouldRenderProjectSessionCard(1, 0)).toBe(true);
        expect(shouldRenderProjectSessionCard(0, 1)).toBe(true);
    });

    it('restores a hidden project only for an explicit new session', () => {
        const customizations = {
            'machine-1:/repo': { name: 'Repo', icon: 'code', archived: true },
            'machine-1:/other': { archived: true },
        };

        expect(restoreProjectCustomizationForExplicitSession(
            customizations,
            'machine-1:/repo',
        )).toEqual({
            'machine-1:/repo': { name: 'Repo', icon: 'code' },
            'machine-1:/other': { archived: true },
        });
        expect(restoreProjectCustomizationForExplicitSession(
            customizations,
            'machine-1:/missing',
        )).toBe(customizations);
    });
});
