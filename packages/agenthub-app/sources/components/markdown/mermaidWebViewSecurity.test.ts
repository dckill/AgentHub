import { describe, expect, it } from 'vitest';
import {
    buildMermaidWebViewHtml,
    parseMermaidWebFrameMessage,
    parseMermaidWebViewMessage,
    removeMermaidTemporaryContainer,
    shouldAllowMermaidNavigation,
} from './mermaidWebViewSecurity';

describe('Mermaid WebView security boundary', () => {
    it('keeps closing script tags and Unicode separators inside the diagram string', () => {
        const attack = '</script><script>globalThis.pwned=true</script>\u2028alert(1)';
        const html = buildMermaidWebViewHtml({
            content: attack,
            backgroundColor: '#111111',
            bridgeToken: 'bridge-token',
            scriptNonce: 'unique-nonce',
            mermaidScript: 'globalThis.mermaid = {}; </script><script>assetAttack()</script>',
        });

        expect(html).not.toContain(attack);
        expect(html).not.toContain('</script><script>globalThis.pwned');
        expect(html).not.toContain('</script><script>assetAttack');
        expect(html).toContain('\\u003c/script\\u003e');
        expect(html).toContain('\\u2028');
    });

    it('uses a restrictive CSP, strict Mermaid mode, and a pinned script', () => {
        const html = buildMermaidWebViewHtml({
            content: 'graph TD; A-->B',
            backgroundColor: '#111111',
            bridgeToken: 'bridge-token',
            scriptNonce: 'unique-nonce',
            mermaidScript: 'globalThis.mermaid = { initialize() {}, render() {} };',
        });

        expect(html).toContain("default-src 'none'");
        expect(html).toContain("connect-src 'none'");
        expect(html).toContain("base-uri 'none'");
        expect(html).toContain("form-action 'none'");
        expect(html).not.toContain("'unsafe-eval'");
        expect(html).not.toContain('cdn.jsdelivr.net');
        expect(html).not.toContain('https://');
        expect(html).toContain('globalThis.mermaid');
        expect(html).toContain("securityLevel: 'strict'");
        expect(html).toContain("document.getElementById('dmermaid-diagram')");
        expect(html).toContain("script-src 'nonce-unique-nonce'");
        expect(html).toContain('nonce="unique-nonce"');
        expect(html).toContain('window.parent.postMessage');
    });

    it('accepts Web iframe dimensions only from the bound frame window', () => {
        const frameWindow = {};
        const raw = JSON.stringify({ version: 1, type: 'dimensions', bridgeToken: 'expected', height: 320 });
        expect(parseMermaidWebFrameMessage({ data: raw, source: frameWindow }, frameWindow, 'expected')).toEqual({ height: 320 });
        expect(parseMermaidWebFrameMessage({ data: raw, source: {} }, frameWindow, 'expected')).toBeNull();
        expect(parseMermaidWebFrameMessage({ data: { bridgeToken: 'expected' }, source: frameWindow }, frameWindow, 'expected')).toBeNull();
    });

    it('accepts only authenticated, bounded dimension messages', () => {
        expect(parseMermaidWebViewMessage(
            JSON.stringify({ version: 1, type: 'dimensions', bridgeToken: 'expected', height: 320 }),
            'expected',
        )).toEqual({ height: 320 });

        for (const raw of [
            'not-json',
            JSON.stringify({ version: 1, type: 'dimensions', bridgeToken: 'wrong', height: 320 }),
            JSON.stringify({ version: 2, type: 'dimensions', bridgeToken: 'expected', height: 320 }),
            JSON.stringify({ version: 1, type: 'other', bridgeToken: 'expected', height: 320 }),
            JSON.stringify({ version: 1, type: 'dimensions', bridgeToken: 'expected', height: -1 }),
            JSON.stringify({ version: 1, type: 'dimensions', bridgeToken: 'expected', height: 1_000_001 }),
            JSON.stringify({ version: 1, type: 'dimensions', bridgeToken: 'expected', height: '320' }),
        ]) {
            expect(parseMermaidWebViewMessage(raw, 'expected')).toBeNull();
        }
    });

    it('blocks every top-level navigation except the local blank document', () => {
        expect(shouldAllowMermaidNavigation('about:blank')).toBe(true);
        expect(shouldAllowMermaidNavigation('https://evil.example/steal')).toBe(false);
        expect(shouldAllowMermaidNavigation('javascript:alert(1)')).toBe(false);
        expect(shouldAllowMermaidNavigation('data:text/html,<script>alert(1)</script>')).toBe(false);
        expect(shouldAllowMermaidNavigation('file:///etc/passwd')).toBe(false);
    });

    it('removes Mermaid error artifacts from the host document', () => {
        let removed = false;
        const documentLike = {
            getElementById: (id: string) => id === 'drender-id' ? { remove: () => { removed = true; } } : null,
        };

        removeMermaidTemporaryContainer(documentLike, 'render-id');

        expect(removed).toBe(true);
    });
});
