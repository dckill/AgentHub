import { ApiEphemeralUpdateSchema, type ApiEphemeralUpdate } from './apiTypes';

/** Parse and narrow a socket ephemeral update before it reaches the stateful Sync class. */
export function parseEphemeralUpdate(update: unknown): ApiEphemeralUpdate | null {
    const result = ApiEphemeralUpdateSchema.safeParse(update);
    return result.success ? result.data : null;
}
