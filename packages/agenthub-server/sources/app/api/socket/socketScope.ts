type SocketScopeDb = {
    session: { findUnique: (args: any) => Promise<unknown> };
    machine: { findUnique: (args: any) => Promise<unknown> };
};

type SocketScopeInput = {
    db: SocketScopeDb;
    userId: string;
    clientType: 'session-scoped' | 'user-scoped' | 'machine-scoped' | undefined;
    sessionId?: string;
    machineId?: string;
};

export async function validateSocketScope(input: SocketScopeInput): Promise<boolean> {
    if (input.clientType === 'session-scoped' && input.sessionId) {
        const session = await input.db.session.findUnique({
            where: { id: input.sessionId, accountId: input.userId },
            select: { id: true },
        });
        return Boolean(session);
    }

    if (input.clientType === 'machine-scoped' && input.machineId) {
        const machine = await input.db.machine.findUnique({
            where: { accountId_id: { accountId: input.userId, id: input.machineId } },
            select: { id: true },
        });
        return Boolean(machine);
    }

    return input.clientType !== 'session-scoped' && input.clientType !== 'machine-scoped';
}
