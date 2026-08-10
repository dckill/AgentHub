export type DataKeyScope = 'session' | 'machine' | 'artifact';

/**
 * Keeps decrypted data keys scoped to their owning resource type.
 *
 * The registry intentionally stores the original Uint8Array reference, matching
 * the previous Sync-local Maps while making lifecycle cleanup explicit and
 * keeping key ownership out of the orchestration class.
 */
export class DataKeyRegistry {
    private readonly keys: Record<DataKeyScope, Map<string, Uint8Array>> = {
        session: new Map(),
        machine: new Map(),
        artifact: new Map(),
    };

    get(scope: DataKeyScope, id: string): Uint8Array | undefined {
        return this.keys[scope].get(id);
    }

    set(scope: DataKeyScope, id: string, key: Uint8Array): void {
        this.keys[scope].set(id, key);
    }

    delete(scope: DataKeyScope, id: string): void {
        this.keys[scope].delete(id);
    }

    clear(): void {
        for (const keys of Object.values(this.keys)) {
            keys.clear();
        }
    }
}
