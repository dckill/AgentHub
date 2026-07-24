import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sessionExec } = vi.hoisted(() => ({
    sessionExec: vi.fn(),
}));

vi.mock('@/sync/ops', () => ({ sessionExec }));

import {
    buildGitGraphOverlayLayout,
    buildGitGraphTrackRows,
    commitChanges,
    discardAllChanges,
    discardFileChanges,
    getGitGraph,
    getGitLog,
    pushChanges,
    stageFile,
    stashSave,
} from './gitOperations';

const ok = (stdout = '') => Promise.resolve({ success: true, exitCode: 0, stdout, stderr: '' });
const fail = (stderr = 'boom') => Promise.resolve({ success: true, exitCode: 1, stdout: '', stderr });

describe('gitOperations', () => {
    beforeEach(() => {
        sessionExec.mockReset();
    });

    it('escapes single quotes in paths before staging', async () => {
        sessionExec.mockImplementation(() => ok());

        await stageFile('session-1', '/repo', "src/it's fine.ts");

        expect(sessionExec).toHaveBeenCalledWith('session-1', {
            executable: 'git', args: ['add', '--', "src/it's fine.ts"],
            cwd: '/repo',
            timeout: 10000,
        });
    });

    it('escapes single quotes in commit messages', async () => {
        sessionExec.mockImplementation(() => ok('created'));

        const result = await commitChanges('session-1', '/repo', "fix user's bug");

        expect(result).toEqual({ success: true, error: undefined, stdout: 'created' });
        expect(sessionExec).toHaveBeenCalledWith('session-1', {
            executable: 'git', args: ['commit', '-m', "fix user's bug"],
            cwd: '/repo',
            timeout: 10000,
        });
    });

    it('resets staged files before discarding tracked changes', async () => {
        sessionExec.mockImplementation(() => ok());

        await discardFileChanges('session-1', '/repo', 'src/file.ts', true, 'modified');

        expect(sessionExec.mock.calls.map(([, request]) => request.args)).toEqual([
            ['reset', 'HEAD', '--', 'src/file.ts'],
            ['checkout', '--', 'src/file.ts'],
        ]);
    });

    it('uses git clean for untracked and newly added staged files', async () => {
        sessionExec.mockImplementation(() => ok());

        await discardFileChanges('session-1', '/repo', 'new file.ts', false, 'untracked');
        await discardFileChanges('session-1', '/repo', 'added file.ts', true, 'added');

        expect(sessionExec.mock.calls.map(([, request]) => request.args)).toEqual([
            ['clean', '-f', '--', 'new file.ts'],
            ['reset', 'HEAD', '--', 'added file.ts'],
            ['clean', '-f', '--', 'added file.ts'],
        ]);
    });

    it('stops discard-all when reset fails', async () => {
        sessionExec.mockImplementationOnce(() => fail('reset failed'));

        const result = await discardAllChanges('session-1', '/repo');

        expect(result).toEqual({ success: false, error: 'reset failed', stdout: '' });
        expect(sessionExec).toHaveBeenCalledTimes(1);
    });

    it('uses longer timeouts for network operations', async () => {
        sessionExec.mockImplementation(() => ok());

        await pushChanges('session-1', '/repo');

        expect(sessionExec).toHaveBeenCalledWith('session-1', {
            executable: 'git', args: ['push'],
            cwd: '/repo',
            timeout: 30000,
        });
    });

    it('parses git log entries without splitting subjects on pipes', async () => {
        sessionExec.mockImplementation(() => ok('abcdef123|Alice|1700000000|feat: a | b\n1234567|Bob|bad|fix'));

        const result = await getGitLog('session-1', '/repo', 2);

        expect(result.entries).toEqual([
            { hash: 'abcdef123', shortHash: 'abcdef1', author: 'Alice', timestamp: 1700000000, subject: 'feat: a | b' },
            { hash: '1234567', shortHash: '1234567', author: 'Bob', timestamp: 0, subject: 'fix' },
        ]);
    });

    it('requests graph data across all branches', async () => {
        sessionExec.mockImplementation(() => ok('\u001fa1\u001f\u001fAlice\u001f1700000000\u001f (HEAD -> main)\u001froot'));

        await getGitGraph('session-1', '/repo', 10);

        expect(sessionExec).toHaveBeenCalledWith('session-1', expect.objectContaining({
            executable: 'git', args: expect.arrayContaining(['log', '--all', '--graph', '--decorate=short']),
        }));
    });

    it('builds connected track rows from commit parents', () => {
        const rows = buildGitGraphTrackRows([
            {
                hash: 'a1',
                shortHash: 'a1',
                author: 'Alice',
                timestamp: 1700000000,
                subject: 'root',
                refs: ['HEAD -> main'],
                graph: '*',
                parents: [],
            },
            {
                hash: 'b2',
                shortHash: 'b2',
                author: 'Bob',
                timestamp: 1700000100,
                subject: 'merge start',
                refs: [],
                graph: '|\\',
                parents: ['a1'],
            },
            {
                hash: 'c3',
                shortHash: 'c3',
                author: 'Carol',
                timestamp: 1700000200,
                subject: 'feature',
                refs: ['feature'],
                graph: '| *',
                parents: ['b2'],
            },
            {
                hash: 'd4',
                shortHash: 'd4',
                author: 'Dan',
                timestamp: 1700000300,
                subject: 'merge done',
                refs: [],
                graph: '|/',
                parents: ['a1', 'c3'],
            },
        ]);

        expect(rows[0].maxLane).toBeGreaterThanOrEqual(0);
        expect(rows[1].maxLane).toBeGreaterThanOrEqual(0);
        expect(rows[0].tracks.some((track) => track.type === 'node')).toBe(true);
        expect(rows[0].tracks.some((track) => track.type === 'curveRight' || track.type === 'curveLeft')).toBe(true);
        expect(rows[1].tracks.some((track) => track.type === 'node')).toBe(true);
        expect(rows[2].tracks.some((track) => track.type === 'node')).toBe(true);
        expect(rows[3].tracks.some((track) => track.type === 'curveRight' || track.type === 'curveLeft')).toBe(true);
        const mergeCurve = rows[3].tracks.find((track) => track.type === 'curveRight' || track.type === 'curveLeft');
        expect(mergeCurve?.fromLane).not.toBeUndefined();
        expect(mergeCurve?.toLane).not.toBeUndefined();
        expect(mergeCurve?.fromLane).not.toBe(mergeCurve?.toLane);
        expect(rows[3].maxLane).toBeGreaterThanOrEqual(1);
    });

    it('skips graph-only connector rows without commit payload', async () => {
        sessionExec.mockImplementation(() => ok(
            [
                '* \u001fa1\u001f\u001fAlice\u001f1700000000\u001f (HEAD -> main)\u001froot',
                '| * \u001fb2\u001fa1\u001fBob\u001f1700000100\u001f (feature)\u001ffeat',
                '|/',
                '* \u001fc3\u001fb2 a1\u001fCarol\u001f1700000200\u001f\u001fmerge',
            ].join('\n')
        ));

        const result = await getGitGraph('session-1', '/repo', 10);

        expect(result.entries).toHaveLength(3);
        expect(result.entries.map((entry) => entry.hash)).toEqual(['a1', 'b2', 'c3']);
        expect(result.entries[1]).toMatchObject({
            connectorAbove: '',
            connectorBelow: '|/',
        });
        expect(result.entries[2]).toMatchObject({
            connectorAbove: '|/',
            connectorBelow: '',
        });
    });

    it('uses connector rows to build merge and fork bends on adjacent commit rows', () => {
        const rows = buildGitGraphTrackRows([
            {
                hash: 'a1',
                shortHash: 'a1',
                author: 'Alice',
                timestamp: 1700000000,
                subject: 'root',
                refs: ['HEAD -> main'],
                graph: '*',
                parents: [],
                connectorAbove: '',
                connectorBelow: '|\\',
            },
            {
                hash: 'b2',
                shortHash: 'b2',
                author: 'Bob',
                timestamp: 1700000100,
                subject: 'feature',
                refs: ['feature'],
                graph: '| *',
                parents: ['a1'],
                connectorAbove: '|\\',
                connectorBelow: '|/',
            },
            {
                hash: 'c3',
                shortHash: 'c3',
                author: 'Carol',
                timestamp: 1700000200,
                subject: 'merge',
                refs: [],
                graph: '*',
                parents: ['a1', 'b2'],
                connectorAbove: '|/',
                connectorBelow: '',
            },
        ]);

        expect(rows[0].tracks.some((track) => track.type === 'curveRight')).toBe(true);
        expect(rows[1].tracks.some((track) => track.type === 'node')).toBe(true);
        const mergeCurve = rows[2].tracks.find((track) => track.type === 'curveLeft');
        expect(mergeCurve?.fromLane).toBeGreaterThan(mergeCurve?.toLane ?? Number.POSITIVE_INFINITY);
    });

    it('keeps a side branch on a dedicated lane until it merges back', () => {
        const rows = buildGitGraphTrackRows([
            {
                hash: 'merge',
                shortHash: 'merge',
                author: 'Alice',
                timestamp: 1700000500,
                subject: 'merge feature',
                refs: ['HEAD -> main'],
                graph: '*',
                parents: ['main-2', 'feature-2'],
            },
            {
                hash: 'feature-2',
                shortHash: 'feature-2',
                author: 'Bob',
                timestamp: 1700000400,
                subject: 'feature work 2',
                refs: ['feature'],
                graph: '*',
                parents: ['feature-1'],
            },
            {
                hash: 'main-2',
                shortHash: 'main-2',
                author: 'Alice',
                timestamp: 1700000300,
                subject: 'main work 2',
                refs: [],
                graph: '*',
                parents: ['main-1'],
            },
            {
                hash: 'feature-1',
                shortHash: 'feature-1',
                author: 'Bob',
                timestamp: 1700000200,
                subject: 'feature work 1',
                refs: [],
                graph: '*',
                parents: ['main-1'],
            },
            {
                hash: 'main-1',
                shortHash: 'main-1',
                author: 'Alice',
                timestamp: 1700000100,
                subject: 'main work 1',
                refs: [],
                graph: '*',
                parents: ['root'],
            },
            {
                hash: 'root',
                shortHash: 'root',
                author: 'Alice',
                timestamp: 1700000000,
                subject: 'root',
                refs: [],
                graph: '*',
                parents: [],
            },
        ]);

        const mergeRow = rows[0];
        const featureRows = rows.filter((row) => row.entry.hash.startsWith('feature-'));

        expect(mergeRow.tracks.some((track) => track.type === 'curveRight' || track.type === 'curveLeft')).toBe(true);
        expect(featureRows.every((row) => row.maxLane >= 1)).toBe(true);
        expect(featureRows.every((row) => row.tracks.some((track) => track.type === 'node' && track.lane === 1))).toBe(true);
    });

    it('builds continuous overlay paths with fork and merge lanes', () => {
        const layout = buildGitGraphOverlayLayout([
            {
                hash: 'merge',
                shortHash: 'merge',
                author: 'Alice',
                timestamp: 1700000500,
                subject: 'merge feature',
                refs: ['HEAD -> main'],
                graph: '*',
                parents: ['main-2', 'feature-2'],
            },
            {
                hash: 'feature-2',
                shortHash: 'feature-2',
                author: 'Bob',
                timestamp: 1700000400,
                subject: 'feature work 2',
                refs: ['feature'],
                graph: '*',
                parents: ['feature-1'],
            },
            {
                hash: 'main-2',
                shortHash: 'main-2',
                author: 'Alice',
                timestamp: 1700000300,
                subject: 'main work 2',
                refs: [],
                graph: '*',
                parents: ['main-1'],
            },
            {
                hash: 'feature-1',
                shortHash: 'feature-1',
                author: 'Bob',
                timestamp: 1700000200,
                subject: 'feature work 1',
                refs: [],
                graph: '*',
                parents: ['main-1'],
            },
            {
                hash: 'main-1',
                shortHash: 'main-1',
                author: 'Alice',
                timestamp: 1700000100,
                subject: 'main work 1',
                refs: [],
                graph: '*',
                parents: ['root'],
            },
            {
                hash: 'root',
                shortHash: 'root',
                author: 'Alice',
                timestamp: 1700000000,
                subject: 'root',
                refs: [],
                graph: '*',
                parents: [],
            },
        ]);

        expect(layout.maxLane).toBeGreaterThanOrEqual(1);
        expect(layout.nodes.find((node) => node.hash === 'merge')?.isHead).toBe(true);
        expect(layout.rows.find((row) => row.entry.hash === 'feature-2')?.lane).toBeGreaterThanOrEqual(1);
        expect(layout.paths.some((path) => path.points.some((point) => point.x >= 1))).toBe(true);
        expect(
            layout.paths.some((path) =>
                path.points.some((point, index) => index > 0 && point.x !== path.points[index - 1].x)
            )
        ).toBe(true);
    });

    it('escapes optional stash messages', async () => {
        sessionExec.mockImplementation(() => ok());

        await stashSave('session-1', '/repo', "wip user's changes");

        expect(sessionExec).toHaveBeenCalledWith('session-1', {
            executable: 'git', args: ['stash', 'push', '-m', "wip user's changes"],
            cwd: '/repo',
            timeout: 10000,
        });
    });
});
