import { describe, expect, it } from 'vitest';
import { MessageMetaSchema } from './typesMessageMeta';

describe('MessageMetaSchema', () => {
    it('accepts arbitrary permission mode keys', () => {
        const parsed = MessageMetaSchema.parse({
            permissionMode: 'team-custom-mode',
            model: 'custom-model',
        });

        expect(parsed.permissionMode).toBe('team-custom-mode');
        expect(parsed.model).toBe('custom-model');
    });

    it('accepts completed-turn final answer provenance', () => {
        expect(MessageMetaSchema.parse({
            turnStatus: 'completed',
            finalTextId: 'answer-1',
        })).toEqual({
            turnStatus: 'completed',
            finalTextId: 'answer-1',
        });
    });
});
