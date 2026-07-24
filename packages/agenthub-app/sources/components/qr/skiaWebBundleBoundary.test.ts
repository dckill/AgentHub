import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../..');

describe('production Web Skia bundle boundary', () => {
    it('keeps Native Skia QR rendering without exporting an unused CanvasKit runtime', () => {
        const manifest = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8')) as {
            scripts?: Record<string, string>;
        };
        const nativeQr = readFileSync(resolve(appRoot, 'sources/components/qr/QRCode.tsx'), 'utf8');
        const webQr = readFileSync(resolve(appRoot, 'sources/components/qr/QRCode.web.tsx'), 'utf8');

        expect(nativeQr).toContain("from '@shopify/react-native-skia'");
        expect(webQr).not.toContain('@shopify/react-native-skia');
        expect(manifest.scripts?.postinstall).not.toContain('setup-skia-web');
        expect(existsSync(resolve(appRoot, 'public/canvaskit.wasm'))).toBe(false);
        expect(existsSync(resolve(appRoot, 'sources/utils/loadSkia.web.ts'))).toBe(false);
        expect(existsSync(resolve(appRoot, 'sources/utils/loadSkia.ts'))).toBe(false);
    });

    it('defers the Web QR encoder until a QR code is rendered', () => {
        const webMatrixPath = resolve(appRoot, 'sources/components/qr/qrMatrix.web.ts');

        expect(existsSync(webMatrixPath)).toBe(true);
        const webMatrix = readFileSync(webMatrixPath, 'utf8');
        const webQr = readFileSync(resolve(appRoot, 'sources/components/qr/QRCode.web.tsx'), 'utf8');

        expect(webMatrix).toContain("import('qrcode')");
        expect(webMatrix).not.toMatch(/^import .* from ['"]qrcode['"];?$/m);
        expect(webQr).toContain('accessibilityRole="progressbar"');
    });
});
