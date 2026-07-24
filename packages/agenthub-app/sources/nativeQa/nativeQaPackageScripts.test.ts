import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AgentHub native QA package scripts', () => {
    it('exposes stable V02 Android, iOS, evidence, and APK verification commands', () => {
        const packageJson = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as {
            scripts: Record<string, string>;
        };

        expect(packageJson.scripts['agenthub:android:apk:verify']).toBe('node ../../scripts/verify-agenthub-android-apk.mjs');
        expect(packageJson.scripts['agenthub:native:android']).toBe('node ../../scripts/agenthub-android-native-qa.mjs');
        expect(packageJson.scripts['agenthub:native:ios']).toBe('node ../../scripts/agenthub-ios-native-qa.mjs');
        expect(packageJson.scripts['agenthub:native:evidence']).toBe('node ../../scripts/agenthub-native-qa-evidence.mjs');
        expect(packageJson.scripts['agenthub:native:evidence:allow-partial']).toBe('node ../../scripts/agenthub-native-qa-evidence.mjs --allow-partial');
    });
});
