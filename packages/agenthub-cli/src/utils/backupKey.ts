/**
 * Backup key formatting utilities
 * Formats secret keys in the same way as the mobile client for compatibility
 */
import { encodeBase32, groupBase32 } from '@artsum/agenthub-wire';

/**
 * Formats a secret key for display in a user-friendly format matching mobile client
 * @param secretBytes - 32-byte secret key as Uint8Array
 * @returns Formatted string like "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
 */
export function formatSecretKeyForBackup(secretBytes: Uint8Array): string {
    // Convert to base32
    return groupBase32(encodeBase32(secretBytes));
}
