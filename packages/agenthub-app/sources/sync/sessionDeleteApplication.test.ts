import { describe, expect, it, vi } from 'vitest';
import { applySessionDelete } from './sessionDeleteApplication';

describe('applySessionDelete', () => {
    it('applies storage, encryption, project and resource cleanup in order', () => {
        const order: string[] = [];

        applySessionDelete('session-1', {
            deleteSession: () => order.push('storage'),
            removeSessionEncryption: () => order.push('encryption'),
            removeProjectSession: () => order.push('project'),
            cleanupResources: () => order.push('resources'),
        });

        expect(order).toEqual(['storage', 'encryption', 'project', 'resources']);
    });

    it('passes the same session id to every cleanup action', () => {
        const actions = {
            deleteSession: vi.fn(),
            removeSessionEncryption: vi.fn(),
            removeProjectSession: vi.fn(),
            cleanupResources: vi.fn(),
        };

        applySessionDelete('session-1', actions);

        for (const action of Object.values(actions)) {
            expect(action).toHaveBeenCalledWith('session-1');
        }
    });
});
