import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const appSources = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(appSources, relativePath), 'utf8');

describe('artifact CRUD accessibility and localization boundary', () => {
    const newRoute = 'app/(app)/artifacts/new.tsx';
    const editRoute = 'app/(app)/artifacts/edit/[id].tsx';
    const detailRoute = 'app/(app)/artifacts/[id].tsx';

    it('gives create and edit routes one main landmark and level-one heading', () => {
        for (const file of [newRoute, editRoute]) {
            const source = read(file);
            expect(source, file).toContain('role="main"');
            expect(source, file).toContain('role="heading"');
            expect(source, file).toContain('aria-level={1}');
        }
    });

    it('names create and edit controls and preserves 44-point targets', () => {
        for (const file of [newRoute, editRoute]) {
            const source = read(file);
            const inputs = source.match(/<TextInput[\s\S]*?\/>/g) ?? [];

            expect(source, file).toMatch(/headerButton:\s*\{[\s\S]{0,180}minHeight: 44,/);
            expect(source, file).toMatch(/<Pressable[\s\S]{0,220}accessibilityRole="button"/);
            expect(source, file).toMatch(/<Pressable[\s\S]{0,260}accessibilityLabel=\{t\('common\.save'\)\}/);
            expect(inputs, file).toHaveLength(2);
            for (const input of inputs) {
                expect(input, `${file} contains an unnamed field`).toContain('accessibilityLabel=');
            }
        }
    });

    it('names detail actions, keeps them 44-point, and exposes content as the page heading', () => {
        const source = read(detailRoute);

        expect(source).toContain('role="main"');
        expect(source).toContain('role="heading"');
        expect(source).toContain('aria-level={1}');
        expect(source).toMatch(/headerAction:\s*\{[\s\S]{0,180}minWidth: 44,[\s\S]{0,80}minHeight: 44,/);
        expect(source).toContain("accessibilityLabel={t('artifacts.edit')}");
        expect(source).toContain("accessibilityLabel={t('artifacts.delete')}");
        expect(source).toContain('accessibilityRole="button"');
    });

    it('keeps artifact runtime copy and locale-aware dates inside the typed text boundary', () => {
        const source = read(detailRoute);

        expect(source).not.toContain("|| 'Untitled'");
        expect(source).not.toContain('No content');
        expect(source).not.toContain("'Failed to delete artifact'");
        expect(source).toContain("t('artifacts.untitled')");
        expect(source).toContain("t('artifacts.noContent')");
        expect(source).toContain("t('artifacts.deleteError')");
        expect(source).toContain('getCurrentLanguage()');
    });

    it('names alert and prompt dialogs without overriding secondary button contrast', () => {
        const base = read('modal/components/BaseModal.tsx');
        const alert = read('modal/components/WebAlertModal.tsx');
        const prompt = read('modal/components/WebPromptModal.tsx');
        const glassButton = read('components/glass/GlassButton.tsx');
        const glassStyles = read('components/glass/glassStyles.ts');

        expect(base).toContain('accessibilityLabel?: string;');
        expect(base).toMatch(/<Modal[\s\S]{0,240}accessibilityLabel=\{accessibilityLabel\}/);
        expect(alert).toContain('accessibilityLabel={config.title}');
        expect(prompt).toContain('accessibilityLabel={config.title}');
        expect(alert).not.toContain("config.cancelText || 'Cancel'");
        expect(alert).not.toContain("config.confirmText || 'OK'");
        expect(alert).not.toContain("button.style === 'cancel' ? Typography.default()");
        expect(prompt).not.toContain("config.cancelText || 'Cancel'");
        expect(prompt).not.toContain("config.confirmText || 'OK'");
        expect(prompt).not.toContain('textStyle={Typography.default()}');
        expect(glassButton).toMatch(/button:\s*\{[\s\S]{0,100}minHeight: 44,/);
        expect(glassStyles).toMatch(/case 'secondary':[\s\S]{0,240}textColor: theme\.colors\.text,/);
    });
});
