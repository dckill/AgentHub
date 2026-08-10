import { describe, expect, it } from 'vitest';
import { DataKeyRegistry } from './dataKeyRegistry';

describe('DataKeyRegistry', () => {
    it('keeps data keys isolated by scope and identifier', () => {
        const registry = new DataKeyRegistry();
        const sessionKey = new Uint8Array([1, 2]);
        const machineKey = new Uint8Array([3, 4]);

        registry.set('session', 'same-id', sessionKey);
        registry.set('machine', 'same-id', machineKey);

        expect(registry.get('session', 'same-id')).toBe(sessionKey);
        expect(registry.get('machine', 'same-id')).toBe(machineKey);
        expect(registry.get('artifact', 'same-id')).toBeUndefined();
    });

    it('deletes one key and can clear every scope', () => {
        const registry = new DataKeyRegistry();
        registry.set('session', 's1', new Uint8Array([1]));
        registry.set('machine', 'm1', new Uint8Array([2]));
        registry.set('artifact', 'a1', new Uint8Array([3]));

        registry.delete('machine', 'm1');
        expect(registry.get('machine', 'm1')).toBeUndefined();
        expect(registry.get('session', 's1')).toBeDefined();

        registry.clear();
        expect(registry.get('session', 's1')).toBeUndefined();
        expect(registry.get('artifact', 'a1')).toBeUndefined();
    });
});
