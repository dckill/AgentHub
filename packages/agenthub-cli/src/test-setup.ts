/**
 * Vitest global setup — runs ONCE before all tests.
 *
 * Integration suites provision an environment-private CLI bundle. Unit tests
 * execute TypeScript directly and must never rebuild the shared dist used by
 * the systemd production daemon.
 */

import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { destroyIntegrationEnvironmentByName } from './testing/integrationEnvironment'
import { cleanupRegisteredIntegrationEnvironments } from './testing/integrationEnvironmentRegistry'

let integrationCleanupManifestPath: string | undefined
let previousCleanupManifestPath: string | undefined

function hasCommand(command: string): boolean {
    return spawnSync('sh', ['-lc', `command -v ${command}`], {
        stdio: 'ignore',
    }).status === 0
}

export async function setup() {
    process.env.VITEST_POOL_TIMEOUT = '60000'
    process.env.AGENTHUB_RUN_SANDBOX_NETWORK_TESTS ??= hasCommand('bwrap') && hasCommand('socat') ? '1' : '0'
    previousCleanupManifestPath = process.env.AGENTHUB_INTEGRATION_CLEANUP_MANIFEST
    integrationCleanupManifestPath = join(
        tmpdir(),
        `agenthub-integration-cleanup-${process.pid}-${randomUUID()}.jsonl`,
    )
    process.env.AGENTHUB_INTEGRATION_CLEANUP_MANIFEST = integrationCleanupManifestPath

}

export async function teardown() {
    try {
        if (integrationCleanupManifestPath) {
            await cleanupRegisteredIntegrationEnvironments(
                integrationCleanupManifestPath,
                destroyIntegrationEnvironmentByName,
            )
        }
    } finally {
        if (previousCleanupManifestPath === undefined) {
            delete process.env.AGENTHUB_INTEGRATION_CLEANUP_MANIFEST
        } else {
            process.env.AGENTHUB_INTEGRATION_CLEANUP_MANIFEST = previousCleanupManifestPath
        }
        integrationCleanupManifestPath = undefined
        previousCleanupManifestPath = undefined
    }
}
