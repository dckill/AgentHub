import React, { useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Modal } from '@/modal';
import { CommandPalette } from './CommandPalette';
import { Command } from './types';
import { useGlobalKeyboard } from '@/hooks/useGlobalKeyboard';
import { useAuth } from '@/auth/AuthContext';
import { storage } from '@/sync/storage';
import { useShallow } from 'zustand/react/shallow';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { formatShortcut, getPreferredShortcutModifier } from '@/keyboard/shortcuts';
import { isTauri } from '@/utils/isTauri';
import { ShortcutHintsProvider } from '@/components/ShortcutHints';

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const { logout, isAuthenticated } = useAuth();
    const sessions = storage(useShallow((state) => state.sessions));
    const commandPaletteEnabled = storage(useShallow((state) => state.localSettings.commandPaletteEnabled));
    const navigateToSession = useNavigateToSession();
    const preferredModifier = useMemo(() => getPreferredShortcutModifier(
        typeof navigator === 'undefined' ? undefined : navigator,
    ), []);
    const browserSafeShortcuts = useMemo(() => Platform.OS === 'web' && !isTauri(), []);
    const recentSessions = useMemo(() => Object.values(sessions)
        .filter((session) => session.active !== false && session.metadata?.lifecycleState !== 'archived' && !session.metadata?.isSideChat)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 9), [sessions]);

    // Define available commands
    const commands = useMemo((): Command[] => {
        const cmds: Command[] = [
            // Navigation commands
            {
                id: 'new-session',
                title: 'New Session',
                subtitle: 'Start a new chat session',
                icon: 'add-circle-outline',
                category: 'Sessions',
                shortcut: formatShortcut(preferredModifier, 'N', browserSafeShortcuts),
                action: () => {
                    router.navigate('/new');
                }
            },
            {
                id: 'sessions',
                title: 'View All Sessions',
                subtitle: 'Browse your chat history',
                icon: 'chatbubbles-outline',
                category: 'Sessions',
                action: () => {
                    router.push('/');
                }
            },
            {
                id: 'settings',
                title: 'Settings',
                subtitle: 'Configure your preferences',
                icon: 'settings-outline',
                category: 'Navigation',
                shortcut: formatShortcut(preferredModifier, ',', browserSafeShortcuts),
                action: () => {
                    router.push('/settings');
                }
            },
            {
                id: 'account',
                title: 'Account',
                subtitle: 'Manage your account',
                icon: 'person-circle-outline',
                category: 'Navigation',
                action: () => {
                    router.push('/settings/account');
                }
            },
        ];

        // Add session-specific commands
        recentSessions.forEach(session => {
            const sessionName = session.metadata?.name || `Session ${session.id.slice(0, 6)}`;
            cmds.push({
                id: `session-${session.id}`,
                title: sessionName,
                subtitle: session.metadata?.path || 'Switch to session',
                icon: 'time-outline',
                category: 'Recent Sessions',
                shortcut: formatShortcut(preferredModifier, String(recentSessions.indexOf(session) + 1), browserSafeShortcuts),
                action: () => {
                    navigateToSession(session.id);
                }
            });
        });

        // System commands
        cmds.push({
            id: 'sign-out',
            title: 'Sign Out',
            subtitle: 'Sign out of your account',
            icon: 'log-out-outline',
            category: 'System',
            action: async () => {
                await logout();
            }
        });

        // Dev commands (if in development)
        if (__DEV__) {
            cmds.push({
                id: 'dev-menu',
                title: 'Developer Menu',
                subtitle: 'Access developer tools',
                icon: 'code-slash-outline',
                category: 'Developer',
                action: () => {
                    router.push('/dev');
                }
            });
        }

        return cmds;
    }, [browserSafeShortcuts, logout, navigateToSession, preferredModifier, recentSessions, router]);

    const showCommandPalette = useCallback(() => {
        if (Platform.OS !== 'web' || !isAuthenticated || !commandPaletteEnabled) return;
        
        Modal.show({
            component: CommandPalette,
            props: {
                commands,
            }
        } as any);
    }, [commands, commandPaletteEnabled, isAuthenticated]);

    const openRecentSession = useCallback((index: number) => {
        const session = recentSessions[index];
        if (!session) return false;
        navigateToSession(session.id);
        return true;
    }, [navigateToSession, recentSessions]);

    const visibleModifier = useGlobalKeyboard({
        commandPalette: isAuthenticated && commandPaletteEnabled ? showCommandPalette : undefined,
        newSession: isAuthenticated ? () => router.navigate('/new') : undefined,
        settings: isAuthenticated ? () => router.push('/settings') : undefined,
        recentSession: isAuthenticated ? openRecentSession : undefined,
    }, browserSafeShortcuts);

    return (
        <ShortcutHintsProvider
            modifier={isAuthenticated ? visibleModifier : null}
            commandPaletteEnabled={isAuthenticated && commandPaletteEnabled}
            browserSafeShortcuts={browserSafeShortcuts}
        >
            {children}
        </ShortcutHintsProvider>
    );
}
