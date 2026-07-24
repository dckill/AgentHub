import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve(import.meta.dirname, '..');

describe('server switch account boundary', () => {
    it('routes both save and reset through authenticated account teardown', () => {
        const source = fs.readFileSync(path.join(appRoot, 'app/(app)/server.tsx'), 'utf8');

        expect(source).not.toContain('setServerUrl(');
        expect(source).toContain('await auth.switchServer(inputUrl)');
        expect(source).toContain('await auth.switchServer(null)');
        expect(source).toContain("setError(t('errors.operationFailed'))");
    });

    it('does not expose the low-level endpoint writer outside the auth boundary or dev tooling', () => {
        const files = [
            'auth/AuthContext.tsx',
            'app/(app)/server.tsx',
        ];
        const occurrences = files.flatMap((file) => {
            const source = fs.readFileSync(path.join(appRoot, file), 'utf8');
            return source.match(/setServerUrl\(/g) ?? [];
        });

        expect(occurrences).toHaveLength(1);
    });

    it('lets localized server actions wrap instead of truncating at phone width', () => {
        const source = fs.readFileSync(path.join(appRoot, 'app/(app)/server.tsx'), 'utf8');

        expect(source).toMatch(/buttonRow:\s*\{[\s\S]{0,140}flexWrap: 'wrap',/);
        expect(source).toMatch(/buttonWrapper:\s*\{[\s\S]{0,120}flexBasis: 160,/);
        expect(source).toMatch(/textInput:\s*\{[\s\S]{0,180}minHeight: 44,/);
        expect(source).toMatch(/<KeyboardAvoidingView[\s\S]{0,180}role="main"/);
    });

    it('keeps the full-screen path picker visible, named, and physically operable', () => {
        const source = fs.readFileSync(path.join(appRoot, 'components/PathPickerContent.tsx'), 'utf8');

        expect(source).toMatch(/titleRow:\s*\{[\s\S]{0,160}flexWrap: 'wrap'/);
        expect(source).toMatch(/titleActions:\s*\{[\s\S]{0,160}flexWrap: 'wrap'/);
        expect(source).toMatch(/modeButton:\s*\{[\s\S]{0,100}width: 44,[\s\S]{0,60}height: 44,/);
        expect(source).toMatch(/doneButtonPressable:\s*\{[\s\S]{0,100}minHeight: 44,/);
        expect(source).toMatch(/cancelButton:\s*\{[\s\S]{0,100}minHeight: 44,/);
        expect(source).toContain('const compactHeader = viewportWidth < 480;');
        expect(source.match(/compactHeader && \{ width: '100%'/g)).toHaveLength(2);
        expect(source).toContain("accessibilityLabel={t('newSession.browseFolders')}");
        expect(source).toContain("accessibilityLabel={t('newSession.switchToTextInput')}");
        expect(source).toMatch(/offlineManualButton:\s*\{[\s\S]{0,120}minHeight: 44,/);
        expect(source).toMatch(/<Pressable[\s\S]{0,180}style=\{pickerStyles\.offlineManualButton\}[\s\S]{0,180}accessibilityRole="button"/);
        expect(source).toContain("color: theme.colors.textLink");

        const route = fs.readFileSync(path.join(appRoot, 'app/(app)/new/path.tsx'), 'utf8');
        expect(route).toMatch(/<View role="main" style=\{\{ flex: 1,/);
    });
});
