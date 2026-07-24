import type { Metadata } from '@/sync/storageTypes';
import { hackModes } from '@/sync/modeHacks';
import { coerceSupportedClientAgent, isSupportedClientAgent, type SupportedClientAgent } from '@/sync/agentTypes';

export type ModeOption = {
    key: string;
    name: string;
    description?: string | null;
    supportedReasoningEfforts?: EffortLevel[];
    defaultReasoningEffortCode?: string;
    isDefault?: boolean;
};

export type PermissionMode = ModeOption;
export type ModelMode = ModeOption;

export type EffortLevel = ModeOption;
export type PermissionModeKey = string;
export type ModelModeKey = string;

export type AgentFlavor = SupportedClientAgent | string | null | undefined;

type Translate = (key: any) => string;

type MetadataOption = {
    code: string;
    value: string;
    description?: string | null;
    supportedReasoningEfforts?: MetadataOption[];
    defaultReasoningEffortCode?: string;
    isDefault?: boolean;
};

type RuntimeCodexModel = {
    model: string;
    displayName: string;
    description?: string | null;
    isDefault?: boolean;
    supportedReasoningEfforts?: Array<{
        reasoningEffort: string;
        description?: string | null;
    }>;
    defaultReasoningEffort?: string;
};

const FALLBACK_TRANSLATIONS: Record<string, string> = {
    'agentInput.model.defaultModel': 'default model',
    'agentInput.effort.low': 'low',
    'agentInput.effort.medium': 'medium',
    'agentInput.effort.high': 'high',
    'agentInput.effort.max': 'max',
};

function fallbackTranslate(key: string): string {
    return FALLBACK_TRANSLATIONS[key] ?? key;
}

function defaultModel(translate: Translate): ModelMode {
    return { key: 'default', name: translate('agentInput.model.defaultModel'), description: null };
}

export function mapMetadataOptions(options?: MetadataOption[] | null): ModeOption[] {
    if (!options || options.length === 0) {
        return [];
    }

    return options.map((option) => ({
        key: option.code,
        name: option.value,
        description: option.description ?? null,
        supportedReasoningEfforts: option.supportedReasoningEfforts
            ? mapMetadataOptions(option.supportedReasoningEfforts)
            : undefined,
        defaultReasoningEffortCode: option.defaultReasoningEffortCode,
        isDefault: option.isDefault,
    }));
}

export function getClaudePermissionModes(translate: Translate): PermissionMode[] {
    return [
        { key: 'default', name: translate('agentInput.permissionMode.default'), description: null },
        { key: 'plan', name: translate('agentInput.permissionMode.plan'), description: null },
        { key: 'dontAsk', name: translate('agentInput.permissionMode.dontAsk'), description: null },
        { key: 'acceptEdits', name: translate('agentInput.permissionMode.acceptEdits'), description: null },
        { key: 'bypassPermissions', name: translate('agentInput.permissionMode.bypassPermissions'), description: null },
    ];
}

export function getCodexPermissionModes(translate: Translate): PermissionMode[] {
    return [
        { key: 'default', name: translate('agentInput.codexPermissionMode.default'), description: null },
        { key: 'read-only', name: translate('agentInput.codexPermissionMode.readOnly'), description: null },
        { key: 'safe-yolo', name: translate('agentInput.codexPermissionMode.safeYolo'), description: null },
        { key: 'yolo', name: translate('agentInput.codexPermissionMode.yolo'), description: null },
    ];
}

export function getClaudeModelModes(translate: Translate = fallbackTranslate): ModelMode[] {
    return [
        defaultModel(translate),
        { key: 'opus', name: 'opus 4.7', description: null },
        { key: 'sonnet', name: 'sonnet 4.6', description: null },
        { key: 'haiku', name: 'haiku 4.5', description: null },
    ];
}

export function getCodexModelModes(translate: Translate = fallbackTranslate): ModelMode[] {
    return [defaultModel(translate)];
}

export function getCodexRuntimeModelModes(
    models: readonly RuntimeCodexModel[],
    translate: Translate = fallbackTranslate,
): ModelMode[] {
    const runtimeDefault = models.find((model) => model.isDefault);
    const mapEfforts = (model: RuntimeCodexModel | undefined) => model?.supportedReasoningEfforts?.map((effort) => ({
        key: effort.reasoningEffort,
        name: effort.reasoningEffort,
        description: effort.description ?? null,
    }));
    return [
        {
            ...defaultModel(translate),
            supportedReasoningEfforts: mapEfforts(runtimeDefault),
            defaultReasoningEffortCode: runtimeDefault?.defaultReasoningEffort,
        },
        ...models.map((model) => ({
            key: model.model,
            name: model.displayName || model.model,
            description: model.description ?? null,
            isDefault: model.isDefault,
            supportedReasoningEfforts: mapEfforts(model),
            defaultReasoningEffortCode: model.defaultReasoningEffort,
        })),
    ];
}

export function getHardcodedPermissionModes(flavor: AgentFlavor, translate: Translate): PermissionMode[] {
    if (flavor === 'codex') {
        return getCodexPermissionModes(translate);
    }
    return getClaudePermissionModes(translate);
}

export function getHardcodedModelModes(flavor: AgentFlavor, translate: Translate = fallbackTranslate): ModelMode[] {
    if (flavor === 'codex') {
        return getCodexModelModes(translate);
    }
    return getClaudeModelModes(translate);
}

export function getAvailableModels(
    flavor: AgentFlavor,
    metadata: Metadata | null | undefined,
    translate: Translate,
): ModelMode[] {
    const supportedFlavor = coerceSupportedClientAgent(flavor);
    const metadataModels = mapMetadataOptions(metadata?.models);
    if (isSupportedClientAgent(flavor) && metadataModels.length > 0) {
        if (supportedFlavor === 'codex' && !metadataModels.some((model) => model.key === 'default')) {
            return [defaultModel(translate), ...metadataModels];
        }
        return metadataModels;
    }
    return getHardcodedModelModes(supportedFlavor, translate);
}

export function getAvailablePermissionModes(
    flavor: AgentFlavor,
    _metadata: Metadata | null | undefined,
    translate: Translate,
): PermissionMode[] {
    return hackModes(getHardcodedPermissionModes(coerceSupportedClientAgent(flavor), translate));
}

export function findOptionByKey<T extends ModeOption>(options: T[], key: string | null | undefined): T | null {
    if (!key) {
        return null;
    }
    return options.find((option) => option.key === key) ?? null;
}

export function resolveCurrentOption<T extends ModeOption>(
    options: T[],
    preferredKeys: Array<string | null | undefined>,
): T | null {
    for (const key of preferredKeys) {
        const option = findOptionByKey(options, key);
        if (option) {
            return option;
        }
    }
    return null;
}

export function getDefaultModelKey(flavor: AgentFlavor): string {
    if (flavor === 'codex') {
        return 'default';
    }
    return 'default';
}

export function getDefaultPermissionModeKey(_flavor: AgentFlavor): string {
    return 'default';
}

// Effort levels per agent type

export function getClaudeEffortLevels(translate: Translate = fallbackTranslate): EffortLevel[] {
    return [
        { key: 'low', name: translate('agentInput.effort.low') },
        { key: 'medium', name: translate('agentInput.effort.medium') },
        { key: 'high', name: translate('agentInput.effort.high') },
        { key: 'max', name: translate('agentInput.effort.max') },
    ];
}

export function getCodexEffortLevels(translate: Translate = fallbackTranslate): EffortLevel[] {
    return [
        { key: 'low', name: translate('agentInput.effort.low') },
        { key: 'medium', name: translate('agentInput.effort.medium') },
        { key: 'high', name: translate('agentInput.effort.high') },
        { key: 'xhigh', name: 'xhigh' },
    ];
}

export function getHardcodedEffortLevels(flavor: AgentFlavor, translate: Translate = fallbackTranslate): EffortLevel[] {
    if (flavor === 'claude') return getClaudeEffortLevels(translate);
    if (flavor === 'codex') return getCodexEffortLevels(translate);
    return [];
}

export function getDefaultEffortKey(flavor: AgentFlavor): string | null {
    if (flavor === 'claude' || flavor === 'codex') return 'high';
    return null;
}

// Per-model effort: returns effort levels for a specific model, or empty if the model has no effort
export function getEffortLevelsForModel(
    flavor: AgentFlavor,
    modelKey: string,
    translate: Translate = fallbackTranslate,
    availableModels?: ModelMode[],
): EffortLevel[] {
    if (flavor === 'claude') {
        if (modelKey === 'default') return [];
        return getClaudeEffortLevels(translate);
    }
    if (flavor === 'codex') {
        const runtimeEfforts = findOptionByKey(availableModels ?? [], modelKey)?.supportedReasoningEfforts;
        if (runtimeEfforts && runtimeEfforts.length > 0) return runtimeEfforts;
        return getCodexEffortLevels(translate);
    }
    return [];
}

// Default effort for a model — highest the model allows
export function getDefaultEffortKeyForModel(
    flavor: AgentFlavor,
    modelKey: string,
    availableModels?: ModelMode[],
): string | null {
    const runtimeDefault = findOptionByKey(availableModels ?? [], modelKey)?.defaultReasoningEffortCode;
    if (runtimeDefault) return runtimeDefault;
    const levels = getEffortLevelsForModel(flavor, modelKey, fallbackTranslate, availableModels);
    if (levels.length === 0) return null;
    return levels[levels.length - 1].key;
}

export function getSupportsWorktree(_flavor: AgentFlavor): boolean {
    return true;
}
