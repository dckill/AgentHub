import * as React from 'react';
import type { TreeNode } from '@/sync/ops';
import {
    createDirectoryTreeSource,
    getDirectoryBrowserRootPath,
    type DirectoryTreeSourceDescriptor,
} from '@/utils/directoryTreeSource';

// Extended tree node with lazy-loaded children state
export type LocalTreeNode = {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;
    modified?: number;
    childrenLoaded: boolean;
    children: LocalTreeNode[];
};

function toLocalTreeNode(node: TreeNode): LocalTreeNode {
    return {
        name: node.name,
        path: node.path,
        type: node.type,
        size: node.size,
        modified: node.modified,
        childrenLoaded: node.type === 'directory' ? (node.children?.length ?? 0) > 0 : true,
        children: (node.children ?? []).map(toLocalTreeNode),
    };
}

function sortLocalTree(nodes: LocalTreeNode[]): LocalTreeNode[] {
    const sorted = [...nodes].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
    for (const node of sorted) {
        if (node.type === 'directory') {
            node.children = sortLocalTree(node.children);
        }
    }
    return sorted;
}

// Insert loaded children into the tree at the given path (matches by node.path)
function insertChildren(tree: LocalTreeNode[], targetPath: string, children: LocalTreeNode[]): LocalTreeNode[] {
    return tree.map((node) => {
        if (node.type === 'directory' && node.path === targetPath) {
            return { ...node, children: sortLocalTree(children), childrenLoaded: true };
        }
        if (node.type === 'directory' && node.children.length > 0) {
            const updatedChildren = insertChildren(node.children, targetPath, children);
            if (updatedChildren !== node.children) {
                return { ...node, children: updatedChildren };
            }
        }
        return node;
    });
}

// Find a node by its exact path in the tree
function findNodeByPath(nodes: LocalTreeNode[], targetPath: string): LocalTreeNode | undefined {
    for (const node of nodes) {
        if (node.path === targetPath) return node;
        if (node.type === 'directory' && node.children.length > 0) {
            const found = findNodeByPath(node.children, targetPath);
            if (found) return found;
        }
    }
    return undefined;
}

function getUnavailableDirectoryRpcMessage(descriptorKind: DirectoryTreeSourceDescriptor['kind']): string {
    return descriptorKind === 'session'
        ? 'Session connection is not ready yet. Try again after it reconnects.'
        : 'Machine daemon is not ready yet. Try again after it reconnects.';
}

export function useDirectoryTree(sourceDescriptor: DirectoryTreeSourceDescriptor | string, rootPath?: string | null) {
    const [tree, setTree] = React.useState<LocalTreeNode[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
    const [loadingPaths, setLoadingPaths] = React.useState<Set<string>>(() => new Set());
    const [error, setError] = React.useState<string | null>(null);
    const descriptorKind = typeof sourceDescriptor === 'string' ? 'session' : sourceDescriptor.kind;
    const descriptorId = typeof sourceDescriptor === 'string'
        ? sourceDescriptor
        : sourceDescriptor.kind === 'session'
            ? sourceDescriptor.sessionId
            : sourceDescriptor.machineId;
    const descriptor: DirectoryTreeSourceDescriptor = React.useMemo(() => (
        descriptorKind === 'session'
            ? { kind: 'session', sessionId: descriptorId }
            : { kind: 'machine', machineId: descriptorId }
    ), [descriptorId, descriptorKind]);
    const source = React.useMemo(() => createDirectoryTreeSource(descriptor), [descriptor]);
    const effectiveRootPath = React.useMemo(
        () => getDirectoryBrowserRootPath(descriptor, rootPath),
        [descriptor, rootPath],
    );

    // Load initial tree
    React.useEffect(() => {
        if (!effectiveRootPath) {
            setTree([]);
            setIsLoading(false);
            return;
        }
        let cancelled = false;

        const load = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const available = await source.isMethodAvailable('getDirectoryTree');
                if (!available) {
                    if (!cancelled) {
                        setTree([]);
                        setError(getUnavailableDirectoryRpcMessage(descriptor.kind));
                    }
                    return;
                }
                const result = await source.getDirectoryTree(effectiveRootPath, 1);
                if (!cancelled) {
                    if (result.success && result.tree) {
                        const localChildren = sortLocalTree(
                            (result.tree.children ?? []).map(toLocalTreeNode),
                        );
                        setTree(localChildren);
                    } else {
                        setError(result.error ?? 'Failed to load directory');
                    }
                }
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : 'Unknown error');
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        load();
        return () => { cancelled = true; };
    }, [descriptor.kind, effectiveRootPath, source]);

    const toggleNode = React.useCallback(async (path: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });

        // If expanding and children not yet loaded, fetch them
        // Use a ref-like approach to get current state inside callback
        setTree((currentTree) => {
            const node = findNodeByPath(currentTree, path);

            if (node && !node.childrenLoaded) {
                setLoadingPaths((prev) => new Set(prev).add(path));

                (async () => {
                    try {
                        const available = await source.isMethodAvailable('listDirectory');
                        if (!available) {
                            setError(getUnavailableDirectoryRpcMessage(descriptor.kind));
                            return;
                        }
                        const result = await source.listDirectory(path);
                        if (result.success && result.entries) {
                            const children: LocalTreeNode[] = result.entries.map((entry) => ({
                                name: entry.name,
                                path: `${path}/${entry.name}`,
                                type: entry.type === 'directory' ? 'directory' : 'file',
                                size: entry.size,
                                modified: entry.modified,
                                childrenLoaded: entry.type !== 'directory',
                                children: [],
                            }));
                            setTree((prev) => insertChildren(prev, path, children));
                        }
                    } finally {
                        setLoadingPaths((prev) => {
                            const next = new Set(prev);
                            next.delete(path);
                            return next;
                        });
                    }
                })();
            }

            return currentTree; // Don't modify tree here, just reading
        });
    }, [descriptor.kind, source]);

    const refresh = React.useCallback(() => {
        setExpanded(new Set());
        setTree([]);
        if (!effectiveRootPath) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);

        const load = async () => {
            setError(null);
            try {
                const available = await source.isMethodAvailable('getDirectoryTree');
                if (!available) {
                    setError(getUnavailableDirectoryRpcMessage(descriptor.kind));
                    setTree([]);
                    return;
                }
                const result = await source.getDirectoryTree(effectiveRootPath, 1);
                if (result.success && result.tree) {
                    setTree(sortLocalTree((result.tree.children ?? []).map(toLocalTreeNode)));
                } else {
                    setError(result.error ?? 'Failed to load directory');
                }
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Unknown error');
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [descriptor.kind, effectiveRootPath, source]);

    const collapseAll = React.useCallback(() => {
        setExpanded(new Set());
    }, []);

    const expandAll = React.useCallback(() => {
        const allDirPaths: string[] = [];
        const collect = (nodes: LocalTreeNode[]) => {
            for (const node of nodes) {
                if (node.type === 'directory') {
                    allDirPaths.push(node.path);
                    collect(node.children);
                }
            }
        };
        collect(tree);
        setExpanded(new Set(allDirPaths));
    }, [tree]);

    return {
        tree,
        isLoading,
        error,
        expanded,
        loadingPaths,
        toggleNode,
        refresh,
        collapseAll,
        expandAll,
    } as const;
}
