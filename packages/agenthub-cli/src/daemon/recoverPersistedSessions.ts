import { decodeBase64 } from '@/api/encryption';
import type { PersistedSession } from '@/persistence';
import type { TrackedSession } from './types';
import { classifyAgentHubProcess, isAgentHubProcess } from './doctor';

export type RecoverProcessEntry = {
    pid: number;
    name?: string;
    cmd?: string;
};

function isLiveDaemonSpawnedSessionProcess(process: RecoverProcessEntry, currentPid: number): boolean {
    const command = process.cmd || '';
    const name = process.name || '';
    if (!isAgentHubProcess(name, command)) {
        return false;
    }

    const type = classifyAgentHubProcess(process.pid, command, currentPid);
    return type === 'daemon-spawned-session' || type === 'dev-daemon-spawned';
}

export function recoverPersistedDaemonSessions(
    persisted: Record<string, PersistedSession>,
    processes: RecoverProcessEntry[],
    currentPid = process.pid,
): TrackedSession[] {
    const liveDaemonSessionPids = new Set(
        processes
            .filter((process) => isLiveDaemonSpawnedSessionProcess(process, currentPid))
            .map((process) => process.pid)
    );
    const seenPids = new Set<number>();
    const recovered: TrackedSession[] = [];

    const entries = Object.entries(persisted)
        .sort(([, a], [, b]) => b.savedAt - a.savedAt);

    for (const [sessionId, session] of entries) {
        const metadata = session.metadata;
        const hostPid = metadata?.hostPid;
        if (typeof hostPid !== 'number' || !Number.isInteger(hostPid) || hostPid <= 0) {
            continue;
        }
        if (seenPids.has(hostPid)) {
            continue;
        }
        if (!liveDaemonSessionPids.has(hostPid)) {
            continue;
        }
        if (metadata.lifecycleState === 'archived') {
            continue;
        }
        if (metadata.startedBy !== 'daemon' && metadata.startedFromDaemon !== true) {
            continue;
        }

        seenPids.add(hostPid);
        recovered.push({
            startedBy: 'daemon',
            agentHubSessionId: sessionId,
            agenthubSessionMetadataFromLocalWebhook: metadata,
            encryption: {
                encryptionKey: decodeBase64(session.encryptionKey),
                encryptionVariant: session.encryptionVariant,
                seq: session.seq,
                metadataVersion: session.metadataVersion,
                agentStateVersion: session.agentStateVersion,
            },
            pid: hostPid,
        });
    }

    return recovered;
}
