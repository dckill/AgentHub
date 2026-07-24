import { getRandomBytes } from 'expo-crypto';
import { decodeBase64, encodeBase64 } from '@/encryption/base64';
import { decryptSecretBox, encryptSecretBox } from '@/encryption/libsodium';
import sodium from '@/encryption/libsodium.lib';

const SHARE_KEY_BYTES = 32;
const MAX_CIPHERTEXT_BYTES = 64 * 1024;
const SHARE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64URL_KEY = /^[A-Za-z0-9_-]{43}$/;

export type SelectedTextSharePayload = {
    version: 1;
    scope: 'selected-text';
    text: string;
    createdAt: number;
};

export async function prepareExternalShareCrypto(): Promise<void> {
    await sodium.ready;
}

function parseTrustedHttpsOrigin(value: string): URL {
    const url = new URL(value);
    if (
        url.protocol !== 'https:'
        || url.username
        || url.password
        || url.search
        || url.hash
        || (url.pathname !== '/' && url.pathname !== '')
    ) {
        throw new Error('Invalid share origin');
    }
    return url;
}

function requireShareId(id: string): string {
    if (!SHARE_ID.test(id)) throw new Error('Invalid share id');
    return id.toLowerCase();
}

function isSelectedTextPayload(value: unknown): value is SelectedTextSharePayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return Object.keys(record).length === 4
        && record.version === 1
        && record.scope === 'selected-text'
        && typeof record.text === 'string'
        && record.text.trim().length > 0
        && typeof record.createdAt === 'number'
        && Number.isSafeInteger(record.createdAt)
        && record.createdAt >= 0;
}

export function createEncryptedSelectedTextShare(
    text: string,
    createdAt: number = Date.now(),
): { ciphertext: Uint8Array; key: Uint8Array } {
    if (!text.trim()) throw new Error('Empty share');
    if (!Number.isSafeInteger(createdAt) || createdAt < 0) throw new Error('Invalid timestamp');
    const payload: SelectedTextSharePayload = { version: 1, scope: 'selected-text', text, createdAt };
    const key = getRandomBytes(SHARE_KEY_BYTES);
    const ciphertext = encryptSecretBox(payload, key);
    if (ciphertext.byteLength > MAX_CIPHERTEXT_BYTES) throw new Error('Share too large');
    return { ciphertext, key };
}

export function decryptSelectedTextShare(
    ciphertext: Uint8Array,
    key: Uint8Array,
): SelectedTextSharePayload | null {
    if (key.byteLength !== SHARE_KEY_BYTES || ciphertext.byteLength === 0 || ciphertext.byteLength > MAX_CIPHERTEXT_BYTES) {
        return null;
    }
    const payload = decryptSecretBox(ciphertext, key);
    return isSelectedTextPayload(payload) ? payload : null;
}

export function buildExternalShareLink(origin: string, id: string, key: Uint8Array): string {
    const trusted = parseTrustedHttpsOrigin(origin);
    const safeId = requireShareId(id);
    if (key.byteLength !== SHARE_KEY_BYTES) throw new Error('Invalid share key');
    return `${trusted.origin}/share/${safeId}#key=${encodeBase64(key, 'base64url')}`;
}

export function parseExternalShareLink(
    value: string,
    expectedOrigin: string,
): { id: string; key: Uint8Array } | null {
    try {
        const trusted = parseTrustedHttpsOrigin(expectedOrigin);
        const candidate = new URL(value);
        if (
            candidate.protocol !== 'https:'
            || candidate.origin !== trusted.origin
            || candidate.username
            || candidate.password
            || candidate.search
        ) return null;
        const match = candidate.pathname.match(/^\/share\/([^/]+)$/);
        const fragment = candidate.hash.match(/^#key=([A-Za-z0-9_-]+)$/);
        if (!match || !fragment || !BASE64URL_KEY.test(fragment[1])) return null;
        const id = requireShareId(decodeURIComponent(match[1]));
        const key = decodeBase64(fragment[1], 'base64url');
        return key.byteLength === SHARE_KEY_BYTES ? { id, key } : null;
    } catch {
        return null;
    }
}

export function consumeExternalShareFragment(options: {
    href: string;
    expectedOrigin: string;
    replaceState: (url: string) => void;
}): { id: string; key: Uint8Array } | null {
    const parsed = parseExternalShareLink(options.href, options.expectedOrigin);
    if (!parsed) return null;
    const current = new URL(options.href);
    options.replaceState(`${current.origin}${current.pathname}`);
    return parsed;
}
