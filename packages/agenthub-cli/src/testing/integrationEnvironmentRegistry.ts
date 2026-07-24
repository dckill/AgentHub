import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';

const ENVIRONMENT_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function assertManifestPath(manifestPath: string) {
    if (!isAbsolute(manifestPath)) {
        throw new Error('Integration environment cleanup manifest path must be absolute');
    }
}

function assertEnvironmentName(name: string) {
    if (!ENVIRONMENT_NAME_PATTERN.test(name)) {
        throw new Error(`Invalid integration environment name: ${name}`);
    }
}

export function registerIntegrationEnvironment(manifestPath: string, name: string) {
    assertManifestPath(manifestPath);
    assertEnvironmentName(name);
    mkdirSync(dirname(manifestPath), { recursive: true, mode: 0o700 });
    appendFileSync(manifestPath, `${JSON.stringify({ name })}\n`, { encoding: 'utf8', flag: 'a', mode: 0o600 });
    chmodSync(manifestPath, 0o600);
}

function parseRegisteredIntegrationEnvironments(manifestPath: string) {
    assertManifestPath(manifestPath);
    if (!existsSync(manifestPath)) return { names: [] as string[], failures: [] as unknown[] };

    const names: string[] = [];
    const failures: unknown[] = [];
    for (const line of readFileSync(manifestPath, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)) {
        try {
            const parsed = JSON.parse(line) as { name?: unknown };
            if (typeof parsed.name !== 'string') {
                throw new Error('Integration environment cleanup manifest entry has no name');
            }
            assertEnvironmentName(parsed.name);
            names.push(parsed.name);
        } catch (error) {
            failures.push(error);
        }
    }
    return { names: [...new Set(names)], failures };
}

export function readRegisteredIntegrationEnvironments(manifestPath: string): string[] {
    const { names, failures } = parseRegisteredIntegrationEnvironments(manifestPath);
    if (failures.length > 0) {
        throw new AggregateError(failures, 'Invalid integration environment cleanup manifest');
    }
    return names;
}

export async function cleanupRegisteredIntegrationEnvironments(
    manifestPath: string,
    cleanup: (name: string) => Promise<void>,
) {
    const cleanupFailures: unknown[] = [];
    let manifestFailures: unknown[] = [];
    try {
        const parsed = parseRegisteredIntegrationEnvironments(manifestPath);
        manifestFailures = parsed.failures;
        for (const name of parsed.names) {
            try {
                await cleanup(name);
            } catch (error) {
                cleanupFailures.push(error);
            }
        }
    } finally {
        rmSync(manifestPath, { force: true });
    }

    if (manifestFailures.length > 0 || cleanupFailures.length > 0) {
        const failures = [...manifestFailures, ...cleanupFailures];
        const message = manifestFailures.length > 0
            ? `Failed to process ${manifestFailures.length} integration environment cleanup manifest entr${manifestFailures.length === 1 ? 'y' : 'ies'}`
            : `Failed to clean ${cleanupFailures.length} integration environment${cleanupFailures.length === 1 ? '' : 's'}`;
        throw new AggregateError(
            failures,
            message,
        );
    }
}
