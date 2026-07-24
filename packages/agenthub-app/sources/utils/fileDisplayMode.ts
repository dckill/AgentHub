export type FileDisplayMode = 'file' | 'diff';

export interface FileDisplayModeContentState {
    hasDiffContent: boolean;
    hasFileContent: boolean;
    requestedLine: number | null;
    userSelectedDisplayMode: boolean;
}

export function resolveFileDisplayModeAfterContentUpdate(
    currentMode: FileDisplayMode,
    state: FileDisplayModeContentState,
): FileDisplayMode {
    if (state.userSelectedDisplayMode) return currentMode;
    if (state.requestedLine !== null && state.requestedLine > 0) return 'file';
    if (state.hasDiffContent) return 'diff';
    if (state.hasFileContent) return 'file';
    return currentMode;
}
