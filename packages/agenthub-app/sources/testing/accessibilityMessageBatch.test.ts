import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => fs.readFileSync(path.resolve(__dirname, '../components', file), 'utf8');

describe('accessibility message batch', () => {
    it('names the chat return-to-bottom action', () => {
        const content = source('ChatList.tsx');
        expect(content).toContain('accessibilityRole="button"');
        expect(content).toContain('accessibilityLabel="Scroll to bottom"');
    });

    it('exposes autocomplete candidates as selectable buttons', () => {
        const content = source('AgentInputAutocomplete.tsx');
        expect(content).toContain('accessibilityRole="button"');
        expect(content).toContain('accessibilityState={{ selected: selectedIndex === index }}');
    });

    it('labels duplicateable user messages with their content', () => {
        const content = source('MessageView.tsx');
        expect(content).toContain("accessibilityRole: 'button'");
        expect(content).toContain('accessibilityLabel: text');
    });
});
