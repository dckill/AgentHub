import { createHash } from 'node:crypto';
import tweetnacl from 'tweetnacl';
import { CONTENT_KEY_DERIVATION_USAGE } from '@artsum/agenthub-wire';
import { deriveKeySync } from './deriveKey';

/** Derive the NaCl content key pair used by resume/auth compatibility flows. */
export function deriveContentKeyPair(secret: Uint8Array): { publicKey: Uint8Array; secretKey: Uint8Array } {
    const seed = deriveKeySync(secret, CONTENT_KEY_DERIVATION_USAGE, ['content']);
    const hashedSeed = new Uint8Array(createHash('sha512').update(seed).digest());
    const boxSecretKey = hashedSeed.slice(0, 32);
    const keyPair = tweetnacl.box.keyPair.fromSecretKey(boxSecretKey);
    return { publicKey: keyPair.publicKey, secretKey: keyPair.secretKey };
}
