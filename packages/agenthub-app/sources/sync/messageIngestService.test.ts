import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageIngestService } from './messageIngestService';

describe('MessageIngestService', () => {
    beforeEach(() => {
        vi.useRealTimers();
    });

    it('ignores empty batches', async () => {
        const applyMessages = vi.fn();
        const service = new MessageIngestService(applyMessages);

        service.enqueue('s1', []);
        await Promise.resolve();

        expect(applyMessages).not.toHaveBeenCalled();
    });

    it('coalesces queued batches per scheduled processing turn', async () => {
        const applied: Array<{ sessionId: string; messages: unknown[] }> = [];
        const service = new MessageIngestService((sessionId, messages) => {
            applied.push({ sessionId, messages });
        });

        service.enqueue('s1', [{ id: 'm1' } as any]);
        service.enqueue('s1', [{ id: 'm2' } as any]);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(applied).toEqual([
            { sessionId: 's1', messages: [{ id: 'm1' }, { id: 'm2' }] },
        ]);
    });

    it('flushes queued messages before resolving', async () => {
        const applied: Array<{ sessionId: string; messages: unknown[] }> = [];
        const service = new MessageIngestService((sessionId, messages) => {
            applied.push({ sessionId, messages });
        });

        service.enqueue('s1', [{ id: 'm1' } as any]);
        await service.flush('s1');

        expect(applied).toEqual([
            { sessionId: 's1', messages: [{ id: 'm1' }] },
        ]);
    });

    it('retains a failed scheduled batch and retries it on the next enqueue', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const applyMessages = vi.fn()
            .mockImplementationOnce(() => {
                throw new Error('store unavailable');
            })
            .mockImplementation(() => undefined);
        const service = new MessageIngestService(applyMessages);

        service.enqueue('s1', [{ id: 'm1' } as any]);
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(applyMessages).toHaveBeenCalledTimes(1);

        service.enqueue('s1', [{ id: 'm2' } as any]);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(applyMessages).toHaveBeenCalledTimes(2);
        expect(applyMessages.mock.calls[1]).toEqual([
            's1',
            [{ id: 'm1' }, { id: 'm2' }],
        ]);
        expect(errorSpy).toHaveBeenCalledOnce();
        errorSpy.mockRestore();
    });

    it('retains a failed flush batch for an explicit retry', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const applyMessages = vi.fn()
            .mockImplementationOnce(() => {
                throw new Error('store unavailable');
            })
            .mockImplementationOnce(() => {
                throw new Error('store unavailable');
            })
            .mockImplementation(() => undefined);
        const service = new MessageIngestService(applyMessages);

        service.enqueue('s1', [{ id: 'm1' } as any]);
        await expect(service.flush('s1')).rejects.toThrow('store unavailable');
        await expect(service.flush('s1')).resolves.toBeUndefined();

        expect(applyMessages).toHaveBeenLastCalledWith('s1', [{ id: 'm1' }]);
        expect(errorSpy).toHaveBeenCalledOnce();
        errorSpy.mockRestore();
    });

    it('clears pending session state', async () => {
        const applyMessages = vi.fn();
        const service = new MessageIngestService(applyMessages);

        service.enqueue('s1', [{ id: 'm1' } as any]);
        service.clearSession('s1');
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(applyMessages).not.toHaveBeenCalled();
    });

    it('clears all pending account queues idempotently', async () => {
        const applyMessages = vi.fn();
        const service = new MessageIngestService(applyMessages);

        service.enqueue('account-a-session-1', [{ id: 'm1' } as any]);
        service.enqueue('account-a-session-2', [{ id: 'm2' } as any]);
        service.clearAll();
        service.clearAll();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(applyMessages).not.toHaveBeenCalled();
    });
});
