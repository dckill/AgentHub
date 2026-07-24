import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const appSources = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(appSources, relativePath), 'utf8');

describe('settings operational states boundary', () => {
    it('makes usage loading and failure explicit, cancellable, and retryable', () => {
        const usage = read('components/usage/UsagePanel.tsx');
        const chart = read('components/usage/UsageChart.tsx');

        expect(usage).toContain('const [retryKey, setRetryKey]');
        expect(usage).toContain('const controller = new AbortController()');
        expect(usage).toContain('getUsageForPeriod(auth.credentials, period, sessionId, controller.signal)');
        expect(usage).toContain('controller.abort()');
        expect(usage).toContain("t('common.loading')");
        expect(usage).toContain("t('common.retry')");
        expect(usage).toContain('accessibilityRole="button"');
        expect(usage).toContain('setRetryKey(value => value + 1)');
        expect(usage).toContain("console.warn('Failed to load usage data:', err)");
        expect(usage).not.toContain("console.error('Failed to load usage data:', err)");
        expect(chart).toMatch(/axisCaption:\s*\{[\s\S]{0,220}color: theme\.colors\.textSecondary,/);
        expect(chart).toMatch(/yAxisText:\s*\{[\s\S]{0,220}color: theme\.colors\.textSecondary,/);
        expect(chart).toMatch(/barColumn:\s*\{[\s\S]{0,100}width: 44,/);
        expect(chart).toContain('getCurrentLanguage()');
        expect(chart).not.toContain("toLocaleTimeString('zh-CN'");
        expect(chart).not.toContain("toLocaleDateString('zh-CN'");
    });

    it('keeps credential list data visible across failures and exposes retry plus a named delete action', () => {
        const credentials = read('app/(app)/settings/credentials.tsx');

        expect(credentials).toContain("useState<'loading' | 'ready' | 'error'>('loading')");
        expect(credentials).toContain('const controller = new AbortController()');
        expect(credentials).toContain('listCredentials(auth.credentials, signal)');
        expect(credentials).toContain('void loadCredentials(controller.signal)');
        expect(credentials).toContain('controller.abort()');
        expect(credentials).toContain('accessibilityLiveRegion="polite"');
        expect(credentials).toContain("t('common.retry')");
        expect(credentials).toContain('rightElementInteractive');
        expect(credentials).toContain('size={44}');
        expect(credentials).toContain("t('credentials.deleteCredentialLabel', { label: cred.label })");
        expect(credentials).toContain('setCredentials(current => current.filter');
        expect(credentials).toContain("setError(t('credentials.deleteFailed'))");
    });

    it('makes credential edit loading, failure, save progress, and agent selection recoverable', () => {
        const edit = read('app/(app)/settings/credentials/edit.tsx');

        expect(edit).toContain("useState<'loading' | 'ready' | 'error'>");
        expect(edit).toContain('const controller = new AbortController()');
        expect(edit).toContain('getCredential(auth.credentials, id, signal)');
        expect(edit).toContain('void loadCredential(controller.signal)');
        expect(edit).toContain('controller.abort()');
        expect(edit).toContain('role="radiogroup"');
        expect(edit).toContain('<SelectRow');
        expect(edit).toContain('selected={agent === opt.key}');
        expect(edit).toContain("t('common.retry')");
        expect(edit).toContain("t('credentials.saveFailed')");
        expect(edit).toContain("t('credentials.apiKeyUnchanged')");
        expect(edit).not.toContain("placeholder=\"e.g., claude-sonnet-4-20250514\"");
    });
});
