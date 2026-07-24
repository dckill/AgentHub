import { decodeBase64 } from '@/encryption/base64';
import { parseAccountQrUrl } from './accountQrUrl';

const TERMINAL_QR_PREFIXES = [
    'agenthub://terminal?',
    'agenthub:///terminal?',
    'agenthub:/terminal?',
];

export type ParsedAuthQrUrl =
    | { type: 'account'; publicKey: Uint8Array }
    | { type: 'terminal'; publicKey: Uint8Array };

export function parseTerminalQrUrl(url: string): Uint8Array | null {
    const prefix = TERMINAL_QR_PREFIXES.find((candidate) => url.startsWith(candidate));
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

export function parseAuthQrUrl(url: string): ParsedAuthQrUrl | null {
    const accountPublicKey = parseAccountQrUrl(url);
    if (accountPublicKey) {
        return { type: 'account', publicKey: accountPublicKey };
    }

    const terminalPublicKey = parseTerminalQrUrl(url);
    if (terminalPublicKey) {
        return { type: 'terminal', publicKey: terminalPublicKey };
    }

    return null;
}
