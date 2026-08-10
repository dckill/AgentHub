import type { SessionRowData } from '@/sync/storage';
import type { SpawnSessionOptions, SpawnSessionResult } from '@/sync/ops';

interface ConnectOfficialCodexSessionOptions {
    session: Pick<SessionRowData, 'source' | 'machineId' | 'path' | 'codexThreadId' | 'claudeSessionId'> & Partial<Pick<SessionRowData, 'name'>>;
    isCurrent?: () => boolean;
    spawnSession: (options: Pick<SpawnSessionOptions, 'machineId' | 'directory' | 'agent' | 'officialMirrorCodexThreadId' | 'officialMirrorClaudeSessionId'>) => Promise<SpawnSessionResult>;
    ensureSessionLoaded: (sessionId: string) => Promise<unknown>;
    onSessionVisible: (sessionId: string) => void;
    startOfficialResumeSession: (sessionId: string, threadId: string, title?: string | null) => void;
    navigateToSession: (sessionId: string) => void;
}

export async function connectOfficialCodexSession({
    session,
    spawnSession,
    ensureSessionLoaded,
    onSessionVisible,
    startOfficialResumeSession,
    navigateToSession,
    isCurrent = () => true,
}: ConnectOfficialCodexSessionOptions): Promise<void> {
    if (!isCurrent()) {
        return;
    }
    if (!session.machineId || !session.path) {
        return;
    }

    const isCodex = session.source === 'official-codex' && !!session.codexThreadId;
    const isClaude = session.source === 'official-claude' && !!session.claudeSessionId;
    if (!isCodex && !isClaude) {
        return;
    }

    const result = await spawnSession({
        machineId: session.machineId,
        directory: session.path,
        agent: isClaude ? 'claude' : 'codex',
        officialMirrorCodexThreadId: isCodex ? session.codexThreadId! : undefined,
        officialMirrorClaudeSessionId: isClaude ? session.claudeSessionId! : undefined,
    });
    if (!isCurrent()) {
        return;
    }

    if (result.type !== 'success') {
        return;
    }

    await ensureSessionLoaded(result.sessionId);
    if (!isCurrent()) {
        return;
    }
    onSessionVisible(result.sessionId);
    if (!isCurrent()) {
        return;
    }
    startOfficialResumeSession(result.sessionId, isClaude ? session.claudeSessionId! : session.codexThreadId!, session.name);
    if (!isCurrent()) {
        return;
    }
    navigateToSession(result.sessionId);
}
