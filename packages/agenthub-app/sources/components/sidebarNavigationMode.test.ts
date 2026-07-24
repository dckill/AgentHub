import { describe, expect, it } from 'vitest';
import { getSidebarNavigationMode } from './sidebarNavigationMode';

describe('getSidebarNavigationMode', () => {
    it('keeps the native drawer navigator state shape stable across authentication changes', () => {
        expect(getSidebarNavigationMode(false, 'android')).toBe('drawer');
        expect(getSidebarNavigationMode(true, 'android')).toBe('drawer');
        expect(getSidebarNavigationMode(false, 'ios')).toBe('drawer');
        expect(getSidebarNavigationMode(true, 'ios')).toBe('drawer');
    });

    it('does not construct the drawer tree before Web authentication', () => {
        expect(getSidebarNavigationMode(false, 'web')).toBe('slot');
        expect(getSidebarNavigationMode(true, 'web')).toBe('drawer');
    });
});
