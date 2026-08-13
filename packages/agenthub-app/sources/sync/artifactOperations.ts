import type { AuthCredentials } from '@/auth/tokenStorage';
import type { Encryption } from './encryption/encryption';
import { ArtifactEncryption } from './encryption/artifactEncryption';
import type { AccountLifecycle } from './accountLifecycle';
import type { DataKeyRegistry } from './dataKeyRegistry';
import type { DecryptedArtifact } from './artifactTypes';
import { storage } from './storage';
import { fetchArtifact, createArtifact, updateArtifact } from './apiArtifacts';
import { runArtifactListSync } from './artifactListSyncLifecycle';
import { runArtifactBodyFetch, runArtifactCreate, runArtifactUpdate } from './artifactCrudLifecycle';
import { applyArtifactBodyFetch } from './artifactBodyFetchApplication';
import { applyArtifactCreate } from './artifactCreateApplication';
import { applyArtifactUpdateRequest } from './artifactUpdateRequestApplication';
import { areArtifactSessionsEqual } from './artifactSessions';
import { log } from '@/log';

export interface ArtifactOperationsDependencies {
    getCredentials: () => AuthCredentials | null;
    getEncryption: () => Encryption | null;
    requireGeneration: () => number;
    accountLifecycle: AccountLifecycle;
    dataKeys: DataKeyRegistry;
    scheduleListRetry: () => void;
}

function requireAuth(deps: ArtifactOperationsDependencies) {
    const credentials = deps.getCredentials();
    const encryption = deps.getEncryption();
    if (!credentials || !encryption) {
        throw new Error('Not authenticated. Please sign in again and retry.');
    }
    return { credentials, encryption };
}

export function createArtifactOperations(deps: ArtifactOperationsDependencies) {
    return {
        fetchList: async (generation = deps.requireGeneration()): Promise<void> => runArtifactListSync({
            credentials: deps.getCredentials(),
            encryption: deps.getEncryption(),
            generation,
            runRequest: (requestGeneration, operation) => deps.accountLifecycle.runRequest(requestGeneration, operation),
            assertCurrent: () => deps.accountLifecycle.assertCurrent(generation),
            setDataKey: (artifactId, key) => deps.dataKeys.set('artifact', artifactId, key),
            applyArtifacts: (artifacts) => storage.getState().applyArtifacts(artifacts),
            scheduleRetry: deps.scheduleListRetry,
            log: (message) => log.log(message),
            reportError: (message, error) => error === undefined ? console.error(message) : console.error(message, error),
        }),
        fetchBody: async (artifactId: string): Promise<DecryptedArtifact> => {
            const { credentials, encryption } = requireAuth(deps);
            const generation = deps.requireGeneration();
            return runArtifactBodyFetch({
                generation,
                runRequest: (requestGeneration, operation) => deps.accountLifecycle.runRequest(requestGeneration, operation),
                fetchArtifact: (signal) => fetchArtifact(credentials, artifactId, signal),
                applyBody: (artifact, assertCurrent) => applyArtifactBodyFetch({
                    artifact,
                    decryptEncryptionKey: (value) => encryption.decryptEncryptionKey(value),
                    createEncryption: (key) => new ArtifactEncryption(key),
                    assertCurrent,
                }),
                assertCurrent: () => deps.accountLifecycle.assertCurrent(generation),
                setDataKey: (id, key) => deps.dataKeys.set('artifact', id, key),
            });
        },
        create: async (title: string | null, body: string | null, sessions?: string[], draft?: boolean): Promise<string> => {
            const { credentials, encryption } = requireAuth(deps);
            const generation = deps.requireGeneration();
            try {
                return await runArtifactCreate({
                    generation,
                    runRequest: (requestGeneration, operation) => deps.accountLifecycle.runRequest(requestGeneration, operation),
                    applyCreate: async (accountRequest) => applyArtifactCreate({
                        title, body, sessions, draft,
                        generateId: () => encryption.generateId(),
                        generateDataEncryptionKey: () => ArtifactEncryption.generateDataEncryptionKey(),
                        encryptEncryptionKey: (value) => encryption.encryptEncryptionKey(value),
                        createEncryption: (key) => new ArtifactEncryption(key),
                        createArtifact: (request) => createArtifact(credentials, request, accountRequest.signal),
                        assertCurrent: accountRequest.assertCurrent,
                    }),
                    assertCurrent: () => deps.accountLifecycle.assertCurrent(generation),
                    setDataKey: (id, key) => deps.dataKeys.set('artifact', id, key),
                    addArtifact: (artifact) => storage.getState().addArtifact(artifact),
                });
            } catch (error) {
                console.error('Failed to create artifact:', error);
                throw error;
            }
        },
        update: async (artifactId: string, title: string | null, body: string | null, sessions?: string[], draft?: boolean): Promise<void> => {
            const { credentials, encryption } = requireAuth(deps);
            const generation = deps.requireGeneration();
            try {
                const currentArtifact = storage.getState().artifacts[artifactId];
                if (!currentArtifact) throw new Error('Artifact not found. Refresh the list and retry.');
                await runArtifactUpdate({
                    generation,
                    runRequest: (requestGeneration, operation) => deps.accountLifecycle.runRequest(requestGeneration, operation),
                    applyUpdate: async (accountRequest) => applyArtifactUpdateRequest({
                        artifactId, title, body, sessions, draft, currentArtifact,
                        dataEncryptionKey: deps.dataKeys.get('artifact', artifactId),
                        fetchArtifact: () => fetchArtifact(credentials, artifactId, accountRequest.signal),
                        decryptEncryptionKey: (value) => encryption.decryptEncryptionKey(value),
                        createEncryption: (key) => new ArtifactEncryption(key),
                        updateArtifact: (request) => updateArtifact(credentials, artifactId, request, accountRequest.signal),
                        areArtifactSessionsEqual,
                        assertCurrent: accountRequest.assertCurrent,
                        now: Date.now,
                    }),
                    assertCurrent: () => deps.accountLifecycle.assertCurrent(generation),
                    setDataKey: (id, key) => deps.dataKeys.set('artifact', id, key),
                    updateArtifact: (artifact) => storage.getState().updateArtifact(artifact),
                });
            } catch (error) {
                console.error('Failed to update artifact:', error);
                throw error;
            }
        },
    };
}
