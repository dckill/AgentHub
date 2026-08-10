import { describe, expect, it, vi } from 'vitest';
import { validateSocketScope } from './socketScope';

describe('validateSocketScope', () => {
    it('rejects a session-scoped socket when the session belongs to another account', async () => {
        const db = {
            session: { findUnique: vi.fn().mockResolvedValue(null) },
            machine: { findUnique: vi.fn() },
        };

        await expect(validateSocketScope({
            db,
            userId: 'user-1',
            clientType: 'session-scoped',
            sessionId: 'session-1',
        })).resolves.toBe(false);

        expect(db.session.findUnique).toHaveBeenCalledWith({
            where: { id: 'session-1', accountId: 'user-1' },
            select: { id: true },
        });
    });

    it('accepts an owned machine-scoped socket', async () => {
        const db = {
            session: { findUnique: vi.fn() },
            machine: { findUnique: vi.fn().mockResolvedValue({ id: 'machine-1' }) },
        };

        await expect(validateSocketScope({
            db,
            userId: 'user-1',
            clientType: 'machine-scoped',
            machineId: 'machine-1',
        })).resolves.toBe(true);

        expect(db.machine.findUnique).toHaveBeenCalledWith({
            where: { accountId_id: { accountId: 'user-1', id: 'machine-1' } },
            select: { id: true },
        });
    });
});
