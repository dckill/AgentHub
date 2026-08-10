import { trimIdent } from '@/utils/trimIdent';
import type { Thread } from './codexAppServerTypes';
import {
    metadataWithCodexThreadTitle,
    readOfficialCodexThreadTitle,
} from './officialThreadSync';

type ResumeThreadClient = {
    resumeThread: (opts: {
        threadId: string;
        cwd: string;
        mcpServers: Record<string, unknown>;
    }) => Promise<{ threadId: string; model: string }>;
    readThread?: (opts: { threadId: string; includeTurns?: boolean }) => Promise<{ thread: Thread }>;
};

type ResumeThreadSession = {
    updateMetadata: (handler: (currentMetadata: any) => any) => void;
    sendSessionEvent: (event: { type: 'message'; message: string }) => void;
};

type ResumeThreadMessageBuffer = {
    addMessage: (message: string, type: 'status') => void;
};

export async function resumeExistingThread(opts: {
    client: ResumeThreadClient;
    session: ResumeThreadSession;
    messageBuffer: ResumeThreadMessageBuffer;
    threadId: string;
    cwd: string;
    mcpServers: Record<string, unknown>;
    announce?: boolean;
}): Promise<{ threadId: string; model: string }> {
    try {
        const resumedThread = await opts.client.resumeThread({
            threadId: opts.threadId,
            cwd: opts.cwd,
            mcpServers: opts.mcpServers,
        });

        let title: string | null = null;
        if (opts.client.readThread) {
            try {
                title = await readOfficialCodexThreadTitle(
                    opts.client as ResumeThreadClient & { readThread: NonNullable<ResumeThreadClient['readThread']> },
                    resumedThread.threadId,
                );
            } catch {
                // Title sync is best-effort; resuming the thread is the critical path.
            }
        }
        opts.session.updateMetadata((currentMetadata) => title
            ? metadataWithCodexThreadTitle(currentMetadata, resumedThread.threadId, title)
            : {
                ...currentMetadata,
                codexThreadId: resumedThread.threadId,
            });
        if (opts.announce !== false) {
            opts.messageBuffer.addMessage(`Resumed thread ${trimIdent(resumedThread.threadId)}`, 'status');
            opts.session.sendSessionEvent({
                type: 'message',
                message: `Resumed Codex thread ${resumedThread.threadId}`,
            });
        }

        return resumedThread;
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to resume Codex thread ${opts.threadId}: ${reason}`);
    }
}
