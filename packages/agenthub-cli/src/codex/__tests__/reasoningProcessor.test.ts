import { describe, expect, it } from 'vitest';
import { ReasoningProcessor } from '../utils/reasoningProcessor';

describe('ReasoningProcessor', () => {
    it('emits a titled reasoning tool call and completed result', () => {
        const messages: any[] = [];
        const processor = new ReasoningProcessor((message) => messages.push(message));

        processor.processDelta('**Plan**\n');
        processor.complete('**Plan**\ninspect the session');

        expect(messages).toHaveLength(2);
        expect(messages[0]).toMatchObject({ type: 'tool-call', name: 'CodexReasoning', input: { title: 'Plan' } });
        expect(messages[1]).toMatchObject({
            type: 'tool-call-result',
            callId: messages[0].callId,
            output: { content: 'inspect the session', status: 'completed' },
        });
    });

    it('keeps untitled reasoning as a regular reasoning message', () => {
        const messages: any[] = [];
        const processor = new ReasoningProcessor((message) => messages.push(message));

        processor.processDelta('plain thought');
        processor.complete('plain thought');

        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({ type: 'reasoning', message: 'plain thought' });
    });

    it('cancels an active titled reasoning section on abort', () => {
        const messages: any[] = [];
        const processor = new ReasoningProcessor((message) => messages.push(message));

        processor.processDelta('**Plan**');
        processor.processDelta(' ');
        processor.abort();

        expect(messages).toHaveLength(2);
        expect(messages[1]).toMatchObject({
            type: 'tool-call-result',
            callId: messages[0].callId,
            output: { status: 'canceled' },
        });
        expect(processor.hasStartedToolCall()).toBe(false);
    });
});
