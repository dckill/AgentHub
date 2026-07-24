import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(path: string): string {
    return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('external E2EE share UI boundary', () => {
    it('keeps local sharing and secure-link upload as separate explicit actions', () => {
        const textSelection = source('sources/app/(app)/text-selection.tsx');
        expect(textSelection).toContain('shareLocalContent');
        expect(textSelection).toContain('handleSecureShare');
        expect(textSelection).toContain("t('externalShares.chooseExpiry')");
        expect(textSelection).toContain('publishSelectedTextShare');
    });

    it('keeps the public decrypting route free of auth credentials and browser persistence', () => {
        const publicRoute = source('sources/app/(app)/share/[id].tsx');
        expect(publicRoute).not.toContain('useAuth');
        expect(publicRoute).not.toMatch(/localStorage|sessionStorage|AsyncStorage|SecureStore/);
        expect(publicRoute).toContain('consumeExternalShareFragment');
        expect(publicRoute).toContain("window.history.replaceState({}, '', url)");
        expect(publicRoute).toContain('decryptSelectedTextShare');
        expect(publicRoute).toContain('role="main"');
        expect(publicRoute).toContain('aria-level={1}');
        expect(publicRoute).toContain('subscribeExternalShareLinks');
        const nativeListener = source('sources/utils/externalShareLinkListener.native.ts');
        expect(nativeListener).toContain("Linking.addEventListener('url'");
        expect(nativeListener).toContain('subscription.remove()');
    });

    it('provides owner list and revoke management without exposing ciphertext or keys', () => {
        const management = source('sources/-external-share/SharedLinksView.tsx');
        expect(management).toContain('listExternalShares');
        expect(management).toContain('revokeExternalShare');
        expect(management).not.toMatch(/ciphertext|\.key\b/);
        expect(source('sources/-external-share/SharedLinksRoute.web.tsx'))
            .toContain("import('./SharedLinksView')");
        expect(source('sources/-external-share/SharedLinksRoute.web.tsx'))
            .toContain("accessibilityLabel={t('common.loading')}");
    });
});
