/**
 * Git write operations: discard, stage, unstage, commit, push, pull, stash, log
 *
 * Every function invokes Git with a structured argv and returns a typed result.
 */

import { sessionExec } from '@/sync/ops';

// --- Types ---

export interface GitOperationResult {
    success: boolean;
    error?: string;
    stdout?: string;
}

export interface GitLogEntry {
    hash: string;
    shortHash: string;
    author: string;
    timestamp: number;
    subject: string;
    parents?: string[];
}

export interface GitGraphEntry extends GitLogEntry {
    refs: string[];
    graph: string;
    connectorAbove?: string;
    connectorBelow?: string;
}

export type GitGraphTrackType = 'empty' | 'vertical' | 'horizontal' | 'node' | 'curveLeft' | 'curveRight';

export interface GitGraphTrackCell {
    lane: number;
    type: GitGraphTrackType;
    colorKey: number | null;
    segment?: 'top' | 'bottom' | 'full';
    fromLane?: number;
    toLane?: number;
    connectTop?: 'straight' | 'left' | 'right';
    connectBottom?: 'straight' | 'left' | 'right';
}

export interface GitGraphTrackRow {
    entry: GitGraphEntry;
    tracks: GitGraphTrackCell[];
    maxLane: number;
}

export interface GitGraphOverlayRow {
    entry: GitGraphEntry;
    lane: number;
    colorKey: number;
    rowIndex: number;
}

export interface GitGraphOverlayPath {
    colorKey: number;
    points: Array<{ x: number; y: number; lockedFirst: boolean }>;
}

export interface GitGraphOverlayNode {
    hash: string;
    rowIndex: number;
    lane: number;
    colorKey: number;
    isHead: boolean;
}

export interface GitGraphOverlayLayout {
    rows: GitGraphOverlayRow[];
    paths: GitGraphOverlayPath[];
    nodes: GitGraphOverlayNode[];
    maxLane: number;
}

interface GitGraphCommitTopology {
    lane: number;
    colorKey: number;
    parentLanes: number[];
    childLanes: number[];
}

interface OverlayLine {
    p1: { x: number; y: number };
    p2: { x: number; y: number };
    lockedFirst: boolean;
}

interface OverlayBranch {
    colorKey: number;
    lines: OverlayLine[];
    endRow: number;
}

interface OverlayConnection {
    connectsTo: number | null;
    onBranch: number;
}

interface OverlayVertex {
    rowIndex: number;
    hash: string;
    parentRows: number[];
    nextParent: number;
    branch: number | null;
    lane: number;
    nextLane: number;
    connections: OverlayConnection[];
    isCommitted: boolean;
    isHead: boolean;
}

// --- Helpers ---

function runGit(
    sessionId: string,
    cwd: string,
    args: string[],
    timeout: number = 10000
): Promise<GitOperationResult> {
    return sessionExec(sessionId, { executable: 'git', args, cwd, timeout }).then((r) => ({
        success: r.success && r.exitCode === 0,
        error: r.success && r.exitCode === 0 ? undefined : (r.stderr || r.error || 'Unknown error'),
        stdout: r.stdout,
    }));
}

export function buildGitGraphTrackRows(entries: GitGraphEntry[]): GitGraphTrackRow[] {
    const entryIndexByHash = new Map(entries.map((entry, index) => [entry.hash, index]));
    const activeLanes: Array<string | null> = [];
    const topologyByHash = new Map<string, GitGraphCommitTopology>();

    const ensureLane = (hash: string) => {
        let lane = activeLanes.indexOf(hash);
        if (lane === -1) {
            lane = activeLanes.findIndex((value) => value === null);
            if (lane === -1) {
                lane = activeLanes.length;
                activeLanes.push(hash);
            } else {
                activeLanes[lane] = hash;
            }
        }
        return lane;
    };

    const reserveLaneNear = (preferredLane: number, hash: string) => {
        if (activeLanes[preferredLane] == null) {
            activeLanes[preferredLane] = hash;
            return preferredLane;
        }
        let lane = preferredLane + 1;
        while (activeLanes[lane] != null) lane += 1;
        activeLanes[lane] = hash;
        return lane;
    };

    entries.forEach((entry) => {
        const lane = ensureLane(entry.hash);
        const colorKey = lane;
        const parentLanes: number[] = [];

        if (entry.parents?.length) {
            entry.parents.forEach((parentHash, parentIndex) => {
                if (!entryIndexByHash.has(parentHash)) return;
                if (parentIndex === 0) {
                    activeLanes[lane] = parentHash;
                    parentLanes.push(lane);
                    return;
                }
                const parentLane = reserveLaneNear(lane + parentIndex, parentHash);
                parentLanes.push(parentLane);
            });
        } else {
            activeLanes[lane] = null;
        }

        topologyByHash.set(entry.hash, {
            lane,
            colorKey,
            parentLanes,
            childLanes: [],
        });
    });

    entries.forEach((entry) => {
        const topology = topologyByHash.get(entry.hash);
        if (!topology) return;
        entry.parents?.forEach((parentHash) => {
            const parentTopology = topologyByHash.get(parentHash);
            if (!parentTopology) return;
            if (!parentTopology.childLanes.includes(topology.lane)) {
                parentTopology.childLanes.push(topology.lane);
            }
        });
    });

    return entries.map((entry) => {
        const topology = topologyByHash.get(entry.hash)!;
        const tracks: GitGraphTrackCell[] = [];
        const connectionLanes = new Set<number>([
            topology.lane,
            ...topology.parentLanes,
            ...topology.childLanes,
        ]);

        connectionLanes.forEach((lane) => {
            const isNodeLane = lane === topology.lane;
            const topSourceLane = topology.parentLanes.includes(lane) ? lane : topology.parentLanes[0];
            const bottomTargetLane = topology.childLanes.includes(lane) ? lane : topology.childLanes[0];

            if (isNodeLane) {
                const connectTop = topology.parentLanes.length === 0
                    ? undefined
                    : topSourceLane < lane
                        ? 'left'
                        : topSourceLane > lane
                            ? 'right'
                            : 'straight';
                const connectBottom = topology.childLanes.length === 0
                    ? undefined
                    : bottomTargetLane < lane
                        ? 'left'
                        : bottomTargetLane > lane
                            ? 'right'
                            : 'straight';
                tracks.push({
                    lane,
                    type: 'node',
                    colorKey: topology.colorKey,
                    connectTop,
                    connectBottom,
                });
                return;
            }

            if (topology.parentLanes.includes(lane)) {
                if (lane < topology.lane) {
                    tracks.push({
                        lane,
                        type: 'curveRight',
                        colorKey: lane,
                        fromLane: lane,
                        toLane: topology.lane,
                        segment: 'top',
                    });
                } else if (lane > topology.lane) {
                    tracks.push({
                        lane,
                        type: 'curveLeft',
                        colorKey: lane,
                        fromLane: lane,
                        toLane: topology.lane,
                        segment: 'top',
                    });
                } else {
                    tracks.push({ lane, type: 'vertical', colorKey: lane, segment: 'top' });
                }
            }

            if (topology.childLanes.includes(lane)) {
                if (lane < topology.lane) {
                    tracks.push({
                        lane,
                        type: 'curveLeft',
                        colorKey: lane,
                        fromLane: topology.lane,
                        toLane: lane,
                        segment: 'bottom',
                    });
                } else if (lane > topology.lane) {
                    tracks.push({
                        lane,
                        type: 'curveRight',
                        colorKey: lane,
                        fromLane: topology.lane,
                        toLane: lane,
                        segment: 'bottom',
                    });
                } else {
                    tracks.push({ lane, type: 'vertical', colorKey: lane, segment: 'bottom' });
                }
            }

            if (!topology.parentLanes.includes(lane) && !topology.childLanes.includes(lane)) {
                tracks.push({ lane, type: 'vertical', colorKey: lane, segment: 'full' });
            }
        });

        const maxLane = tracks.reduce((max, track) => Math.max(max, track.lane, track.fromLane ?? 0, track.toLane ?? 0), 0);
        return {
            entry,
            tracks: tracks.sort((a, b) => a.lane - b.lane || a.type.localeCompare(b.type)),
            maxLane,
        };
    });
}

export function buildGitGraphOverlayLayout(entries: GitGraphEntry[]): GitGraphOverlayLayout {
    const entryIndexByHash = new Map(entries.map((entry, index) => [entry.hash, index]));
    const vertices: OverlayVertex[] = entries.map((entry, rowIndex) => ({
        rowIndex,
        hash: entry.hash,
        parentRows: (entry.parents ?? [])
            .map((parentHash) => entryIndexByHash.get(parentHash))
            .filter((value): value is number => typeof value === 'number'),
        nextParent: 0,
        branch: null,
        lane: 0,
        nextLane: 0,
        connections: [],
        isCommitted: entry.hash !== '*',
        isHead: entry.refs.some((ref) => ref.includes('HEAD')),
    }));
    const branches: OverlayBranch[] = [];
    const availableColours: number[] = [];

    const getPoint = (vertex: OverlayVertex) => ({ x: vertex.lane, y: vertex.rowIndex });
    const getNextPoint = (vertex: OverlayVertex) => ({ x: vertex.nextLane, y: vertex.rowIndex });
    const addToBranch = (vertex: OverlayVertex, branchId: number, lane: number) => {
        if (vertex.branch == null) {
            vertex.branch = branchId;
            vertex.lane = lane;
        }
    };
    const registerUnavailablePoint = (
        vertex: OverlayVertex,
        lane: number,
        connectsToRow: number | null,
        onBranch: number
    ) => {
        if (lane === vertex.nextLane) {
            vertex.nextLane = lane + 1;
            vertex.connections[lane] = { connectsTo: connectsToRow, onBranch };
        }
    };
    const getPointConnectingTo = (vertex: OverlayVertex, connectsToRow: number | null, onBranch: number) => {
        for (let i = 0; i < vertex.connections.length; i += 1) {
            if (vertex.connections[i]?.connectsTo === connectsToRow && vertex.connections[i]?.onBranch === onBranch) {
                return { x: i, y: vertex.rowIndex };
            }
        }
        return null;
    };
    const getAvailableColour = (startAt: number) => {
        for (let i = 0; i < availableColours.length; i += 1) {
            if (startAt > availableColours[i]) return i;
        }
        availableColours.push(0);
        return availableColours.length - 1;
    };
    const findStart = () => {
        for (let i = 0; i < vertices.length; i += 1) {
            if (vertices[i].nextParent < vertices[i].parentRows.length || vertices[i].branch == null) return i;
        }
        return -1;
    };
    const addLine = (branchId: number, p1: { x: number; y: number }, p2: { x: number; y: number }, lockedFirst: boolean) => {
        branches[branchId].lines.push({ p1, p2, lockedFirst });
    };

    const determinePath = (startAt: number) => {
        let index = startAt;
        let vertex = vertices[index];
        let parentRow = vertex.nextParent < vertex.parentRows.length ? vertex.parentRows[vertex.nextParent] : null;
        let lastPoint = vertex.branch == null ? getNextPoint(vertex) : getPoint(vertex);

        if (
            parentRow != null &&
            vertex.parentRows.length > 1 &&
            vertex.branch != null &&
            vertices[parentRow].branch != null
        ) {
            const parentBranchId = vertices[parentRow].branch!;
            let foundPointToParent = false;
            for (index = startAt + 1; index < vertices.length; index += 1) {
                const existingPoint = getPointConnectingTo(vertices[index], parentRow, parentBranchId);
                if (existingPoint != null) {
                    foundPointToParent = true;
                }
                const curPoint = existingPoint ?? getNextPoint(vertices[index]);
                addLine(
                    parentBranchId,
                    lastPoint,
                    curPoint,
                    !foundPointToParent && vertices[index].rowIndex !== parentRow ? lastPoint.x < curPoint.x : true
                );
                registerUnavailablePoint(vertices[index], curPoint.x, parentRow, parentBranchId);
                lastPoint = curPoint;
                if (foundPointToParent) {
                    vertex.nextParent += 1;
                    break;
                }
            }
            return;
        }

        const branchId = branches.length;
        const branch: OverlayBranch = {
            colorKey: getAvailableColour(startAt),
            lines: [],
            endRow: startAt,
        };
        branches.push(branch);

        addToBranch(vertex, branchId, lastPoint.x);
        registerUnavailablePoint(vertex, lastPoint.x, startAt, branchId);

        for (index = startAt + 1; index < vertices.length; index += 1) {
            const curPoint =
                parentRow != null && parentRow === vertices[index].rowIndex && vertices[parentRow].branch != null
                    ? getPoint(vertices[parentRow])
                    : getNextPoint(vertices[index]);
            addLine(branchId, lastPoint, curPoint, lastPoint.x < curPoint.x);
            registerUnavailablePoint(vertices[index], curPoint.x, parentRow, branchId);
            lastPoint = curPoint;

            if (parentRow != null && parentRow === vertices[index].rowIndex) {
                vertex.nextParent += 1;
                const parentOnBranch = vertices[parentRow].branch != null;
                addToBranch(vertices[parentRow], branchId, curPoint.x);
                vertex = vertices[parentRow];
                parentRow = vertex.nextParent < vertex.parentRows.length ? vertex.parentRows[vertex.nextParent] : null;
                if (parentOnBranch) break;
            }
        }

        branch.endRow = index;
        availableColours[branch.colorKey] = index;
    };

    let startIndex = findStart();
    while (startIndex !== -1) {
        determinePath(startIndex);
        startIndex = findStart();
    }

    const rows: GitGraphOverlayRow[] = entries.map((entry, rowIndex) => {
        const vertex = vertices[rowIndex];
        return {
            entry,
            lane: vertex.lane,
            colorKey: vertex.branch != null ? branches[vertex.branch].colorKey : 0,
            rowIndex,
        };
    });

    const paths: GitGraphOverlayPath[] = branches.map((branch) => {
        const points: Array<{ x: number; y: number; lockedFirst: boolean }> = [];
        branch.lines.forEach((line, index) => {
            if (index === 0) {
                points.push({ x: line.p1.x, y: line.p1.y, lockedFirst: line.lockedFirst });
            }
            points.push({ x: line.p2.x, y: line.p2.y, lockedFirst: line.lockedFirst });
        });
        return {
            colorKey: branch.colorKey,
            points,
        };
    }).filter((path) => path.points.length > 1);

    const nodes: GitGraphOverlayNode[] = rows.map((row) => ({
        hash: row.entry.hash,
        rowIndex: row.rowIndex,
        lane: row.lane,
        colorKey: row.colorKey,
        isHead: vertices[row.rowIndex].isHead,
    }));

    const maxLaneFromBranches = branches.reduce((max, branch) => (
        Math.max(
            max,
            ...branch.lines.flatMap((line) => [line.p1.x, line.p2.x])
        )
    ), 0);
    const maxLane = Math.max(
        maxLaneFromBranches,
        rows.reduce((max, row) => Math.max(max, row.lane), 0),
        vertices.reduce((max, vertex) => Math.max(max, vertex.nextLane), 0),
    );
    return { rows, paths, nodes, maxLane };
}

// --- Operations ---

/** Discard changes to a single file */
export async function discardFileChanges(
    sessionId: string,
    cwd: string,
    filePath: string,
    isStaged: boolean,
    status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
): Promise<GitOperationResult> {
    if (status === 'untracked') {
        return runGit(sessionId, cwd, ['clean', '-f', '--', filePath]);
    }

    if (isStaged) {
        const reset = await runGit(sessionId, cwd, ['reset', 'HEAD', '--', filePath]);
        if (!reset.success) return reset;

        if (status === 'added') {
            return runGit(sessionId, cwd, ['clean', '-f', '--', filePath]);
        }
    }

    return runGit(sessionId, cwd, ['checkout', '--', filePath]);
}

/** Discard all uncommitted changes (revert tracked + remove untracked) */
export async function discardAllChanges(
    sessionId: string,
    cwd: string
): Promise<GitOperationResult> {
    const reset = await runGit(sessionId, cwd, ['reset', '--hard', 'HEAD']);
    if (!reset.success) return reset;
    return runGit(sessionId, cwd, ['clean', '-fd']);
}

/** Stage a single file */
export async function stageFile(
    sessionId: string,
    cwd: string,
    filePath: string
): Promise<GitOperationResult> {
    return runGit(sessionId, cwd, ['add', '--', filePath]);
}

/** Unstage a single file */
export async function unstageFile(
    sessionId: string,
    cwd: string,
    filePath: string
): Promise<GitOperationResult> {
    return runGit(sessionId, cwd, ['reset', 'HEAD', '--', filePath]);
}

/** Commit staged changes with a message */
export async function commitChanges(
    sessionId: string,
    cwd: string,
    message: string
): Promise<GitOperationResult> {
    return runGit(sessionId, cwd, ['commit', '-m', message]);
}

/** Get recent commit log entries */
export async function getGitLog(
    sessionId: string,
    cwd: string,
    count: number = 50
): Promise<GitOperationResult & { entries: GitLogEntry[] }> {
    const result = await runGit(
        sessionId,
        cwd,
        ['log', '--pretty=format:%H|%an|%at|%s', '-n', String(count)]
    );

    if (!result.success) {
        return { ...result, entries: [] };
    }

    const entries: GitLogEntry[] = (result.stdout || '')
        .split('\n')
        .filter((line) => line.includes('|'))
        .map((line) => {
            const pipe1 = line.indexOf('|');
            const pipe2 = line.indexOf('|', pipe1 + 1);
            const pipe3 = line.indexOf('|', pipe2 + 1);
            return {
                hash: line.slice(0, pipe1),
                shortHash: line.slice(0, Math.min(7, pipe1)),
                author: line.slice(pipe1 + 1, pipe2),
                timestamp: parseInt(line.slice(pipe2 + 1, pipe3), 10) || 0,
                subject: line.slice(pipe3 + 1),
            };
        });

    return { ...result, entries };
}

/** Get graph-style recent commit log entries */
export async function getGitGraph(
    sessionId: string,
    cwd: string,
    count: number = 60
): Promise<GitOperationResult & { entries: GitGraphEntry[] }> {
    const result = await runGit(
        sessionId,
        cwd,
        ['log', '--all', '--graph', '--decorate=short', '--pretty=format:%x1f%H%x1f%P%x1f%an%x1f%at%x1f%d%x1f%s', '-n', String(count)]
    );

    if (!result.success) {
        return { ...result, entries: [] };
    }

    const lines = (result.stdout || '').split('\n').filter(Boolean);
    const entries: GitGraphEntry[] = [];

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];
        if (!line.includes('\x1f')) {
            continue;
        }

            const marker = '\x1f';
            const idx = line.indexOf(marker);
            const graph = idx >= 0 ? line.slice(0, idx) : '';
            const payload = idx >= 0 ? line.slice(idx + 1).split(marker) : [];
            const [hash = '', parents = '', author = '', timestamp = '0', refs = '', subject = ''] = payload;
            entries.push({
                hash,
                shortHash: hash.slice(0, 7),
                parents: parents ? parents.split(' ').filter(Boolean) : [],
                author,
                timestamp: parseInt(timestamp, 10) || 0,
                refs: refs.replace(/^\s*\(|\)\s*$/g, '').split(',').map((value) => value.trim()).filter(Boolean),
                subject,
                graph: graph.trimEnd(),
                connectorAbove: lineIndex > 0 && !lines[lineIndex - 1].includes('\x1f') ? lines[lineIndex - 1].trimEnd() : '',
                connectorBelow: lineIndex + 1 < lines.length && !lines[lineIndex + 1].includes('\x1f') ? lines[lineIndex + 1].trimEnd() : '',
            });
    }

    return { ...result, entries };
}

/** Push local commits to remote */
export async function pushChanges(
    sessionId: string,
    cwd: string
): Promise<GitOperationResult> {
    return runGit(sessionId, cwd, ['push'], 30000);
}

/** Pull changes from remote */
export async function pullChanges(
    sessionId: string,
    cwd: string
): Promise<GitOperationResult> {
    return runGit(sessionId, cwd, ['pull'], 30000);
}

/** Stash current changes (optionally with a message) */
export async function stashSave(
    sessionId: string,
    cwd: string,
    message?: string
): Promise<GitOperationResult> {
    return runGit(sessionId, cwd, message ? ['stash', 'push', '-m', message] : ['stash', 'push']);
}

/** Pop the latest stash entry */
export async function stashPop(
    sessionId: string,
    cwd: string
): Promise<GitOperationResult> {
    return runGit(sessionId, cwd, ['stash', 'pop']);
}

/** Drop the latest stash entry */
export async function stashDrop(
    sessionId: string,
    cwd: string
): Promise<GitOperationResult> {
    return runGit(sessionId, cwd, ['stash', 'drop']);
}
