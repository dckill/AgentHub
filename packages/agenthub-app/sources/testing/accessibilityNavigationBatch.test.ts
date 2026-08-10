import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => fs.readFileSync(path.resolve(__dirname, '../components', file), 'utf8');

describe('accessibility navigation batch', () => {
    it('names command palette selection state', () => {
        const content = source('CommandPalette/CommandPaletteItem.tsx');
        expect(content).toContain('accessibilityRole="button"');
        expect(content).toContain('accessibilityLabel={command.title}');
        expect(content).toContain('accessibilityState={{ selected: isSelected }}');
    });

    it('keeps keyboard-dismiss background out of the accessibility tree', () => {
        const content = source('PlaceholderContainerView.tsx');
        expect(content).toContain('accessible={false}');
    });

    it('names file selection, navigation, search, and confirmation controls', () => {
        const content = source('FileReferencePicker.tsx');
        expect(content).toContain('accessibilityRole="button"');
        expect(content).toContain('accessibilityLabel={item.fullPath}');
        expect(content).toContain("accessibilityLabel={t('common.back')}");
        expect(content).toContain("accessibilityLabel={t('common.close')}");
        expect(content).toContain("accessibilityLabel={t('fileReferencePicker.selectedCount', { count: localSelected.size })}");
        expect(content).toContain("accessibilityLabel={t('fileReferencePicker.searchPlaceholder')}");
        expect(content).toContain("accessibilityLabel={t('common.home')}");
    });
});
