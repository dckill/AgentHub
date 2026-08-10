import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => fs.readFileSync(path.resolve(__dirname, '../components', file), 'utf8');

describe('accessibility sidebar batch', () => {
    it('names the permission mode cycle and disabled state', () => {
        const content = source('PermissionModeSelector.tsx');
        expect(content).toContain('accessibilityRole="button"');
        expect(content).toContain('accessibilityLabel={hackedMode.name}');
        expect(content).toContain('accessibilityState={{ disabled }}');
    });

    it('names file sidebar search and tree state', () => {
        const content = source('FilesSidebar.tsx');
        expect(content).toContain("accessibilityLabel={t('files.searchPlaceholder')}");
        expect(content).toContain("accessibilityLabel={t('files.changes')}");
        expect(content).toContain('accessibilityLabel={node.name}');
        expect(content).toContain('accessibilityState={{ expanded: !isCollapsed }}');
        expect(content).toContain('accessibilityState={{ selected: isSelected, disabled: isDeleted }}');
    });
});
