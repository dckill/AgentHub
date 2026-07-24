import type { SessionTurnEndStatus } from '@artsum/agenthub-wire';
import type { Metadata } from '@/api/types';

type ApiSessionLike = {
    closeClaudeSessionTurn: (status: SessionTurnEndStatus) => void;
    updateMetadata: (updater: (metadata: Metadata) => Metadata) => void;
    sendSessionDeath: () => void;
    flush: () => Promise<void>;
    close: () => Promise<void>;
};

type CurrentSessionLike = {
    thinking?: boolean;
    onThinkingChange?: (thinking: boolean) => void;
    cleanup: () => void;
} | null;

type CleanupLike = {
    cleanup: () => Promise<void>;
};

type StoppableLike = {
    stop: () => void;
};

export async function closeClaudeSessionAndResources({
    session,
    currentSession,
    goalScanner,
    agenthubServer,
    hookServer,
    hookSettingsPath,
    cleanupHookSettingsFile,
    archiveReason,
    turnStatus,
}: {
    session: ApiSessionLike;
    currentSession: CurrentSessionLike;
    goalScanner: CleanupLike;
    agenthubServer: StoppableLike;
    hookServer: StoppableLike;
    hookSettingsPath: string;
    cleanupHookSettingsFile: (path: string) => void;
    archiveReason: string;
    turnStatus: SessionTurnEndStatus;
}): Promise<void> {
    session.updateMetadata((currentMetadata) => ({
        ...currentMetadata,
        lifecycleState: 'archived',
        lifecycleStateSince: Date.now(),
        archivedBy: 'cli',
        archiveReason,
    }));

    session.closeClaudeSessionTurn(turnStatus);
    if (currentSession?.thinking === true) {
        currentSession.onThinkingChange?.(false);
    }
    currentSession?.cleanup();
    await goalScanner.cleanup();

    session.sendSessionDeath();
    await session.flush();
    await session.close();

    agenthubServer.stop();
    hookServer.stop();
    cleanupHookSettingsFile(hookSettingsPath);
}

export function createClaudeShutdownOnce<TArgs extends unknown[]>(
    shutdown: (...args: TArgs) => Promise<void>,
): (...args: TArgs) => Promise<void> {
    let shutdownPromise: Promise<void> | null = null;

    return (...args: TArgs) => {
        if (!shutdownPromise) {
            shutdownPromise = shutdown(...args);
        }

        return shutdownPromise;
    };
}
