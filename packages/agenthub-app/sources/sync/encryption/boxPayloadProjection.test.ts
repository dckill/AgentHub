import { describe, expect, it } from 'vitest';
import { decryptBoxItem, projectBoxPayload } from './boxPayloadProjection';

describe('projectBoxPayload', () => {
    it('returns null for decrypted bytes that are not JSON', () => {
        expect(projectBoxPayload(new TextEncoder().encode('not-json'))).toBeNull();
    });

    it('parses valid JSON payloads', () => {
        expect(projectBoxPayload(new TextEncoder().encode('{"ok":true}'))).toEqual({ ok: true });
    });

    it('fails closed when item decryption throws', () => {
        expect(decryptBoxItem(new Uint8Array([1]), () => {
            throw new Error('malformed bundle');
        })).toBeNull();
    });

    it('projects a successfully decrypted item', () => {
        expect(decryptBoxItem(new Uint8Array([1]), () => new TextEncoder().encode('{"ok":true}')))
            .toEqual({ ok: true });
    });
});
