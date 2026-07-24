import { machineReadFile, sessionReadFile } from '@/sync/ops';
import type { SessionReadFileResponse } from '@/sync/ops';
import {
    LARGE_FILE_CONFIRMATION_BYTES,
    buildBase64DataUri,
    classifyFilePreview,
    getConfirmedFileReadLimit,
    isDecodedContentBinary,
    shouldConfirmLargeFile,
} from './filePreviewPolicy';
import type { FilePreviewClassification } from './filePreviewPolicy';
import {
    getSessionFileByteSizeViaShell,
    readSessionFileBase64ContentInChunks,
    readSessionFileBase64ContentViaShell,
} from './filePreviewFallback';

export type FilePreviewSource = {
    kind: 'session' | 'machine';
    id: string;
    cwd?: string | null;
};

export type LoadedFilePreview = {
    content: string;
    encoding: 'utf8' | 'base64';
    isBinary: boolean;
    previewKind: FilePreviewClassification['kind'];
    imageUri?: string;
    skippedLargeFile: boolean;
    truncated: boolean;
    totalSize?: number;
};

export type ConfirmLargeFile = (options: {
    fileName: string;
    size: string;
    totalSize?: number;
}) => Promise<boolean>;

type ShellBase64ReadResult = {
    response: SessionReadFileResponse;
    skippedLargeFile: boolean;
};

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function decodeBase64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function decodeUtf8Bytes(bytes: Uint8Array): string {
    return new TextDecoder().decode(bytes);
}

function isBase64Preview(preview: FilePreviewClassification): preview is Extract<FilePreviewClassification, { kind: 'image' | 'svg' }> {
    return preview.kind === 'image' || preview.kind === 'svg';
}

export async function loadFilePreviewContent({
    source,
    filePath,
    fileName,
    confirmLargeFile,
    signal,
}: {
    source: FilePreviewSource;
    filePath: string;
    fileName: string;
    confirmLargeFile?: ConfirmLargeFile;
    signal?: AbortSignal;
}): Promise<LoadedFilePreview> {
    const preview = classifyFilePreview(filePath);

    if (preview.kind === 'binary') {
        return {
            content: '',
            encoding: 'base64',
            isBinary: true,
            previewKind: 'binary',
            skippedLargeFile: false,
            truncated: false,
        };
    }

    const readPreviewFile = (maxBytes: number): Promise<SessionReadFileResponse> => {
        if (source.kind === 'machine') {
            if (isBase64Preview(preview)) {
                return readSessionFileBase64ContentInChunks(source.id, filePath, maxBytes, machineReadFile, signal);
            }
            return machineReadFile(source.id, filePath, { maxSize: maxBytes, signal });
        }

        return isBase64Preview(preview)
            ? readSessionFileBase64ContentInChunks(source.id, filePath, maxBytes, undefined, signal)
            : sessionReadFile(source.id, filePath, { maxSize: maxBytes, signal });
    };

    let response: SessionReadFileResponse;
    let shellSkippedLargeFile = false;
    try {
        response = await readPreviewFile(LARGE_FILE_CONFIRMATION_BYTES);
    } catch (readError) {
        if (source.kind !== 'session' || !isBase64Preview(preview)) {
            throw readError;
        }
        const shellResult = await readSessionBase64ViaShellWithLargeFileCheck(source, filePath, fileName, confirmLargeFile);
        response = shellResult.response;
        shellSkippedLargeFile = shellResult.skippedLargeFile;
    }

    if (source.kind === 'session' && (!response.success || typeof response.content !== 'string') && isBase64Preview(preview)) {
        const shellResult = await readSessionBase64ViaShellWithLargeFileCheck(source, filePath, fileName, confirmLargeFile);
        response = shellResult.response;
        shellSkippedLargeFile = shellResult.skippedLargeFile;
    }

    if (isBase64Preview(preview) && shellSkippedLargeFile) {
        return {
            content: '',
            encoding: 'base64',
            isBinary: false,
            previewKind: preview.kind,
            skippedLargeFile: true,
            truncated: response.truncated ?? false,
            totalSize: response.totalSize,
        };
    }

    let userSkippedFullLoad = false;
    if (response.success && shouldConfirmLargeFile(response)) {
        const size = response.totalSize ? formatFileSize(response.totalSize) : formatFileSize(LARGE_FILE_CONFIRMATION_BYTES);
        const confirmed = confirmLargeFile
            ? await confirmLargeFile({ fileName, size, totalSize: response.totalSize })
            : false;

        if (confirmed) {
            response = await readPreviewFile(getConfirmedFileReadLimit(response.totalSize));
        } else {
            userSkippedFullLoad = true;
        }
    }

    if (!response.success || typeof response.content !== 'string') {
        throw new Error(response.error ?? 'Failed to read file');
    }

    if (isBase64Preview(preview) && (userSkippedFullLoad || response.truncated)) {
        return {
            content: '',
            encoding: 'base64',
            isBinary: false,
            previewKind: preview.kind,
            skippedLargeFile: true,
            truncated: response.truncated ?? false,
            totalSize: response.totalSize,
        };
    }

    if (preview.kind === 'image') {
        return {
            content: '',
            encoding: 'base64',
            isBinary: false,
            previewKind: 'image',
            imageUri: buildBase64DataUri(response.content, preview.mimeType),
            skippedLargeFile: false,
            truncated: response.truncated ?? false,
            totalSize: response.totalSize,
        };
    }

    let rawBytes: Uint8Array;
    let decodedContent: string;
    try {
        rawBytes = decodeBase64ToBytes(response.content);
        decodedContent = decodeUtf8Bytes(rawBytes);
    } catch {
        return {
            content: '',
            encoding: 'base64',
            isBinary: true,
            previewKind: 'binary',
            skippedLargeFile: false,
            truncated: response.truncated ?? false,
            totalSize: response.totalSize,
        };
    }

    const isBinary = preview.kind === 'svg' ? false : isDecodedContentBinary(rawBytes, decodedContent);
    return {
        content: isBinary ? '' : decodedContent,
        encoding: 'utf8',
        isBinary,
        previewKind: isBinary ? 'binary' : preview.kind,
        skippedLargeFile: false,
        truncated: response.truncated ?? false,
        totalSize: response.totalSize,
    };
}

async function readSessionBase64ViaShellWithLargeFileCheck(
    source: FilePreviewSource,
    filePath: string,
    fileName: string,
    confirmLargeFile?: ConfirmLargeFile,
): Promise<ShellBase64ReadResult> {
    const fallbackTotalSize = await getSessionFileByteSizeViaShell(source.id, filePath, source.cwd ?? null);
    if (fallbackTotalSize != null && fallbackTotalSize > LARGE_FILE_CONFIRMATION_BYTES) {
        const confirmed = confirmLargeFile
            ? await confirmLargeFile({ fileName, size: formatFileSize(fallbackTotalSize), totalSize: fallbackTotalSize })
            : false;
        if (!confirmed) {
            return {
                response: {
                    success: true,
                    content: '',
                    totalSize: fallbackTotalSize,
                    truncated: true,
                },
                skippedLargeFile: true,
            };
        }
    }

    const fallbackContent = await readSessionFileBase64ContentViaShell(source.id, filePath, source.cwd ?? null);
    return {
        response: {
            success: true,
            content: fallbackContent,
            totalSize: fallbackTotalSize ?? undefined,
            truncated: false,
        },
        skippedLargeFile: false,
    };
}
