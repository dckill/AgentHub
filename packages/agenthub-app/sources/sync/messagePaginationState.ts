/** Cursor and sequence state shared by latest/older message pagination. */
export class MessagePaginationState {
    private readonly lastSeq = new Map<string, number>();
    private readonly firstSeq = new Map<string, number>();
    private readonly hasMoreBefore = new Map<string, boolean>();

    getLastSeq(sessionId: string): number | undefined {
        return this.lastSeq.get(sessionId);
    }

    setLastSeq(sessionId: string, seq: number): void {
        this.lastSeq.set(sessionId, seq);
    }

    getFirstSeq(sessionId: string): number | undefined {
        return this.firstSeq.get(sessionId);
    }

    setFirstSeq(sessionId: string, seq: number): void {
        this.firstSeq.set(sessionId, seq);
    }

    getHasMoreBefore(sessionId: string): boolean | undefined {
        return this.hasMoreBefore.get(sessionId);
    }

    setHasMoreBefore(sessionId: string, hasMore: boolean): void {
        this.hasMoreBefore.set(sessionId, hasMore);
    }

    clearSession(sessionId: string): void {
        this.lastSeq.delete(sessionId);
        this.firstSeq.delete(sessionId);
        this.hasMoreBefore.delete(sessionId);
    }

    clearAll(): void {
        this.lastSeq.clear();
        this.firstSeq.clear();
        this.hasMoreBefore.clear();
    }
}
