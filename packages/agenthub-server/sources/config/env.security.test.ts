import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateServerEnv } from './env';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
});

function productionEnv() {
    process.env = {
        ...originalEnv,
        NODE_ENV: 'production',
        AGENTHUB_MASTER_SECRET: 'legacy-master-secret',
        AGENTHUB_ALLOWED_ORIGINS: 'https://app.example.com',
        S3_HOST: 's3.example.com',
        S3_ACCESS_KEY: 'access',
        S3_SECRET_KEY: 's3-secret',
        S3_BUCKET: 'bucket',
        S3_PUBLIC_URL: 'https://files.example.com',
    };
}

function validProductionEnv() {
    productionEnv();
    process.env.AGENTHUB_DATA_ENCRYPTION_KEYS = JSON.stringify({ 2: 'data-encryption-secret-that-is-at-least-32-chars' });
    process.env.AGENTHUB_DATA_ENCRYPTION_KEY_VERSION = '2';
    process.env.AGENTHUB_TOKEN_KEYS = JSON.stringify({ 2: 'token-secret-that-is-at-least-32-characters' });
    process.env.AGENTHUB_TOKEN_KEY_VERSION = '2';
}

describe('production secret purpose isolation', () => {
    it('requires dedicated versioned data-encryption and token keys', () => {
        productionEnv();

        expect(() => validateServerEnv()).toThrow(/AGENTHUB_DATA_ENCRYPTION_KEYS/);
    });

    it('rejects reuse of the same value across cryptographic purposes', () => {
        productionEnv();
        const reused = 'purpose-secret-that-is-at-least-32-characters';
        process.env.AGENTHUB_DATA_ENCRYPTION_KEYS = JSON.stringify({ 2: reused });
        process.env.AGENTHUB_DATA_ENCRYPTION_KEY_VERSION = '2';
        process.env.AGENTHUB_TOKEN_KEYS = JSON.stringify({ 2: reused });
        process.env.AGENTHUB_TOKEN_KEY_VERSION = '2';

        expect(() => validateServerEnv()).toThrow(/must use distinct values/);
    });

    it('rejects the debug log endpoint in production even when explicitly enabled', () => {
        validProductionEnv();
        process.env.DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING = 'true';

        expect(() => validateServerEnv()).toThrow(/not allowed in production/);
    });

    it('treats non-true debug flag values as disabled', () => {
        validProductionEnv();
        process.env.DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING = 'false';

        expect(() => validateServerEnv()).not.toThrow();
    });
});
