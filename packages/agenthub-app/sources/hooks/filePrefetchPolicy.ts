export type FilePrefetchRange = {
    start: number;
    end: number;
    lookahead: number;
};

export function getFilePrefetchVersion(file: {
    status: string;
    isStaged: boolean;
    linesAdded: number;
    linesRemoved: number;
    oldPath?: string;
    headOid?: string;
    indexOid?: string;
}): string {
    return [
        file.status,
        file.isStaged ? 'staged' : 'unstaged',
        file.headOid ?? '',
        file.indexOid ?? '',
        file.linesAdded,
        file.linesRemoved,
        file.oldPath ?? '',
    ].join(':');
}

export function selectFilePrefetchWindow<T extends { fullPath: string }>(
    files: readonly T[],
    range: FilePrefetchRange,
): T[] {
    const unique = Array.from(new Map(files.map((file) => [file.fullPath, file])).values());
    const start = Math.max(0, Math.min(unique.length, range.start - range.lookahead));
    const end = Math.max(start, Math.min(unique.length, range.end + range.lookahead));
    return unique.slice(start, end);
}

export async function runFilePrefetchQueue<T>(
    values: readonly T[],
    task: (value: T) => Promise<void>,
    options: { concurrency: number; signal: AbortSignal },
): Promise<void> {
    let nextIndex = 0;
    async function worker(): Promise<void> {
        while (!options.signal.aborted) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= values.length) return;
            await task(values[index]);
        }
    }
    await Promise.all(Array.from(
        { length: Math.min(options.concurrency, values.length) },
        () => worker(),
    ));
}
