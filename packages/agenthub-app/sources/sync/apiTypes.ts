import { z } from 'zod';
import {
    ApiMessageSchema,
    ApiUpdateMachineStateSchema,
    ApiUpdateNewMessageSchema,
    ApiUpdateSessionStateSchema,
    type ApiMessage,
} from '@artsum/agenthub-wire';
import { ImageRefSchema } from './profile';

export {
    ApiMessageSchema,
    ApiUpdateMachineStateSchema,
    ApiUpdateNewMessageSchema,
    ApiUpdateSessionStateSchema,
};
export type { ApiMessage };

//
// Updates
//

export const ApiUpdateNewSessionSchema = z.object({
    t: z.literal('new-session'),
    id: z.string(), // Session ID
    createdAt: z.number(),
    updatedAt: z.number(),
    thinking: z.boolean().optional(),
    thinkingAt: z.number().nullable().optional(),
});

export const ApiDeleteSessionSchema = z.object({
    t: z.literal('delete-session'),
    sid: z.string(), // Session ID
});

export const ApiDeleteMachineSchema = z.object({
    t: z.literal('delete-machine'),
    machineId: z.string(),
});

/** Machine creation update, including the key required for first decryption. */
export const ApiUpdateNewMachineSchema = z.object({
    t: z.literal('new-machine'),
    machineId: z.string(),
    seq: z.number(),
    metadata: z.string(),
    metadataVersion: z.number(),
    daemonState: z.string().nullish(),
    daemonStateVersion: z.number(),
    dataEncryptionKey: z.string().nullish(),
    active: z.boolean(),
    activeAt: z.number(),
    createdAt: z.number(),
    updatedAt: z.number(),
});

export const ApiUpdateAccountSchema = z.object({
    t: z.literal('update-account'),
    id: z.string(),
    settings: z.object({
        value: z.string().nullish(),
        version: z.number()
    }).nullish(),
    firstName: z.string().nullish(),
    lastName: z.string().nullish(),
    avatar: ImageRefSchema.nullish(),
});

// Artifact update schemas
export const ApiNewArtifactSchema = z.object({
    t: z.literal('new-artifact'),
    artifactId: z.string(),
    header: z.string(),
    headerVersion: z.number(),
    body: z.string().optional(),
    bodyVersion: z.number().optional(),
    dataEncryptionKey: z.string(),
    seq: z.number(),
    createdAt: z.number(),
    updatedAt: z.number()
});

export const ApiUpdateArtifactSchema = z.object({
    t: z.literal('update-artifact'),
    artifactId: z.string(),
    header: z.object({
        value: z.string(),
        version: z.number()
    }).optional(),
    body: z.object({
        value: z.string(),
        version: z.number()
    }).optional()
});

export const ApiDeleteArtifactSchema = z.object({
    t: z.literal('delete-artifact'),
    artifactId: z.string()
});

// KV batch update schema for real-time KV updates
export const ApiKvBatchUpdateSchema = z.object({
    t: z.literal('kv-batch-update'),
    changes: z.array(z.object({
        key: z.string(),
        value: z.string().nullable(),
        version: z.number()
    }))
});

// Use a plain union here to avoid runtime discriminator extraction issues
// when some schemas come from shared package exports.
export const ApiUpdateSchema = z.union([
    ApiUpdateNewMessageSchema,
    ApiUpdateNewSessionSchema,
    ApiDeleteSessionSchema,
    ApiUpdateSessionStateSchema,
    ApiUpdateAccountSchema,
    ApiUpdateMachineStateSchema,
    ApiUpdateNewMachineSchema,
    ApiDeleteMachineSchema,
    ApiNewArtifactSchema,
    ApiUpdateArtifactSchema,
    ApiDeleteArtifactSchema,
    ApiKvBatchUpdateSchema
]);

export type ApiUpdateNewMessage = z.infer<typeof ApiUpdateNewMessageSchema>;
export type ApiKvBatchUpdate = z.infer<typeof ApiKvBatchUpdateSchema>;
export type ApiUpdate = z.infer<typeof ApiUpdateSchema>;

//
// API update container
//

export const ApiUpdateContainerSchema = z.object({
    id: z.string(),
    seq: z.number(),
    body: ApiUpdateSchema,
    createdAt: z.number(),
});

export type ApiUpdateContainer = z.infer<typeof ApiUpdateContainerSchema>;

//
// Ephemeral update
//

export const ApiEphemeralActivityUpdateSchema = z.object({
    type: z.literal('activity'),
    id: z.string(),
    active: z.boolean(),
    activeAt: z.number(),
    thinking: z.boolean(),
});

export const ApiEphemeralUsageUpdateSchema = z.object({
    type: z.literal('usage'),
    id: z.string(),
    key: z.string(),
    timestamp: z.number(),
    tokens: z.object({
        total: z.number(),
        input: z.number().optional(),
        output: z.number().optional(),
        cache_creation: z.number().optional(),
        cache_read: z.number().optional(),
        reasoning_output: z.number().optional(),
        context: z.number().optional(),
        context_window: z.number().optional(),
    }).passthrough(),
    cost: z.object({
        total: z.number(),
        input: z.number().optional(),
        output: z.number().optional(),
    }).passthrough(),
});

export const ApiEphemeralMachineActivityUpdateSchema = z.object({
    type: z.literal('machine-activity'),
    id: z.string(), // machine id
    active: z.boolean(),
    activeAt: z.number(),
});

export const ApiEphemeralSessionControlUpdateSchema = z.object({
    type: z.literal('session-control'),
    sessionId: z.string(),
    activeDeviceId: z.string().nullable(),
    activeDeviceAt: z.number().nullable(),
});

export const ApiEphemeralUpdateSchema = z.union([
    ApiEphemeralActivityUpdateSchema,
    ApiEphemeralUsageUpdateSchema,
    ApiEphemeralMachineActivityUpdateSchema,
    ApiEphemeralSessionControlUpdateSchema,
]);

export type ApiEphemeralActivityUpdate = z.infer<typeof ApiEphemeralActivityUpdateSchema>;
export type ApiEphemeralUpdate = z.infer<typeof ApiEphemeralUpdateSchema>;

// Machine metadata updates use Partial<MachineMetadata> from storageTypes
// This matches how session metadata updates work
