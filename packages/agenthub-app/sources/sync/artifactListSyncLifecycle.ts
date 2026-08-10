import type { AuthCredentials } from '@/auth/tokenStorage';
import type { Encryption } from './encryption/encryption';
import type { AccountRequest } from './accountLifecycle';
import type { Artifact } from './artifactTypes';
import { ArtifactEncryption } from './encryption/artifactEncryption';
import { fetchArtifacts } from './apiArtifacts';
import { applyArtifactSnapshot, type ArtifactSnapshotApplicationResult } from './artifactSnapshotApplication';
import { applyArtifactListSync } from './artifactListSyncApplication';
import { shouldReportSyncError } from './syncErrorReporting';

export async function runArtifactListSync(options: {
    credentials: AuthCredentials | null;
    encryption: Encryption | null;
    generation: number;
    runRequest: (
        generation: number,
        operation: (request: AccountRequest) => Promise<ArtifactSnapshotApplicationResult>,
    ) => Promise<ArtifactSnapshotApplicationResult>;
    assertCurrent: () => void;
    setDataKey: (artifactId: string, key: Uint8Array) => void;
    applyArtifacts: (artifacts: ArtifactSnapshotApplicationResult['decryptedArtifacts']) => void;
    scheduleRetry: () => void;
    log: (message: string) => void;
    reportError: (message: string, error?: unknown) => void;
}): Promise<void> {
    options.log('📦 fetchArtifactsList: Starting artifact sync');
    if (!options.credentials || !options.encryption) {
        options.log('📦 fetchArtifactsList: No credentials, skipping');
        return;
    }

    try {
        options.log('📦 fetchArtifactsList: Fetching artifacts from server');
        const result = await applyArtifactListSync({
            load: () => options.runRequest(options.generation, async (request) => {
                const artifacts = await fetchArtifacts(options.credentials!, request.signal);
                request.assertCurrent();
                options.log(`📦 fetchArtifactsList: Received ${artifacts.length} artifacts from server`);
                return applyArtifactSnapshot({
                    artifacts,
                    decryptEncryptionKey: (value) => options.encryption!.decryptEncryptionKey(value),
                    createEncryption: (key) => new ArtifactEncryption(key),
                    assertCurrent: request.assertCurrent,
                    onKeyFailure: (artifactId) => {
                        options.reportError(`Failed to decrypt key for artifact ${artifactId}`);
                    },
                    onError: (artifactId, error) => {
                        options.reportError(`Failed to decrypt artifact ${artifactId}:`, error);
                    },
                });
            }),
            assertCurrent: options.assertCurrent,
            setDataKey: options.setDataKey,
            applyArtifacts: options.applyArtifacts,
            scheduleRetry: options.scheduleRetry,
        });

        options.log(`📦 fetchArtifactsList: Successfully decrypted ${result.decryptedArtifacts.length} artifacts`);
        options.log('📦 fetchArtifactsList: Artifacts applied to storage');
    } catch (error) {
        options.log(`📦 fetchArtifactsList: Error fetching artifacts: ${error}`);
        if (shouldReportSyncError(error)) {
            options.reportError('Failed to fetch artifacts:', error);
        }
        throw error;
    }
}
