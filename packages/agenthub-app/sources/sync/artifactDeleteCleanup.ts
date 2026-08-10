export type ArtifactDeleteCleanup = {
    deleteArtifact: (artifactId: string) => void;
    deleteDataKey: (artifactId: string) => void;
};

/** Remove a deleted artifact and release its in-memory encryption key. */
export function cleanupDeletedArtifact(artifactId: string, cleanup: ArtifactDeleteCleanup): void {
    cleanup.deleteArtifact(artifactId);
    cleanup.deleteDataKey(artifactId);
}
