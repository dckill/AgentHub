import { log } from '@/utils/log';
import { readVersionedSecrets } from './versionedSecrets';

function requireEnv(name: string) {
    const value = process.env[name];
    if (!value || value.trim().length === 0) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function requireAll(names: string[]) {
    for (const name of names) {
        requireEnv(name);
    }
}

export function isProduction() {
    return process.env.NODE_ENV === 'production';
}

export function allowUnsignedLocalFiles() {
    if (process.env.ALLOW_UNSIGNED_LOCAL_FILES === 'true') {
        return true;
    }
    return !isProduction();
}

export function validateServerEnv() {
    if (isProduction()) {
        const dataKeys = readVersionedSecrets({
            keysEnv: 'AGENTHUB_DATA_ENCRYPTION_KEYS',
            activeVersionEnv: 'AGENTHUB_DATA_ENCRYPTION_KEY_VERSION',
        });
        const tokenKeys = readVersionedSecrets({
            keysEnv: 'AGENTHUB_TOKEN_KEYS',
            activeVersionEnv: 'AGENTHUB_TOKEN_KEY_VERSION',
        });
        const purposeSecrets = [...dataKeys.keys.values(), ...tokenKeys.keys.values()];
        if (!process.env.S3_HOST) purposeSecrets.push(requireEnv('LOCAL_FILE_SIGNING_SECRET'));
        if (purposeSecrets.some(secret => secret.length < 32)) {
            throw new Error('Production cryptographic secrets must be at least 32 characters');
        }
        if (new Set(purposeSecrets).size !== purposeSecrets.length) {
            throw new Error('Production cryptographic purposes must use distinct values');
        }
    } else {
        requireEnv('AGENTHUB_MASTER_SECRET');
    }

    if (process.env.S3_HOST) {
        requireAll(['S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_BUCKET', 'S3_PUBLIC_URL']);
    }

    if (isProduction()) {
        const allowedOrigins = process.env.AGENTHUB_ALLOWED_ORIGINS || process.env.CORS_ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS;
        if (!allowedOrigins) {
            log({ module: 'env', level: 'warn' }, 'No CORS origin allowlist configured; browser requests with an Origin header will be rejected in production');
        }
        if (process.env.DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING && !process.env.AGENTHUB_DEBUG_LOG_SECRET) {
            log({ module: 'env', level: 'warn' }, 'Debug log endpoint is enabled without AGENTHUB_DEBUG_LOG_SECRET; Bearer authentication is still required');
        }
    }
}
