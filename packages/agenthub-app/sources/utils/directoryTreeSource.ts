import {
    machineGetDirectoryTree,
    machineListDirectory,
    machineRPCAvailable,
    sessionGetDirectoryTree,
    sessionListDirectory,
    sessionRPCAvailable,
} from '@/sync/ops';
import type {
    SessionGetDirectoryTreeResponse,
    SessionListDirectoryResponse,
} from '@/sync/ops';

export type DirectoryTreeSourceDescriptor =
    | { kind: 'session'; sessionId: string }
    | { kind: 'machine'; machineId: string };

type DirectoryTreeSourceDeps = {
    machineGetDirectoryTree: typeof machineGetDirectoryTree;
    machineListDirectory: typeof machineListDirectory;
    machineRPCAvailable: typeof machineRPCAvailable;
    sessionGetDirectoryTree: typeof sessionGetDirectoryTree;
    sessionListDirectory: typeof sessionListDirectory;
    sessionRPCAvailable: typeof sessionRPCAvailable;
};

export type DirectoryTreeSource = {
    getDirectoryTree: (path: string, maxDepth: number) => Promise<SessionGetDirectoryTreeResponse>;
    listDirectory: (path: string) => Promise<SessionListDirectoryResponse>;
    isMethodAvailable: (method: 'getDirectoryTree' | 'listDirectory') => Promise<boolean>;
};

const defaultDeps: DirectoryTreeSourceDeps = {
    machineGetDirectoryTree,
    machineListDirectory,
    machineRPCAvailable,
    sessionGetDirectoryTree,
    sessionListDirectory,
    sessionRPCAvailable,
};

export function createDirectoryTreeSource(
    descriptor: DirectoryTreeSourceDescriptor,
    deps: DirectoryTreeSourceDeps = defaultDeps,
): DirectoryTreeSource {
    if (descriptor.kind === 'machine') {
        return {
            getDirectoryTree: (path, maxDepth) => deps.machineGetDirectoryTree(descriptor.machineId, path, maxDepth),
            listDirectory: (path) => deps.machineListDirectory(descriptor.machineId, path),
            isMethodAvailable: (method) => deps.machineRPCAvailable(descriptor.machineId, method),
        };
    }

    return {
        getDirectoryTree: (path, maxDepth) => deps.sessionGetDirectoryTree(descriptor.sessionId, path, maxDepth),
        listDirectory: (path) => deps.sessionListDirectory(descriptor.sessionId, path),
        isMethodAvailable: (method) => deps.sessionRPCAvailable(descriptor.sessionId, method),
    };
}

export function getDirectoryBrowserRootPath(
    descriptor: DirectoryTreeSourceDescriptor,
    rootPath?: string | null,
): string | null {
    if (typeof rootPath === 'string' && rootPath.length > 0) {
        return rootPath;
    }
    if (rootPath === null) {
        return null;
    }
    return descriptor.kind === 'machine' ? '/' : null;
}
