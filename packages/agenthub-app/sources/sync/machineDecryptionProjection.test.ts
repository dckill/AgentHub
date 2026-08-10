import { describe, expect, it } from 'vitest';
import { buildDecryptedMachineProjection } from './machineDecryptionProjection';

describe('buildDecryptedMachineProjection', () => {
    it('combines decrypted machine fields with the server envelope', () => {
        expect(buildDecryptedMachineProjection(
            {
                id: 'machine-1',
                seq: 4,
                createdAt: 10,
                updatedAt: 20,
                active: true,
                activeAt: 20,
                metadataVersion: 2,
                daemonStateVersion: undefined,
            },
            { host: 'host', platform: 'linux', agentHubCliVersion: '1.0.0', agentHubHomeDir: '/tmp/.agenthub', homeDir: '/tmp' },
            { status: 'running' },
        )).toEqual({
            id: 'machine-1',
            seq: 4,
            createdAt: 10,
            updatedAt: 20,
            active: true,
            activeAt: 20,
            metadata: { host: 'host', platform: 'linux', agentHubCliVersion: '1.0.0', agentHubHomeDir: '/tmp/.agenthub', homeDir: '/tmp' },
            metadataVersion: 2,
            daemonState: { status: 'running' },
            daemonStateVersion: 0,
        });
    });
});
