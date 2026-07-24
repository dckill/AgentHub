import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { selectRetainedSessionMessageIds } from '../sync/sessionMessageIndex';
import type { AgentTextMessage } from '../sync/typesMessage';

const inactiveSessions = 50;
const messagesPerSession = 10_000;
const maxRetainedInactive = 20;

function collectHeap(): number {
    global.gc?.();
    return process.memoryUsage().heapUsed;
}

function createMessageState(sessionIndex: number): {
    messages: AgentTextMessage[];
    messagesMap: Record<string, AgentTextMessage>;
} {
    const messages = Array.from({ length: messagesPerSession }, (_, messageIndex): AgentTextMessage => ({
        kind: 'agent-text',
        id: `session-${sessionIndex}-message-${messageIndex}`,
        localId: null,
        createdAt: messagesPerSession - messageIndex,
        text: `session ${sessionIndex} message ${messageIndex}`,
    }));
    return {
        messages,
        messagesMap: Object.fromEntries(messages.map((message) => [message.id, message])),
    };
}

const sessions = Object.fromEntries(Array.from({ length: inactiveSessions }, (_, index) => [
    `session-${index}`,
    { active: false, updatedAt: index },
]));

function measureAllocation(sessionCount: number): number {
    const baselineHeapBytes = collectHeap();
    const messageStates = Object.fromEntries(Array.from({ length: sessionCount }, (_, index) => [
        `session-${index}`,
        createMessageState(index),
    ]));
    const allocatedHeapBytes = collectHeap() - baselineHeapBytes;
    if (Object.keys(messageStates).length !== sessionCount) throw new Error('message state allocation failed');
    return allocatedHeapBytes;
}

function measureInChild(sessionCount: number): number {
    const output = execFileSync(process.execPath, [
        '--expose-gc',
        '--import',
        'tsx',
        fileURLToPath(import.meta.url),
        `--measure-sessions=${sessionCount}`,
    ], { encoding: 'utf8' });
    return JSON.parse(output).allocatedHeapBytes;
}

const measureArgument = process.argv.find((argument) => argument.startsWith('--measure-sessions='));
if (measureArgument) {
    const sessionCount = Number(measureArgument.split('=')[1]);
    process.stdout.write(`${JSON.stringify({ allocatedHeapBytes: measureAllocation(sessionCount) })}\n`);
} else {
    const loadedIds = Object.keys(sessions);
    const startedAt = performance.now();
    const retainedIds = selectRetainedSessionMessageIds(sessions, loadedIds, maxRetainedInactive);
    const retentionDurationMs = performance.now() - startedAt;
    const loadedHeapBytes = measureInChild(inactiveSessions);
    const retainedHeapBytes = measureInChild(retainedIds.size);

    process.stdout.write(`${JSON.stringify({
        runtime: process.version,
        inactiveSessions,
        messagesPerSession,
        totalMessagesLoaded: inactiveSessions * messagesPerSession,
        maxRetainedInactive,
        retainedSessions: retainedIds.size,
        retainedMessages: retainedIds.size * messagesPerSession,
        loadedHeapBytes,
        retainedHeapBytes,
        reclaimedHeapBytes: loadedHeapBytes - retainedHeapBytes,
        reclaimedPercent: Number((((loadedHeapBytes - retainedHeapBytes) / loadedHeapBytes) * 100).toFixed(1)),
        retentionDurationMs: Number(retentionDurationMs.toFixed(3)),
    }, null, 2)}\n`);
}
