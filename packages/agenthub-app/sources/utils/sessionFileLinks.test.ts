import { describe, expect, it } from 'vitest';
import {
    decodeSessionFileRoutePath,
    encodeSessionFileRoutePath,
    parseSessionFileLink,
    resolveSessionFilePath,
    splitSessionFileText,
} from './sessionFileLinks';

describe('sessionFileLinks', () => {
    const sessionRoot = '/Users/kirilldubovitskiy/projects/agenthub';

    it('parses absolute file refs with line numbers', () => {
        const result = parseSessionFileLink('/Users/kirilldubovitskiy/projects/agenthub/packages/agenthub-cli/src/codex/runCodex.ts:594', {
            sessionRoot,
        });

        expect(result).toEqual({
            path: '/Users/kirilldubovitskiy/projects/agenthub/packages/agenthub-cli/src/codex/runCodex.ts',
            absolutePath: '/Users/kirilldubovitskiy/projects/agenthub/packages/agenthub-cli/src/codex/runCodex.ts',
            relativePath: 'packages/agenthub-cli/src/codex/runCodex.ts',
            withinSessionRoot: true,
            line: 594,
            column: null,
        });
    });

    it('parses relative file refs with line and column numbers', () => {
        const result = parseSessionFileLink('packages/agenthub-cli/src/codex/runCodex.ts:594:2', {
            sessionRoot,
        });

        expect(result).toEqual({
            path: 'packages/agenthub-cli/src/codex/runCodex.ts',
            absolutePath: '/Users/kirilldubovitskiy/projects/agenthub/packages/agenthub-cli/src/codex/runCodex.ts',
            relativePath: 'packages/agenthub-cli/src/codex/runCodex.ts',
            withinSessionRoot: true,
            line: 594,
            column: 2,
        });
    });

    it('rejects external urls', () => {
        expect(parseSessionFileLink('https://openai.com', { sessionRoot })).toBeNull();
        expect(parseSessionFileLink('mailto:test@example.com', { sessionRoot })).toBeNull();
    });

    it('splits bare text into plain and linked segments', () => {
        const result = splitSessionFileText('Open packages/agenthub-cli/src/codex/runCodex.ts:594 please.', sessionRoot);

        expect(result).toEqual([
            { text: 'Open ', link: null },
            {
                text: 'packages/agenthub-cli/src/codex/runCodex.ts:594',
                link: {
                    path: 'packages/agenthub-cli/src/codex/runCodex.ts',
                    absolutePath: '/Users/kirilldubovitskiy/projects/agenthub/packages/agenthub-cli/src/codex/runCodex.ts',
                    relativePath: 'packages/agenthub-cli/src/codex/runCodex.ts',
                    withinSessionRoot: true,
                    line: 594,
                    column: null,
                },
            },
            { text: ' please.', link: null },
        ]);
    });

    it('splits absolute bare file refs with spaces into linked segments', () => {
        const result = splitSessionFileText(
            'Image: /Users/kirilldubovitskiy/Library/Application Support/CleanShot/media/test/CleanShot 2026-03-19 at 00.54.37@2x.png',
            sessionRoot,
        );

        expect(result).toEqual([
            { text: 'Image: ', link: null },
            {
                text: '/Users/kirilldubovitskiy/Library/Application Support/CleanShot/media/test/CleanShot 2026-03-19 at 00.54.37@2x.png',
                link: {
                    path: '/Users/kirilldubovitskiy/Library/Application Support/CleanShot/media/test/CleanShot 2026-03-19 at 00.54.37@2x.png',
                    absolutePath: '/Users/kirilldubovitskiy/Library/Application Support/CleanShot/media/test/CleanShot 2026-03-19 at 00.54.37@2x.png',
                    relativePath: null,
                    withinSessionRoot: false,
                    line: null,
                    column: null,
                },
            },
        ]);
    });

    it('does not turn version numbers into file refs', () => {
        expect(splitSessionFileText('Version 1.2.3 shipped.', sessionRoot)).toEqual([
            { text: 'Version 1.2.3 shipped.', link: null },
        ]);
    });

    it('does not turn slash-separated prose into file refs', () => {
        expect(splitSessionFileText(
            'Codex then starts/resumes turns with backend default model. I’m checking CLI docs/tests to confirm there is intentionally no agenthub codex model set or --model surface today.',
            sessionRoot,
        )).toEqual([
            {
                text: 'Codex then starts/resumes turns with backend default model. I’m checking CLI docs/tests to confirm there is intentionally no agenthub codex model set or --model surface today.',
                link: null,
            },
        ]);
    });

    it('resolves viewer input to an absolute path', () => {
        expect(resolveSessionFilePath('packages/agenthub-app/README.md', sessionRoot)).toEqual({
            path: 'packages/agenthub-app/README.md',
            absolutePath: '/Users/kirilldubovitskiy/projects/agenthub/packages/agenthub-app/README.md',
            relativePath: 'packages/agenthub-app/README.md',
            withinSessionRoot: true,
            line: null,
            column: null,
        });
    });

    it('encodes file viewer route params without URL query corruption', () => {
        const path = '2F>b,9]S$gZS';
        const unsafeBase64 = btoa(path);
        const corrupted = new URL(`https://agenthub.test/session/s1/file?path=${unsafeBase64}`).searchParams.get('path');
        const encoded = encodeSessionFileRoutePath(path);
        const parsed = new URL(`https://agenthub.test/session/s1/file?path=${encoded}`).searchParams.get('path');

        expect(unsafeBase64).toContain('+');
        expect(corrupted).not.toBe(unsafeBase64);
        expect(encoded).not.toContain('+');
        expect(decodeSessionFileRoutePath(parsed ?? '')).toBe(path);
    });
});
