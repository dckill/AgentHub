export interface ChatSubmissionPayload {
    sessionId: string;
    text: string;
    displayText?: string;
    fileReferences: string[];
    localFiles: { name: string; mimeType: string; size: number; data: string }[];
}

interface ChatSubmissionDeduperOptions {
    duplicateWindowMs?: number;
}

function payloadKey(payload: ChatSubmissionPayload) {
    return JSON.stringify({
        sessionId: payload.sessionId,
        text: payload.text,
        displayText: payload.displayText ?? null,
        fileReferences: payload.fileReferences,
        localFiles: payload.localFiles.map((file) => ({
            name: file.name,
            mimeType: file.mimeType,
            size: file.size,
            data: file.data,
        })),
    });
}

export function createChatSubmissionDeduper(options: ChatSubmissionDeduperOptions = {}) {
    const duplicateWindowMs = options.duplicateWindowMs ?? 750;
    let lastSubmission: { key: string; acceptedAt: number } | null = null;

    return {
        accept(payload: ChatSubmissionPayload, now = Date.now()) {
            const key = payloadKey(payload);
            if (lastSubmission && lastSubmission.key === key && now - lastSubmission.acceptedAt < duplicateWindowMs) {
                return false;
            }
            lastSubmission = { key, acceptedAt: now };
            return true;
        },
    };
}
