import { decodeBase64 } from '@/encryption/base64';

const ACCOUNT_QR_PREFIXES = [
    'agenthub:///account?',
    'agenthub://account?',
    'agenthub:/account?',
];

export function parseAccountQrUrl(url: string): Uint8Array | null {
    const prefix = ACCOUNT_QR_PREFIXES.find((candidate) => url.startsWith(candidate));
    if (!prefix) {
        return null;
    }

    const encodedPublicKey = url.slice(prefix.length).trim();
    if (!encodedPublicKey) {
        return null;
    }

    try {
        return decodeBase64(encodedPublicKey, 'base64url');
    } catch {
        return null;
    }
}

export function isAccountQrUrl(url: string): boolean {
    return parseAccountQrUrl(url) !== null;
}
