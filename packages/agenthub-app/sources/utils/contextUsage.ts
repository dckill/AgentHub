import type { Metadata } from '@/sync/storageTypes';

type ContextUsageInput = {
    contextSize?: number | null;
    contextWindow?: number | null;
    flavor?: string | null;
    modelKey?: string | null;
    metadata?: Metadata | null;
};

function finitePositive(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeModel(value?: string | null): string {
    return (value ?? '').trim().toLowerCase();
}

function inferClaudeContextWindow(modelKey?: string | null): number {
    const model = normalizeModel(modelKey);
    const extendedContextModels = [
        'sonnet-4-6',
        'sonnet-4.6',
        'opus-4-6',
        'opus-4.6',
        'opus-4-7',
        'opus-4.7',
        'fable-5',
        'mythos-5',
    ];
    if (
        extendedContextModels.some((extendedModel) => model.includes(extendedModel))
        || model.includes('1m')
        || model.includes('1000000')
    ) {
        return 1_000_000;
    }
    return 200_000;
}

function inferCodexContextWindow(modelKey?: string | null): number | null {
    const model = normalizeModel(modelKey);
    if (!model || model === 'default') {
        return 1_050_000;
    }
    if (model.includes('gpt-5.5') || model.includes('gpt-5.4')) {
        return 1_050_000;
    }
    if (model.includes('gpt-5')) {
        return 400_000;
    }
    return null;
}

export function resolveContextWindow(input: ContextUsageInput): number | null {
    const reported = finitePositive(input.contextWindow);
    if (reported) {
        return reported;
    }

    const metadataWindow = finitePositive((input.metadata as { contextWindow?: unknown } | null | undefined)?.contextWindow);
    if (metadataWindow) {
        return metadataWindow;
    }

    const flavor = normalizeModel(input.flavor ?? input.metadata?.flavor);
    const modelKey = input.modelKey ?? input.metadata?.currentModelCode ?? null;

    if (flavor === 'codex' || flavor === 'gpt' || flavor === 'openai') {
        return inferCodexContextWindow(modelKey);
    }
    if (flavor === 'claude') {
        return inferClaudeContextWindow(modelKey);
    }

    return null;
}

export function getContextUsagePercent(input: ContextUsageInput): number | null {
    const contextSize = finitePositive(input.contextSize);
    const contextWindow = resolveContextWindow(input);
    if (!contextSize || !contextWindow) {
        return null;
    }
    return Math.max(1, Math.min(100, Math.round((contextSize / contextWindow) * 100)));
}

export function getContextRemainingPercent(input: ContextUsageInput): number | null {
    const contextSize = finitePositive(input.contextSize);
    const contextWindow = resolveContextWindow(input);
    if (!contextSize || !contextWindow) {
        return null;
    }
    return Math.max(0, Math.min(100, Math.round(100 - (contextSize / contextWindow) * 100)));
}
