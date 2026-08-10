import {
    createCodexThreadDefaults,
    mergeCodexThreadDefaults,
    type CodexThreadDefaults,
} from './codexThreadDefaults';
import type { ThreadRequestOptions } from './threadRequestParams';

type ThreadResponse<TThread extends { id: string }> = {
    thread: TThread;
    model: string;
};

type ThreadStateWriters = {
    setThreadId: (threadId: string) => void;
    setTurnId: (turnId: string | null) => void;
    setDefaults: (defaults: CodexThreadDefaults | null) => void;
};

export function applyCodexStartedThread<TThread extends { id: string }>({
    result,
    options,
    setThreadId,
    setTurnId,
    setDefaults,
}: {
    result: ThreadResponse<TThread>;
    options: ThreadRequestOptions;
} & ThreadStateWriters): { threadId: string; model: string } {
    setThreadId(result.thread.id);
    setTurnId(null);
    setDefaults(createCodexThreadDefaults(options));
    return { threadId: result.thread.id, model: result.model };
}

export function applyCodexResumedThread<TThread extends { id: string }>({
    result,
    options,
    existingDefaults,
    setThreadId,
    setTurnId,
    setDefaults,
}: {
    result: ThreadResponse<TThread>;
    options: ThreadRequestOptions;
    existingDefaults: CodexThreadDefaults;
} & ThreadStateWriters): { threadId: string; model: string } {
    setThreadId(result.thread.id);
    setTurnId(null);
    setDefaults(mergeCodexThreadDefaults(existingDefaults, options));
    return { threadId: result.thread.id, model: result.model };
}

export function applyCodexForkedThread<TThread extends { id: string }>({
    result,
    options,
    existingDefaults,
    setThreadId,
    setTurnId,
    setDefaults,
}: {
    result: ThreadResponse<TThread>;
    options: ThreadRequestOptions;
    existingDefaults: CodexThreadDefaults;
} & ThreadStateWriters): { threadId: string; model: string; thread: TThread } {
    setThreadId(result.thread.id);
    setTurnId(null);
    setDefaults(mergeCodexThreadDefaults(existingDefaults, options));
    return { threadId: result.thread.id, model: result.model, thread: result.thread };
}
