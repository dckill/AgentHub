import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
    path.resolve(__dirname, '../app/(app)/dev/session-composer.tsx'),
    'utf8',
);

describe('session composer accessibility boundary', () => {
    it('names picker options and search input', () => {
        expect(source).toContain('accessibilityRole="radio"');
        expect(source).toContain('accessibilityLabel={item.label}');
        expect(source).toContain('accessibilityState={{ selected: isSelected }}');
        expect(source).toContain("accessibilityLabel={searchPlaceholder ?? 'search...'}");
    });

    it('names configuration controls and keeps the web backdrop non-interactive', () => {
        expect(source).toContain('accessibilityLabel={machineName}');
        expect(source).toContain('accessibilityLabel={pathName}');
        expect(source).toContain('accessibilityLabel={agent.label}');
        expect(source).toContain('accessibilityLabel={currentModel.name}');
        expect(source).toContain('accessibilityLabel={currentEffort?.name ?? \'\'}');
        expect(source).toContain('accessibilityLabel={currentPermission?.name ?? \'\'}');
        expect(source).toContain('accessibilityLabel={worktreeLabel}');
        expect(source).toContain('accessible={false}');
    });

    it('names the send control and exposes its disabled state', () => {
        expect(source).toContain('accessibilityRole="button"');
        expect(source).toContain('accessibilityLabel={hasText ? \'Send\' : \'Send unavailable\'}');
        expect(source).toContain('accessibilityState={{ disabled: !hasText }}');
    });
});
