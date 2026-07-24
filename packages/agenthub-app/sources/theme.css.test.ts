import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const themeCss = readFileSync(resolve(__dirname, 'theme.css'), 'utf8');

describe('AgentHub web chrome CSS', () => {
    it('defines full Amber Crystal CSS variables for web and Tauri chrome', () => {
        expect(themeCss).toContain('--ah-color-accent-soft');
        expect(themeCss).toContain('--ah-color-accent-glow');
        expect(themeCss).toContain('--ah-color-focus-ring');
        expect(themeCss).toContain('--ah-color-scrollbar-thumb');
        expect(themeCss).toContain('--ah-glass-blur');
        expect(themeCss).toContain('--ah-web-window-border');
    });

    it('styles focus, selection, hover, scrollbar, and Tauri drag regions', () => {
        expect(themeCss).toContain(':where(a, button, [role="button"], input, textarea, select, [tabindex]):focus-visible');
        expect(themeCss).toContain('::selection');
        expect(themeCss).toContain('@media (hover: hover)');
        expect(themeCss).toContain('[data-tauri-drag-region="true"]');
        expect(themeCss).toContain('scrollbar-color: var(--ah-color-scrollbar-thumb) transparent');
    });

    it('respects reduced motion for web hover and focus transitions', () => {
        expect(themeCss).toContain('@media (prefers-reduced-motion: reduce)');
        expect(themeCss).toContain('transition-duration: 0.01ms');
    });
});
