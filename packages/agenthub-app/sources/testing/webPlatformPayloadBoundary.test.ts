import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourcesRoot = resolve(__dirname, '..');

describe('Web platform payload boundary', () => {
    it('excludes native device probes and defers the file icon catalog', () => {
        const platformWeb = readFileSync(resolve(sourcesRoot, 'utils/platform.web.ts'), 'utf8');
        const pushRegistration = readFileSync(resolve(sourcesRoot, 'sync/pushRegistration.ts'), 'utf8');
        const metadataNative = readFileSync(resolve(sourcesRoot, 'sync/pushDeviceMetadata.ts'), 'utf8');
        const metadataWeb = readFileSync(resolve(sourcesRoot, 'sync/pushDeviceMetadata.web.ts'), 'utf8');
        const fileIconWeb = readFileSync(resolve(sourcesRoot, 'components/FileIcon.web.tsx'), 'utf8');

        expect(platformWeb).not.toContain('react-native-device-info');
        expect(platformWeb).toContain('return false');
        expect(pushRegistration).not.toContain("from 'expo-device'");
        expect(pushRegistration).not.toContain("from 'expo-application'");
        expect(pushRegistration).toContain("from './pushDeviceMetadata'");
        expect(metadataNative).toContain("from 'expo-device'");
        expect(metadataNative).toContain("from 'expo-application'");
        expect(metadataWeb).not.toMatch(/from ['"]expo-(device|application)['"]/);
        expect(fileIconWeb).toContain("import('@peoplesgrocers/seti-ui-file-icons')");
        expect(fileIconWeb).not.toMatch(/^import .* from ['"]@peoplesgrocers\/seti-ui-file-icons['"]/m);
        expect(fileIconWeb).toContain('accessibilityLabel={fileName}');
    });
});
