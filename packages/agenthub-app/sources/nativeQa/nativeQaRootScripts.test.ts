import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../..');

describe('AgentHub native QA root scripts', () => {
    it('resolve the repository root when launched from the app package directory', () => {
        const artifactsDir = mkdtempSync(resolve(tmpdir(), 'agenthub-native-qa-'));
        const result = spawnSync('node', [resolve(repoRoot, 'scripts/agenthub-native-qa-evidence.mjs')], {
            cwd: resolve(repoRoot, 'packages/agenthub-app'),
            env: { ...process.env, AGENTHUB_NATIVE_QA_ARTIFACTS_DIR: artifactsDir },
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        expect(result.status).toBe(1);
        expect(result.stderr).toBe('');
        expect(result.stdout).toContain('"status": "failed"');
        expect(result.stdout).toContain('"arm64ApkPath":');
        expect(result.stdout).toContain(`${artifactsDir}/agenthub-production-arm64-latest.apk`);
        expect(result.stdout).not.toContain('/packages/agenthub-app/artifacts/');
    });

    it('does not mask failed evidence when allow-partial is explicit', () => {
        const artifactsDir = mkdtempSync(resolve(tmpdir(), 'agenthub-native-qa-'));
        const result = spawnSync('node', [resolve(repoRoot, 'scripts/agenthub-native-qa-evidence.mjs'), '--allow-partial'], {
            cwd: resolve(repoRoot, 'packages/agenthub-app'),
            env: { ...process.env, AGENTHUB_NATIVE_QA_ARTIFACTS_DIR: artifactsDir },
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        expect(result.status).toBe(1);
        expect(result.stderr).toBe('');
        expect(result.stdout).toContain('"status": "failed"');
        expect(result.stdout).toContain('"readyToMarkV02Done": false');

        const reportPath = resolve(artifactsDir, 'agenthub-v02-native-qa-evidence-latest.json');
        const persistedReport = JSON.parse(readFileSync(reportPath, 'utf8')) as {
            repoRoot?: string;
            artifactsDir?: string;
            reportPath?: string;
            markdownPath?: string;
        };

        expect(persistedReport.repoRoot).toBe(repoRoot);
        expect(persistedReport.artifactsDir).toBe(artifactsDir);
        expect(persistedReport.reportPath).toBe(reportPath);
        expect(persistedReport.markdownPath).toBe(resolve(artifactsDir, 'agenthub-v02-native-qa-evidence-latest.md'));
        expect(result.stdout).toContain(`${artifactsDir}/agenthub-production-arm64-latest.apk`);
    });
});
