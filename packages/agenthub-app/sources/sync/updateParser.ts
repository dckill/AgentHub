import { ApiUpdateContainerSchema, type ApiUpdateContainer } from './apiTypes';

/** Parse and narrow a socket update before it reaches the stateful Sync class. */
export function parseApiUpdate(update: unknown): ApiUpdateContainer | null {
    const result = ApiUpdateContainerSchema.safeParse(update);
    return result.success ? result.data : null;
}
