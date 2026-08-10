import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sources = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(sources, relativePath), 'utf8');

describe('dynamic route operational state boundary', () => {
    it('distinguishes machine loading from missing and gives every state a main heading', () => {
        const detail = read('app/(app)/machine/[id].tsx');
        const files = read('app/(app)/machine/[id]/files.tsx');

        expect(detail).toContain('useIsDataReady');
        expect(detail).toContain("isDataReady ? t('machine.notFound') : t('common.loading')");
        expect(detail).not.toContain('Machine not found');
        expect(detail).toContain('<ScreenReaderHeading title={machineName} />');
        expect(detail).toContain("accessibilityLabel={t('machine.renameTitle')}");
        expect(detail).toMatch(/headerAction:\s*\{[\s\S]{0,120}minWidth: 44,[\s\S]{0,80}minHeight: 44,/);
        expect(detail).not.toContain('#34C759');

        expect(files).toContain('useIsDataReady');
        expect(files).toContain("isDataReady ? t('machine.notFound') : t('fileBrowser.loadingDevice')");
        expect(files).toContain('<ScreenReaderHeading title={t(\'fileBrowser.title\')} />');
        expect(files).toContain('onRetry={refresh}');
    });

    it('keeps directory tree states named, live, retryable, and keyboard sized', () => {
        const tree = read('components/DirectoryTreePanel.tsx');

        expect(tree).toContain('onRetry?: () => void;');
        expect(tree).toContain("accessibilityLabel={t('directoryTree.searchPlaceholder')}");
        expect(tree).toContain("accessibilityLabel={t('common.close')}");
        expect(tree).toContain('accessibilityLiveRegion="polite"');
        expect(tree).toContain('accessibilityRole="alert"');
        expect(tree).toContain("accessibilityLabel={t('common.retry')}");
        expect(tree).toMatch(/headerBtn:\s*\{[\s\S]{0,100}minWidth: 44,[\s\S]{0,80}minHeight: 44,/);
        expect(tree).toMatch(/retryButton:\s*\{[\s\S]{0,120}minHeight: 44,/);

        const node = read('components/DirectoryTreeNode.tsx');
        expect(node.match(/accessibilityRole="button"/g)?.length).toBeGreaterThanOrEqual(2);
        expect(node).toContain('accessibilityState={{ expanded: isExpanded, busy: isLoading }}');
        expect(node).toContain('accessibilityState={{ selected: isSelected }}');
        expect(node).toContain('getDirectoryTreeRowMetrics');
        expect(node).toContain('minHeight: rowMetrics.rowMinHeight');
    });

    it('renders file preview failures persistently with localized user-driven retry', () => {
        const file = read('app/(app)/session/[id]/file.tsx');

        expect(file).toContain('const [loadAttempt, setLoadAttempt] = React.useState(0);');
        expect(file).toContain('setLoadAttempt((attempt) => attempt + 1);');
        expect(file).toContain("setError(t('files.fileLoadFailed'));");
        expect(file).toContain('onRetry={handleRetry}');
        expect(file).toContain('<ScreenReaderHeading title={fileName} />');
        expect(file).toContain('accessibilityRole="tab"');
        expect(file).toContain('accessibilityState={{ selected }}');
        expect(file).toContain('{...getSpaceKeyActivationProps(onPress)}');
        expect(file).toContain("role=\"region\"");
        expect(file).toMatch(/segmentButton:\s*\{[\s\S]{0,140}minHeight: 44,/);
        expect(file).toMatch(/segmentButton:\s*\{[\s\S]{0,140}minWidth: 44,/);
        expect(file).toContain('getScrollableNode');
        expect(file).toContain("scrollNode.setAttribute('tabindex', '0')");
        expect(file).toContain("accessibilityLabel={t('files.source')}");
        expect(file).not.toContain("console.error('Failed to load file:', error)");

        const highlighter = read('components/SimpleSyntaxHighlighter.tsx');
        expect(highlighter).toContain('accessibilityLabel?: string;');
        expect(highlighter).toContain("role={accessibilityLabel ? 'region' : undefined}");
        expect(highlighter).toContain("tabIndex={Platform.OS === 'web' && accessibilityLabel ? 0 : undefined}");
        expect(file).not.toMatch(/React\.useEffect\(\(\) => \{\s*if \(error\) \{\s*Modal\.alert/);
    });

    it('does not project git transport failures as a non-repository or leak diagnostics', () => {
        const hook = read('hooks/useGitStatusFiles.ts');
        const files = read('app/(app)/session/[id]/files.tsx');

        expect(hook).toContain("import { sync } from '@/sync/sync';");
        expect(hook).toContain('const generation = sync.getAccountGeneration();');
        expect(hook).toContain('sync.getAccountGeneration() === generation');
        expect(hook).toContain('classifyGitStatusLoadResult');
        expect(hook).toContain('error: hasError || cachedState.kind === \'error\'');
        expect(files).toContain('error: gitStatusError');
        expect(files).toContain("t('files.loadFailed')");
        expect(files).toContain('onPress={refreshGitStatus}');
        expect(files).not.toContain('emptyStateDebug');
        expect(files).not.toContain('gitStatusFiles?.debugError');
        expect(files).not.toContain('session=${sessionId');
    });

    it('labels the session file search, tabs, toolbar, and main region', () => {
        const files = read('app/(app)/session/[id]/files.tsx');

        expect(files).toContain("accessibilityLabel={t('files.searchPlaceholder')}");
        expect(files).toContain('accessibilityRole="tablist"');
        expect(files).toContain('accessibilityRole="tab"');
        expect(files).toContain('accessibilityState={{ selected: active }}');
        expect(files).toContain('{...getSpaceKeyActivationProps(() => setActiveTab(tab))}');
        expect(files).toContain('<ScreenReaderHeading title={t(\'files.changes\')} />');
        expect(files).toContain('styles.gitLogButtonText, { color: theme.colors.text }');
        expect(files).toContain('styles.listHeaderTitle, { color: theme.colors.text }');
        expect(files).toMatch(/tabButton:\s*\{[\s\S]{0,120}minHeight: 44,/);
        expect(files).toMatch(/toolbarButton:\s*\{[\s\S]{0,120}minHeight: 44,/);
    });

    it('makes message loading, missing, and populated states understandable without sight', () => {
        const message = read('app/(app)/session/[id]/message/[messageId].tsx');

        expect(message).toContain("accessibilityLabel={t('message.loading')}");
        expect(message).toContain('accessibilityLiveRegion="polite"');
        expect(message).toContain("title={t('message.notFound')}");
        expect(message).toContain('<ScreenReaderHeading title={t(\'common.message\')} />');
        expect(message).toContain('role="main"');

        const sessionView = read('-session/SessionView.tsx');
        expect(sessionView).toContain("sessionStatus.state === 'waiting' ? theme.colors.success : sessionStatus.statusColor");
    });
});
