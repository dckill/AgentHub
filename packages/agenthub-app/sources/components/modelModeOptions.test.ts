import { describe, expect, it } from 'vitest';

import {
    getAvailableModels,
    getAvailablePermissionModes,
    getCodexModelModes,
    getEffortLevelsForModel,
    getClaudePermissionModes,
    mapMetadataOptions,
    resolveCurrentOption,
} from './modelModeOptions';

const translate = (key: string) => key === 'agentInput.model.defaultModel' ? 'default model' : `tr:${key}`;

describe('modelModeOptions', () => {
    it('maps metadata option shape into mode options', () => {
        expect(mapMetadataOptions([
            { code: 'm1', value: 'Model One', description: 'Primary model' },
            { code: 'm2', value: 'Model Two' },
        ])).toEqual([
            { key: 'm1', name: 'Model One', description: 'Primary model' },
            { key: 'm2', name: 'Model Two', description: null },
        ]);
    });

    it('builds claude permission fallbacks with translated names', () => {
        const modes = getClaudePermissionModes(translate);
        expect(modes.map((mode) => mode.key)).toEqual(['default', 'plan', 'dontAsk', 'acceptEdits', 'bypassPermissions']);
        expect(modes[0].name).toBe('tr:agentInput.permissionMode.default');
    });

    it('builds codex model fallbacks', () => {
        const models = getCodexModelModes();
        expect(models.map((model) => model.key)).toEqual(['default']);
        expect(models[0].name).toBe('default model');
    });

    it('prefers metadata models for supported agents', () => {
        const models = getAvailableModels('claude', {
            models: [
                { code: 'custom-claude', value: 'Claude Custom', description: 'From metadata' },
            ],
        } as any, translate);

        expect(models).toEqual([
            { key: 'custom-claude', name: 'Claude Custom', description: 'From metadata' },
        ]);
    });

    it('ignores unsupported agent metadata models and falls back to claude', () => {
        const models = getAvailableModels('legacy-provider', {
            models: [
                { code: 'custom-legacy', value: 'Legacy Custom', description: 'From metadata' },
            ],
        } as any, translate);

        expect(models.map((model) => model.key)).toEqual(['default', 'opus', 'sonnet', 'haiku']);
    });

    it('adds codex default model option when metadata models are present', () => {
        const models = getAvailableModels('codex', {
            models: [
                { code: 'gpt-5.4', value: 'gpt-5.4', description: 'Latest' },
            ],
        } as any, translate);

        expect(models).toEqual([
            { key: 'default', name: 'default model', description: null },
            { key: 'gpt-5.4', name: 'gpt-5.4', description: 'Latest' },
        ]);
    });

    it('uses runtime reasoning efforts for the selected Codex model', () => {
        const models = getAvailableModels('codex', {
            models: [{
                code: 'gpt-latest',
                value: 'GPT Latest',
                supportedReasoningEfforts: [
                    { code: 'medium', value: 'Balanced', description: 'Good default' },
                    { code: 'high', value: 'Deep', description: null },
                ],
                defaultReasoningEffortCode: 'medium',
            }],
        } as any, translate);

        expect(getEffortLevelsForModel('codex', 'gpt-latest', translate, models)).toEqual([
            { key: 'medium', name: 'Balanced', description: 'Good default' },
            { key: 'high', name: 'Deep', description: null },
        ]);
    });

    it('keeps codex permission modes hardcoded even when metadata modes exist', () => {
        const modes = getAvailablePermissionModes('codex', {
            operatingModes: [{ code: 'metadata-only', value: 'Metadata Mode', description: null }],
        } as any, translate);

        expect(modes.map((mode) => mode.key)).toEqual(['default', 'read-only', 'safe-yolo', 'yolo']);
    });

    it('ignores unsupported agent metadata permission modes and falls back to claude', () => {
        const modes = getAvailablePermissionModes('legacy-provider', {
            operatingModes: [
                { code: 'build', value: 'build, build', description: 'Do build steps' },
                { code: 'plan', value: 'plan/plan', description: 'Plan first' },
            ],
        } as any, translate);

        expect(modes.map((mode) => mode.key)).toEqual(['default', 'plan', 'dontAsk', 'acceptEdits', 'bypassPermissions']);
    });

    it('resolves the first matching preferred key', () => {
        const options = [
            { key: 'a', name: 'A' },
            { key: 'b', name: 'B' },
        ];

        expect(resolveCurrentOption(options, ['missing', 'b', 'a'])).toEqual({ key: 'b', name: 'B' });
        expect(resolveCurrentOption(options, ['missing'])).toBeNull();
    });
});
