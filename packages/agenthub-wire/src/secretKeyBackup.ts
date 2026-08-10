const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Encode bytes as unpadded RFC 4648 Base32 for the shared backup-key format. */
export function encodeBase32(bytes: Uint8Array): string {
    let result = '';
    let buffer = 0;
    let bufferLength = 0;

    for (const byte of bytes) {
        buffer = (buffer << 8) | byte;
        bufferLength += 8;

        while (bufferLength >= 5) {
            bufferLength -= 5;
            result += BASE32_ALPHABET[(buffer >> bufferLength) & 0x1f];
        }
    }

    if (bufferLength > 0) {
        result += BASE32_ALPHABET[(buffer << (5 - bufferLength)) & 0x1f];
    }

    return result;
}

/** Decode tolerant human-entered Base32, accepting case and visual separators. */
export function decodeBase32(value: string): Uint8Array {
    const normalized = value.toUpperCase()
        .replace(/0/g, 'O')
        .replace(/1/g, 'I')
        .replace(/8/g, 'B')
        .replace(/9/g, 'G');
    const cleaned = normalized.replace(/[^A-Z2-7]/g, '');

    if (cleaned.length === 0) {
        throw new Error('No valid characters found');
    }

    const bytes: number[] = [];
    let buffer = 0;
    let bufferLength = 0;

    for (const char of cleaned) {
        const encoded = BASE32_ALPHABET.indexOf(char);
        if (encoded === -1) {
            throw new Error('Invalid base32 character');
        }

        buffer = (buffer << 5) | encoded;
        bufferLength += 5;

        if (bufferLength >= 8) {
            bufferLength -= 8;
            bytes.push((buffer >> bufferLength) & 0xff);
        }
    }

    return new Uint8Array(bytes);
}

/** Group an unpadded Base32 value for display without changing its bytes. */
export function groupBase32(value: string, groupSize = 5): string {
    if (!Number.isInteger(groupSize) || groupSize <= 0) {
        throw new Error('Invalid Base32 group size');
    }

    const groups: string[] = [];
    for (let index = 0; index < value.length; index += groupSize) {
        groups.push(value.slice(index, index + groupSize));
    }
    return groups.join('-');
}
