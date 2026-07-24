import { describe, expect, it, vi } from 'vitest';

import { routeCodexUserMessage } from './routeCodexUserMessage';

describe('routeCodexUserMessage', () => {
    const mode = { permissionMode: 'default' as const, model: undefined };

    it('steers mobile guidance into an active turn without queuing a new turn', async () => {
        const client = {
            hasSteerableActiveTurn: vi.fn(() => true),
            steerActiveTurn: vi.fn(async () => ({ steered: true as const, turnId: 'turn-1' })),
        };
        const queue = { push: vi.fn() };

        await expect(routeCodexUserMessage({
            client,
            queue,
            text: 'Please focus on the failing tests first.',
            mode,
            clientUserMessageId: 'local-1',
        })).resolves.toBe('steered');

        expect(client.steerActiveTurn).toHaveBeenCalledWith('Please focus on the failing tests first.', {
            clientUserMessageId: 'local-1',
        });
        expect(queue.push).not.toHaveBeenCalled();
    });

    it('queues the message when no active steerable turn exists', async () => {
        const client = {
            hasSteerableActiveTurn: vi.fn(() => false),
            steerActiveTurn: vi.fn(),
        };
        const queue = { push: vi.fn() };

        await expect(routeCodexUserMessage({
            client,
            queue,
            text: 'Start the next step.',
            mode,
        })).resolves.toBe('queued');

        expect(client.steerActiveTurn).not.toHaveBeenCalled();
        expect(queue.push).toHaveBeenCalledWith('Start the next step.', mode);
    });

    it('falls back to queueing when the official turn rejects steering', async () => {
        const client = {
            hasSteerableActiveTurn: vi.fn(() => true),
            steerActiveTurn: vi.fn(async () => ({ steered: false as const, reason: 'rejected' as const })),
        };
        const queue = { push: vi.fn() };

        await expect(routeCodexUserMessage({
            client,
            queue,
            text: 'Follow up as a normal next turn.',
            mode,
            clientUserMessageId: 'local-2',
        })).resolves.toBe('queued');

        expect(queue.push).toHaveBeenCalledWith('Follow up as a normal next turn.', mode);
    });
});
