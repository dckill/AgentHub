import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('transfer operational states boundary', () => {
    it('allows every custom modal to provide an accessible dialog name', () => {
        const types = readSource('sources/modal/types.ts');
        const customModal = readSource('sources/modal/components/CustomModal.tsx');

        expect(types).toContain('accessibilityLabel?: string;');
        expect(customModal.match(/accessibilityLabel=\{config\.accessibilityLabel\}/g)?.length).toBeGreaterThanOrEqual(2);
    });

    it('names the transfer detail and removal dialogs at the modal boundary', () => {
        const transfers = readSource('sources/app/(app)/transfers.tsx');

        expect(transfers).toContain("accessibilityLabel: t('transferManager.detailTitle')");
        expect(transfers).toContain("accessibilityLabel: t('transferManager.removeTitle')");
    });

    it('lets keyboard users toggle the remove-local-file checkbox with Space', () => {
        const transfers = readSource('sources/app/(app)/transfers.tsx');

        expect(transfers).toContain("import { getSpaceKeyActivationProps } from '@/components/keyboardActivation';");
        expect(transfers).toContain('{...getSpaceKeyActivationProps(() => setDeleteLocalFile(value => !value))}');
    });

    it('gives the visible transfer main region its own localized level-one heading', () => {
        const transfers = readSource('sources/app/(app)/transfers.tsx');

        expect(transfers).toContain('<Text role="heading" aria-level={1} style={styles.screenReaderHeading}>');
        expect(transfers).toContain('{title}');
        expect(transfers).toMatch(/screenReaderHeading:\s*\{[\s\S]{0,180}width: 1,[\s\S]{0,80}height: 1,/);
    });

    it('does not render a stray greater-than marker in the detail action group', () => {
        const transfers = readSource('sources/app/(app)/transfers.tsx');

        expect(transfers).not.toMatch(/<Pressable[\s\S]*?>\s*>\s*\{primary \?/);
    });

    it('keeps transfer detail actions at least 44 points tall', () => {
        const transfers = readSource('sources/app/(app)/transfers.tsx');

        expect(transfers).toMatch(/detailActionButton:\s*\{[\s\S]{0,120}minHeight: 44,/);
    });

    it('makes the scrollable transfer detail region keyboard focusable and named', () => {
        const transfers = readSource('sources/app/(app)/transfers.tsx');

        expect(transfers).toMatch(/<ScrollView[\s\S]{0,220}accessibilityLabel=\{t\('transferManager\.detailTitle'\)\}[\s\S]{0,120}role="region"[\s\S]{0,80}tabIndex=\{0\}/);
    });

    it('presents failed transfers as retry actions instead of resume actions', () => {
        const transfers = readSource('sources/app/(app)/transfers.tsx');
        const rowStart = transfers.indexOf('function TransferTaskRow');
        const rowEnd = transfers.indexOf('function IconButton', rowStart);
        const row = rowStart >= 0 && rowEnd > rowStart ? transfers.slice(rowStart, rowEnd) : '';

        expect(row).toContain("if (task.status === 'failed')");
        expect(row).toContain('name="refresh-outline"');
        expect(row).toContain("accessibilityLabel={t('common.retry')}");
    });
});
