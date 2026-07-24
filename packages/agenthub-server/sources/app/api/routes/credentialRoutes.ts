import { z } from "zod";
import { type Fastify } from "../types";
import { decryptString, encryptString } from "@/modules/encrypt";
import { db } from "@/storage/db";
import { log } from "@/utils/log";
import { randomKey } from "@/utils/randomKey";
import { MAX_CREDENTIAL_SECRET_CHARS, MAX_MODEL_OVERRIDE_CHARS, MAX_URL_CHARS } from "../utils/validationLimits";
import { AccountQuotaError, createWithinAccountQuota, readAccountQuotas } from "../utils/accountQuotas";

const accountQuotas = readAccountQuotas();

const AgentSchema = z.enum(['claude', 'codex']);
const SUPPORTED_AGENTS: AgentType[] = ['claude', 'codex'];
const ModelOverridesSchema = z.record(z.string().max(128), z.string().max(MAX_MODEL_OVERRIDE_CHARS)).nullable().optional();

const CreateCredentialSchema = z.object({
    label: z.string().min(1).max(100),
    agent: AgentSchema,
    apiKey: z.string().min(1).max(MAX_CREDENTIAL_SECRET_CHARS),
    baseUrl: z.string().max(MAX_URL_CHARS).optional().nullable(),
    modelOverrides: ModelOverridesSchema,
});

const UpdateCredentialSchema = z.object({
    label: z.string().min(1).max(100).optional(),
    apiKey: z.string().min(1).max(MAX_CREDENTIAL_SECRET_CHARS).optional(),
    baseUrl: z.string().max(MAX_URL_CHARS).nullable().optional(),
    modelOverrides: ModelOverridesSchema,
});

const CredentialResponseSchema = z.object({
    id: z.string(),
    label: z.string(),
    agent: z.string(),
    hasApiKey: z.boolean(),
    baseUrl: z.string().nullable(),
    modelOverrides: z.record(z.string(), z.string()).nullable(),
    lastUsedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
});

const ErrorResponseSchema = z.object({ error: z.string() });

const ALLOWED_MODEL_OVERRIDE_KEYS: Record<AgentType, Set<string>> = {
    claude: new Set([
        'ANTHROPIC_MODEL',
        'ANTHROPIC_DEFAULT_HAIKU_MODEL',
        'ANTHROPIC_DEFAULT_SONNET_MODEL',
        'ANTHROPIC_DEFAULT_OPUS_MODEL',
        'ANTHROPIC_REASONING_MODEL',
    ]),
    codex: new Set(),
};

type AgentType = 'claude' | 'codex';

type CredentialLike = {
    id: string;
    label: string;
    agent: string;
    modelOverrides: unknown;
    lastUsedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
};

function normalizeBaseUrl(baseUrl: string | null | undefined) {
    const trimmed = baseUrl?.trim();
    return trimmed ? trimmed : null;
}

function normalizeModelOverrides(agent: AgentType, modelOverrides: Record<string, string> | null | undefined) {
    if (!modelOverrides) {
        return null;
    }

    const allowedKeys = ALLOWED_MODEL_OVERRIDE_KEYS[agent];
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(modelOverrides)) {
        const trimmedValue = value.trim();
        if (!trimmedValue) {
            continue;
        }
        if (!allowedKeys.has(key)) {
            return { error: `Unsupported model override: ${key}` } as const;
        }
        normalized[key] = trimmedValue;
    }

    return Object.keys(normalized).length > 0 ? normalized : null;
}

function decryptBaseUrl(userId: string, credential: { id: string; baseUrl: Uint8Array | Buffer | null }) {
    if (!credential.baseUrl) {
        return null;
    }

    try {
        return decryptString(['user', userId, 'credentials', credential.id, 'baseUrl'], credential.baseUrl as Uint8Array<ArrayBuffer>);
    } catch (error) {
        log({ module: 'credentials', level: 'warn', userId, credentialId: credential.id }, `Failed to decrypt credential baseUrl: ${error}`);
        return null;
    }
}

function decryptApiKey(userId: string, credential: { id: string; apiKey: Uint8Array | Buffer }) {
    return decryptString(['user', userId, 'credentials', credential.id, 'apiKey'], credential.apiKey as Uint8Array<ArrayBuffer>);
}

function credentialToEnvVars(agent: AgentType, apiKey: string, baseUrl: string | null, modelOverrides: Record<string, string> | null): Record<string, string> {
    const envVars: Record<string, string> = {};
    switch (agent) {
        case 'claude':
            envVars.ANTHROPIC_AUTH_TOKEN = apiKey;
            if (baseUrl) envVars.ANTHROPIC_BASE_URL = baseUrl;
            break;
        case 'codex':
            envVars.OPENAI_API_KEY = apiKey;
            if (baseUrl) envVars.OPENAI_BASE_URL = baseUrl;
            break;
    }
    if (modelOverrides) {
        Object.assign(envVars, modelOverrides);
    }
    return envVars;
}

function buildCredentialResponse(credential: CredentialLike, baseUrl: string | null) {
    return {
        id: credential.id,
        label: credential.label,
        agent: credential.agent,
        hasApiKey: true,
        baseUrl,
        modelOverrides: (credential.modelOverrides as Record<string, string> | null) ?? null,
        lastUsedAt: credential.lastUsedAt?.toISOString() ?? null,
        createdAt: credential.createdAt.toISOString(),
        updatedAt: credential.updatedAt.toISOString(),
    };
}

export function credentialRoutes(app: Fastify) {

    app.addContentTypeParser(
        'application/json',
        { parseAs: 'string' },
        function (req, body, done) {
            try {
                const bodyStr = body as string;
                if (!bodyStr || bodyStr.trim() === '') {
                    (req as any).rawBody = bodyStr;
                    if (req.method === 'DELETE' || req.method === 'GET') {
                        done(null, undefined);
                        return;
                    }
                    done(null, {});
                    return;
                }
                const json = JSON.parse(bodyStr);
                (req as any).rawBody = bodyStr;
                done(null, json);
            } catch (err: any) {
                log({ module: 'content-parser', level: 'error' }, `JSON parse error on ${req.method} ${req.url}: ${err.message}`);
                err.statusCode = 400;
                done(err, undefined);
            }
        }
    );

    app.post('/v1/credentials', {
        preHandler: app.authenticate,
        schema: {
            body: CreateCredentialSchema,
            response: {
                200: z.object({ credential: CredentialResponseSchema }),
                400: ErrorResponseSchema,
                429: z.object({
                    error: z.literal('quota-exceeded'),
                    resource: z.literal('credentials'),
                    limit: z.number(),
                }),
            },
        },
    }, async (request, reply) => {
        const userId = request.userId;
        const { label, agent, apiKey, modelOverrides } = request.body;
        const credentialId = randomKey('cred', 24);
        const baseUrl = normalizeBaseUrl(request.body.baseUrl);
        const normalizedOverrides = normalizeModelOverrides(agent, modelOverrides ?? null);
        if (normalizedOverrides && 'error' in normalizedOverrides) {
            return reply.code(400).send({ error: normalizedOverrides.error });
        }

        let credential;
        try {
            credential = await createWithinAccountQuota({
                resource: 'credentials',
                limit: accountQuotas.credentials,
                count: (tx) => tx.managedCredential.count({ where: { accountId: userId } }),
                create: (tx) => tx.managedCredential.create({
                    data: {
                        id: credentialId,
                        accountId: userId,
                        label,
                        agent,
                        apiKey: encryptString(['user', userId, 'credentials', credentialId, 'apiKey'], apiKey),
                        baseUrl: baseUrl ? encryptString(['user', userId, 'credentials', credentialId, 'baseUrl'], baseUrl) : null,
                        modelOverrides: normalizedOverrides ?? undefined,
                    },
                }),
            });
        } catch (error) {
            if (error instanceof AccountQuotaError) {
                return reply.code(429).send({ error: 'quota-exceeded', resource: 'credentials', limit: error.limit });
            }
            throw error;
        }

        return reply.send({
            credential: buildCredentialResponse(credential, baseUrl),
        });
    });

    app.get('/v1/credentials', {
        preHandler: app.authenticate,
        schema: {
            response: {
                200: z.object({ credentials: z.array(CredentialResponseSchema) }),
            },
        },
    }, async (request, reply) => {
        const userId = request.userId;
        const credentials = await db.managedCredential.findMany({
            where: { accountId: userId, agent: { in: SUPPORTED_AGENTS } },
            orderBy: { createdAt: 'desc' },
        });

        return reply.send({
            credentials: credentials.map((credential) => buildCredentialResponse(credential, decryptBaseUrl(userId, credential))),
        });
    });

    app.get('/v1/credentials/:id', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({ id: z.string() }),
            response: {
                200: z.object({ credential: CredentialResponseSchema }),
                404: ErrorResponseSchema,
            },
        },
    }, async (request, reply) => {
        const userId = request.userId;
        const credential = await db.managedCredential.findFirst({
            where: { id: request.params.id, accountId: userId, agent: { in: SUPPORTED_AGENTS } },
        });
        if (!credential) {
            return reply.code(404).send({ error: 'Credential not found' });
        }

        return reply.send({ credential: buildCredentialResponse(credential, decryptBaseUrl(userId, credential)) });
    });

    app.post('/v1/credentials/:id', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({ id: z.string() }),
            body: UpdateCredentialSchema,
            response: {
                200: z.object({ credential: CredentialResponseSchema }),
                400: ErrorResponseSchema,
                404: ErrorResponseSchema,
            },
        },
    }, async (request, reply) => {
        const userId = request.userId;
        const { id } = request.params;
        const { label, apiKey, modelOverrides } = request.body;

        const existing = await db.managedCredential.findFirst({
            where: { id, accountId: userId, agent: { in: SUPPORTED_AGENTS } },
        });
        if (!existing) {
            return reply.code(404).send({ error: 'Credential not found' });
        }

        const data: any = {};
        if (label !== undefined) data.label = label;
        if (apiKey !== undefined) data.apiKey = encryptString(['user', userId, 'credentials', id, 'apiKey'], apiKey);
        if (request.body.baseUrl !== undefined) {
            const baseUrl = normalizeBaseUrl(request.body.baseUrl);
            data.baseUrl = baseUrl ? encryptString(['user', userId, 'credentials', id, 'baseUrl'], baseUrl) : null;
        }
        if (modelOverrides !== undefined) {
            const normalizedOverrides = normalizeModelOverrides(existing.agent as AgentType, modelOverrides ?? null);
            if (normalizedOverrides && 'error' in normalizedOverrides) {
                return reply.code(400).send({ error: normalizedOverrides.error });
            }
            data.modelOverrides = normalizedOverrides;
        }

        const updated = await db.managedCredential.update({ where: { id }, data });

        return reply.send({ credential: buildCredentialResponse(updated, decryptBaseUrl(userId, updated)) });
    });

    app.delete('/v1/credentials/:id', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({ id: z.string() }),
            response: {
                200: z.object({ success: z.literal(true) }),
            },
        },
    }, async (request, reply) => {
        const userId = request.userId;
        try {
            await db.managedCredential.deleteMany({
                where: { id: request.params.id, accountId: userId },
            });
        } catch {
        }
        return reply.send({ success: true });
    });

    app.get('/v1/credentials/:id/env-vars', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({ id: z.string() }),
            querystring: z.object({
                machineId: z.string().optional(),
                sessionId: z.string().optional(),
            }).optional(),
            response: {
                200: z.object({ envVars: z.record(z.string(), z.string()) }),
                404: ErrorResponseSchema,
            },
        },
    }, async (request, reply) => {
        const userId = request.userId;
        const { machineId, sessionId } = request.query ?? {};
        const credential = await db.managedCredential.findFirst({
            where: { id: request.params.id, accountId: userId, agent: { in: SUPPORTED_AGENTS } },
        });
        if (!credential) {
            return reply.code(404).send({ error: 'Credential not found' });
        }

        if (machineId) {
            const machine = await db.machine.findFirst({
                where: { id: machineId, accountId: userId },
                select: { id: true }
            });
            if (!machine) {
                return reply.code(404).send({ error: 'Machine not found' });
            }
        }

        if (sessionId) {
            const session = await db.session.findFirst({
                where: { id: sessionId, accountId: userId },
                select: { id: true }
            });
            if (!session) {
                return reply.code(404).send({ error: 'Session not found' });
            }
        }

        const apiKey = decryptApiKey(userId, credential);
        const baseUrl = decryptBaseUrl(userId, credential);
        const modelOverrides = normalizeModelOverrides(credential.agent as AgentType, (credential.modelOverrides as Record<string, string> | null) ?? null);
        if (modelOverrides && 'error' in modelOverrides) {
            log({ module: 'credentials', level: 'warn', userId, credentialId: credential.id }, modelOverrides.error);
        }

        const envVars = credentialToEnvVars(
            credential.agent as AgentType,
            apiKey,
            baseUrl,
            modelOverrides && !('error' in modelOverrides) ? modelOverrides : null,
        );

        log({ module: 'credentials', userId, credentialId: credential.id, agent: credential.agent, machineId, sessionId, envKeys: Object.keys(envVars) }, 'Credential env vars issued');

        await db.managedCredential.update({
            where: { id: credential.id },
            data: { lastUsedAt: new Date() },
        }).catch(() => { });

        return reply.send({ envVars });
    });
}
