/** Preserve valid empty artifact text; only nullish decrypt results become null. */
export function projectArtifactPlaintext(value: string | null | undefined): string | null {
    return value ?? null;
}
