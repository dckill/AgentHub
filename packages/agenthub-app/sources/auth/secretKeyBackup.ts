import { encodeBase64, decodeBase64 } from '@/encryption/base64';
import { decodeBase32, encodeBase32, groupBase32 } from '@artsum/agenthub-wire';

/**
 * Converts a 32-byte secret key to a user-readable format similar to 1Password
 * Format: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX
 * Uses base32 encoding without padding for better readability
 */

/**
 * Formats a secret key for display in a user-friendly format
 * @param secretKey - Base64url encoded 32-byte secret key
 * @returns Formatted string like "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
 */
export function formatSecretKeyForBackup(secretKey: string): string {
    try {
        // Decode from base64url to bytes
        const bytes = decodeBase64(secretKey, 'base64url');

        // Convert to base32
        return groupBase32(encodeBase32(bytes));
    } catch (error) {
        throw new Error('Invalid secret key format');
    }
}

/**
 * Parses a user-friendly formatted secret key back to base64url
 * @param formattedKey - Formatted string like "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
 * @returns Base64url encoded secret key
 */
export function parseBackupSecretKey(formattedKey: string): string {
    try {
        // Convert from base32 back to bytes
        const bytes = decodeBase32(formattedKey);

        // Ensure we have exactly 32 bytes
        if (bytes.length !== 32) {
            throw new Error(`Invalid key length: expected 32 bytes, got ${bytes.length}`);
        }

        // Encode to base64url
        return encodeBase64(bytes, 'base64url');
    } catch (error) {
        // Re-throw specific error messages
        if (error instanceof Error) {
            if (error.message.includes('Invalid key length') || 
                error.message.includes('No valid characters found')) {
                throw error;
            }
        }
        throw new Error('Invalid secret key format');
    }
}

/**
 * Validates if a string is a properly formatted secret key
 * @param key - The key to validate (either base64url or formatted)
 * @returns true if valid, false otherwise
 */
export function isValidSecretKey(key: string): boolean {
    try {
        // Try parsing as formatted key first
        if (key.includes('-')) {
            const parsed = parseBackupSecretKey(key);
            return decodeBase64(parsed, 'base64url').length === 32;
        }

        // Try as base64url
        return decodeBase64(key, 'base64url').length === 32;
    } catch {
        return false;
    }
}

/**
 * Normalizes a secret key to base64url format
 * @param key - The key in either format
 * @returns Base64url encoded secret key
 */
export function normalizeSecretKey(key: string): string {
    // Trim whitespace
    const trimmed = key.trim();

    // A hyphen is valid base64url data, so separators alone cannot distinguish
    // the compact account key from the human-readable base32 representation.
    // Prefer an exact 32-byte base64url decode before attempting tolerant base32.
    if (/^[A-Za-z0-9_-]+={0,2}$/.test(trimmed)) {
        try {
            const bytes = decodeBase64(trimmed, 'base64url');
            if (bytes.length === 32) {
                return trimmed;
            }
        } catch {
            // Fall through to the user-friendly base32 parser below.
        }
    }

    return parseBackupSecretKey(trimmed);
}
