export type InitializationGateState = 'idle' | 'loading' | 'ready';

export class RecoverableInitializationGate {
    private initialized = false;
    private pending: Promise<void> | null = null;

    get state(): InitializationGateState {
        if (this.pending) return 'loading';
        return this.initialized ? 'ready' : 'idle';
    }

    async run(operation: () => Promise<void>, rollback: () => Promise<void> | void): Promise<void> {
        if (this.initialized) return;
        if (this.pending) return await this.pending;

        const attempt = operation();
        this.pending = attempt;
        try {
            await attempt;
            this.initialized = true;
        } catch (error) {
            this.initialized = false;
            try {
                await rollback();
            } catch (rollbackError) {
                throw new AggregateError([error, rollbackError], 'Initialization and rollback both failed');
            }
            throw error;
        } finally {
            if (this.pending === attempt) this.pending = null;
        }
    }

    async reset(cleanup: () => Promise<void> | void): Promise<void> {
        const pending = this.pending;
        const cleanupErrors: unknown[] = [];
        try {
            await cleanup();
        } catch (error) {
            cleanupErrors.push(error);
        }
        if (pending) {
            try {
                await pending;
            } catch {
                // run() propagates the initialization error to its own caller.
            }
        }
        try {
            await cleanup();
        } catch (error) {
            cleanupErrors.push(error);
        } finally {
            this.initialized = false;
            this.pending = null;
        }
        if (cleanupErrors.length === 1) throw cleanupErrors[0];
        if (cleanupErrors.length > 1) throw new AggregateError(cleanupErrors, 'Initialization cleanup failed');
    }
}
