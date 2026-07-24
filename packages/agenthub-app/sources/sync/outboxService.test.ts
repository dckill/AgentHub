import { describe, expect, it } from 'vitest';
import { OutboxService } from './outboxService';

describe('OutboxService', () => {
    it('tracks queued messages and active sends as pending work', () => {
        const outbox = new OutboxService();

        expect(outbox.hasPending()).toBe(false);
        outbox.enqueue('s1', { localId: 'l1', content: 'hello' });
        expect(outbox.getPending('s1')).toEqual([{ localId: 'l1', content: 'hello' }]);
        expect(outbox.hasPending()).toBe(true);

        outbox.deletePending('s1');
        const controller = outbox.startSend('s1');
        expect(controller.signal.aborted).toBe(false);
        expect(outbox.hasPending()).toBe(true);
        outbox.finishSend('s1', controller);
        expect(outbox.hasPending()).toBe(false);
    });

    it('aborts active sends and returns sessions whose queues were cleared', () => {
        const outbox = new OutboxService();
        outbox.enqueue('s1', { localId: 'l1', content: 'hello' });
        outbox.enqueue('s2', { localId: 'l2', content: 'world' });
        const controller = outbox.startSend('s3');

        expect(outbox.failAll().sort()).toEqual(['s1', 's2']);
        expect(controller.signal.aborted).toBe(true);
        expect(outbox.hasPending()).toBe(false);
    });

    it('does not let an account A completion clear account B send state', () => {
        const outbox = new OutboxService();
        const accountAController = outbox.startSend('same-session');
        outbox.failAll();
        const accountBController = outbox.startSend('same-session');

        outbox.finishSend('same-session', accountAController);

        expect(accountBController.signal.aborted).toBe(false);
        expect(outbox.hasPending()).toBe(true);
    });
});
