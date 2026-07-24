import { performance } from 'node:perf_hooks';
import {
    mergeMessagesNewestFirst,
    updateRunningToolCount,
} from '../sync/sessionMessageIndex';
import type { AgentTextMessage, Message } from '../sync/typesMessage';

function legacyMerge<T extends { id: string; createdAt: number }>(
    existingMessages: readonly T[],
    existingMessagesMap: Readonly<Record<string, T>>,
    updates: readonly T[],
): { messages: T[]; messagesMap: Record<string, T> } {
    const updateIds = new Set(updates.map((message) => message.id));
    const unchanged = existingMessages.filter((message) => !updateIds.has(message.id));
    const sortedUpdates = [...new Map(updates.map((message) => [message.id, message])).values()]
        .sort((left, right) => right.createdAt - left.createdAt);
    const messages: T[] = [];
    let existingIndex = 0;
    let updateIndex = 0;
    while (existingIndex < unchanged.length || updateIndex < sortedUpdates.length) {
        const existing = unchanged[existingIndex];
        const update = sortedUpdates[updateIndex];
        if (!update || (existing && existing.createdAt >= update.createdAt)) {
            messages.push(existing);
            existingIndex += 1;
        } else {
            messages.push(update);
            updateIndex += 1;
        }
    }
    const messagesMap = { ...existingMessagesMap };
    for (const message of updates) messagesMap[message.id] = message;
    return { messages, messagesMap };
}

function legacyInferThinking(messages: readonly Message[]): boolean {
    const stack = [...messages];
    while (stack.length > 0) {
        const message = stack.pop();
        if (!message || message.kind !== 'tool-call') continue;
        if (message.tool.state === 'running') return true;
        stack.push(...message.children);
    }
    return false;
}

function percentile(values: number[], quantile: number): number {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))];
}

function measure(
    iterations: number,
    operation: (iteration: number) => unknown,
): { coldMs: number; p50Ms: number; p95Ms: number; retainedHeapBytes: number } {
    global.gc?.();
    const heapBefore = process.memoryUsage().heapUsed;
    const samples: number[] = [];
    let retained: unknown;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
        const startedAt = performance.now();
        retained = operation(iteration);
        samples.push(performance.now() - startedAt);
    }
    void retained;
    global.gc?.();
    return {
        coldMs: Number(samples[0].toFixed(3)),
        p50Ms: Number(percentile(samples, 0.5).toFixed(3)),
        p95Ms: Number(percentile(samples, 0.95).toFixed(3)),
        retainedHeapBytes: process.memoryUsage().heapUsed - heapBefore,
    };
}

const history: AgentTextMessage[] = Array.from({ length: 10_000 }, (_, index) => ({
    kind: 'agent-text',
    id: `message-${index}`,
    localId: null,
    createdAt: 10_000 - index,
    text: `message ${index}`,
}));
const historyMap = Object.fromEntries(history.map((message) => [message.id, message]));
const iterations = 200;

const legacy = measure(iterations, (iteration) => {
    const target = history[iteration % history.length];
    const update: AgentTextMessage = { ...target, text: `legacy ${iteration}` };
    const merged = legacyMerge(history, historyMap, [update]);
    return { merged, thinking: legacyInferThinking(merged.messages) };
});

const current = measure(iterations, (iteration) => {
    const target = history[iteration % history.length];
    const update: AgentTextMessage = { ...target, text: `current ${iteration}` };
    const runningToolCount = updateRunningToolCount(0, historyMap, [update]);
    const merged = mergeMessagesNewestFirst(history, historyMap, [update]);
    return { merged, thinking: runningToolCount > 0 };
});

const p95ImprovementPercent = Number((((legacy.p95Ms - current.p95Ms) / legacy.p95Ms) * 100).toFixed(1));
process.stdout.write(`${JSON.stringify({
    runtime: process.version,
    historyMessages: history.length,
    iterations,
    legacy,
    current,
    p95ImprovementPercent,
}, null, 2)}\n`);
