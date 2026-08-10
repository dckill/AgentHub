import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(appRoot, relativePath), 'utf8');

describe('accessibility scan revalidation boundary', () => {
    it('recognizes intentional non-accessible dismiss layers as covered', () => {
        expect(read('components/PlaceholderContainerView.tsx')).toContain('accessible={false}');
        expect(read('app/(app)/dev/session-composer.tsx')).toContain('accessible={false}');
    });

    it('recognizes MessageView interaction props passed through a shared spread', () => {
        const source = read('components/MessageView.tsx');
        expect(source).toContain('const duplicateInteractionProps = {');
        expect(source).toContain("accessibilityRole: 'button' as const");
        expect(source).toContain('{...duplicateInteractionProps}');
    });

    it('keeps the accessibility candidate list empty after semantic revalidation', () => {
        const evidence = fs.readFileSync(
            path.resolve(appRoot, '../../../docs/audits/evidence/2026-07-28/scan-usability.txt'),
            'utf8',
        );
        const candidateSection = evidence.split('### 可交互元素缺无障碍标注的文件')[1]?.split('### 复核排除')[0] ?? '';
        expect(candidateSection).toContain('无（开发者 `input-styles.tsx` 的静态视觉预览已改为非交互 `View`；样式选择列表保留真实 Pressable）');
        expect(candidateSection).not.toContain('packages/agenthub-app/sources/app/(app)/dev/input-styles.tsx');
        expect(candidateSection).not.toContain('packages/agenthub-app/sources/components/MessageView.tsx');
        expect(candidateSection).not.toContain('packages/agenthub-app/sources/components/PlaceholderContainerView.tsx');
    });
});
