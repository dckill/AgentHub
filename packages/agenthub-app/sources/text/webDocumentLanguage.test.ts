import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { applyWebDocumentLanguage } from './webDocumentLanguage';

describe('applyWebDocumentLanguage', () => {
    it('updates the root document language with the active BCP-47 locale', () => {
        const setAttribute = vi.fn();

        applyWebDocumentLanguage('zh-Hans', {
            documentElement: { setAttribute },
        });

        expect(setAttribute).toHaveBeenCalledWith('lang', 'zh-Hans');
    });

    it('is a no-op when no browser document exists', () => {
        expect(() => applyWebDocumentLanguage('ja', undefined)).not.toThrow();
    });

    it('keeps the runtime document language synchronized with locale resolution and fallback', () => {
        const runtimeSource = fs.readFileSync(path.join(process.cwd(), 'sources/text/index.ts'), 'utf8');

        expect(runtimeSource).toContain("import { applyWebDocumentLanguage } from './webDocumentLanguage';");
        expect(runtimeSource.match(/applyWebDocumentLanguage\(currentLanguage\)/g)).toHaveLength(2);
    });
});
