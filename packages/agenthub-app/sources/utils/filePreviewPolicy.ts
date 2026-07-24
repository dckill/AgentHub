export const LARGE_FILE_CONFIRMATION_BYTES = 2 * 1024 * 1024;
export const MAX_CONFIRMED_FILE_LOAD_BYTES = 32 * 1024 * 1024;

export type FilePreviewClassification =
    | { kind: 'text' }
    | { kind: 'image'; mimeType: string }
    | { kind: 'svg'; mimeType: 'image/svg+xml' }
    | { kind: 'binary' };

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
};

const BINARY_EXTENSIONS = new Set([
    'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv',
    'mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a',
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'zip', 'tar', 'gz', 'rar', '7z', 'bz2', 'xz',
    'exe', 'dmg', 'deb', 'rpm', 'apk', 'ipa',
    'woff', 'woff2', 'ttf', 'otf', 'eot',
    'db', 'sqlite', 'sqlite3',
    'bin', 'dat', 'class', 'jar', 'so', 'dll', 'dylib',
]);

export function getFileExtension(path: string): string {
    const fileName = path.split(/[\\/]/).pop() ?? path;
    const dotIndex = fileName.lastIndexOf('.');
    if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
        return '';
    }
    return fileName.slice(dotIndex + 1).toLowerCase();
}

export function classifyFilePreview(path: string): FilePreviewClassification {
    const ext = getFileExtension(path);

    if (ext === 'svg') {
        return { kind: 'svg', mimeType: 'image/svg+xml' };
    }

    const imageMimeType = IMAGE_MIME_BY_EXTENSION[ext];
    if (imageMimeType) {
        return { kind: 'image', mimeType: imageMimeType };
    }

    if (BINARY_EXTENSIONS.has(ext)) {
        return { kind: 'binary' };
    }

    return { kind: 'text' };
}

export function shouldConfirmLargeFile(opts: { totalSize?: number; truncated?: boolean }): boolean {
    return opts.truncated === true || (opts.totalSize ?? 0) > LARGE_FILE_CONFIRMATION_BYTES;
}

export function getConfirmedFileReadLimit(totalSize?: number): number {
    if (typeof totalSize === 'number' && Number.isFinite(totalSize) && totalSize > 0) {
        return Math.min(totalSize, MAX_CONFIRMED_FILE_LOAD_BYTES);
    }
    return MAX_CONFIRMED_FILE_LOAD_BYTES;
}

export function buildBase64DataUri(base64Content: string, mimeType: string): string {
    return `data:${mimeType};base64,${base64Content}`;
}

export function isDecodedContentBinary(rawBytes: Uint8Array, decodedContent: string): boolean {
    if (rawBytes.length === 0 && decodedContent.length === 0) {
        return false;
    }

    if (rawBytes.some((byte) => byte === 0)) {
        return true;
    }

    if (decodedContent.length === 0) {
        return false;
    }

    const nonPrintableCount = decodedContent.split('').filter(char => {
        const code = char.charCodeAt(0);
        return code < 32 && code !== 9 && code !== 10 && code !== 13;
    }).length;

    return nonPrintableCount / decodedContent.length > 0.1;
}
