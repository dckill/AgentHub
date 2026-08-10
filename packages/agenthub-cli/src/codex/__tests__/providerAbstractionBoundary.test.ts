import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const codexDir = path.resolve(__dirname, '..');
const utilsDir = path.resolve(codexDir, '..', '..', 'utils');

function read(relativePath: string): string {
    return fs.readFileSync(path.resolve(codexDir, relativePath), 'utf8');
}

describe('Codex provider abstraction boundary', () => {
    it('keeps permission and reasoning behavior in concrete Codex handlers', () => {
        const permission = read('utils/permissionHandler.ts');
        const reasoning = read('utils/reasoningProcessor.ts');

        expect(permission).not.toContain('extends BasePermissionHandler');
        expect(permission).not.toContain("@/utils/BasePermissionHandler");
        expect(permission).toContain('protected setupRpcHandler(): void');
        expect(permission).toContain('protected addPendingRequestToState');
        expect(permission).toContain('abortAll(): void');
        expect(permission).toContain('reset(reason: string = \'Session reset\'): void');

        expect(reasoning).not.toContain('extends BaseReasoningProcessor');
        expect(reasoning).not.toContain("@/utils/BaseReasoningProcessor");
        expect(reasoning).toContain('protected processInput(input: string): void');
        expect(reasoning).toContain('protected completeReasoning(fullText?: string): boolean');
        expect(reasoning).toContain('finishCurrentToolCall(status: \'completed\' | \'canceled\'): void');

        expect(fs.existsSync(path.join(utilsDir, 'BasePermissionHandler.ts'))).toBe(false);
        expect(fs.existsSync(path.join(utilsDir, 'BaseReasoningProcessor.ts'))).toBe(false);
    });
});
