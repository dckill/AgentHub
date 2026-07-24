export type AccountRequest = {
    signal: AbortSignal;
    assertCurrent: () => void;
};

export class AccountLifecycle {
    private generation = 0;
    private active = false;
    private requests = new Set<AbortController>();

    begin(): number {
        this.end();
        this.generation += 1;
        this.active = true;
        return this.generation;
    }

    end(): void {
        if (!this.active) {
            return;
        }
        this.active = false;
        this.generation += 1;
        for (const controller of this.requests) {
            controller.abort();
        }
        this.requests.clear();
    }

    isActive(): boolean {
        return this.active;
    }

    isCurrent(generation: number): boolean {
        return this.active && this.generation === generation;
    }

    currentGeneration(): number | null {
        return this.active ? this.generation : null;
    }

    scopedKey(generation: number, resourceId: string): string {
        return `${generation}\u0000${resourceId}`;
    }

    assertCurrent(generation: number): void {
        if (!this.isCurrent(generation)) {
            throw new DOMException('Account lifecycle is stale', 'AbortError');
        }
    }

    createRequest(generation: number): { signal: AbortSignal; assertCurrent: () => void; release: () => void } {
        this.assertCurrent(generation);
        const controller = new AbortController();
        this.requests.add(controller);
        let released = false;
        return {
            signal: controller.signal,
            assertCurrent: () => this.assertCurrent(generation),
            release: () => {
                if (released) {
                    return;
                }
                released = true;
                this.requests.delete(controller);
            },
        };
    }

    async runRequest<T>(generation: number, operation: (request: AccountRequest) => Promise<T>): Promise<T> {
        const request = this.createRequest(generation);
        try {
            const result = await operation(request);
            request.assertCurrent();
            return result;
        } finally {
            request.release();
        }
    }

    runIfCurrent(generation: number, task: () => void): void {
        if (this.isCurrent(generation)) {
            task();
        }
    }
}
