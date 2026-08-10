import { describe, expect, it, vi } from 'vitest';
import { handleDeleteArtifactRealtime } from './deleteArtifactRealtimeHandler';

describe('handleDeleteArtifactRealtime', () => {
    it('logs receipt and delegates artifact cleanup', () => {
        const applyDelete = vi.fn();
        const log = vi.fn();

        handleDeleteArtifactRealtime({
            artifactId: 'artifact-1',
            deleteArtifact: vi.fn(),
            deleteDataKey: vi.fn(),
            log,
            applyDelete,
        });

        expect(log).toHaveBeenCalledWith('📦 Received delete-artifact update');
        expect(applyDelete).toHaveBeenCalledWith('artifact-1', expect.objectContaining({
            deleteArtifact: expect.any(Function),
            deleteDataKey: expect.any(Function),
        }));
    });

    it('passes canonical cleanup callbacks to the injected application', () => {
        const actions = {
            deleteArtifact: vi.fn(),
            deleteDataKey: vi.fn(),
        };
        const applyDelete = vi.fn();

        handleDeleteArtifactRealtime({
            artifactId: 'artifact-2',
            ...actions,
            log: vi.fn(),
            applyDelete,
        });

        expect(applyDelete).toHaveBeenCalledWith('artifact-2', actions);
    });

    it('uses the canonical application by default', () => {
        const actions = {
            deleteArtifact: vi.fn(),
            deleteDataKey: vi.fn(),
        };

        handleDeleteArtifactRealtime({
            artifactId: 'artifact-3',
            ...actions,
            log: vi.fn(),
        });

        expect(actions.deleteArtifact).toHaveBeenCalledWith('artifact-3');
        expect(actions.deleteDataKey).toHaveBeenCalledWith('artifact-3');
    });
});
