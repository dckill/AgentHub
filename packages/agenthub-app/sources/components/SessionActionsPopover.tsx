import * as React from 'react';
import { ActionMenu, ActionMenuAnchor, ActionMenuItem } from './ActionMenu';
import { useSessionQuickActions } from '@/hooks/useSessionQuickActions';
import { useSession } from '@/sync/storage';
import type { Session } from '@/sync/storageTypes';
import { Platform } from 'react-native';
import {
    formatShortcutChord,
    getPreferredShortcutModifier,
    matchesShortcutChord,
    SESSION_ACTION_SHORTCUTS,
    type SessionActionShortcutId,
} from '@/keyboard/shortcuts';

export type SessionActionsAnchor = ActionMenuAnchor;

interface SessionActionsPopoverProps {
    anchor: SessionActionsAnchor | null;
    onAfterArchive?: () => void;
    onAfterDelete?: () => void;
    onClose: () => void;
    sessionId: string;
    visible: boolean;
}

export function SessionActionsPopover({
    anchor,
    onAfterArchive,
    onAfterDelete,
    onClose,
    sessionId,
    visible,
}: SessionActionsPopoverProps) {
    const session = useSession(sessionId);

    if (!session) {
        return null;
    }

    return (
        <SessionActionsPopoverContent
            anchor={anchor}
            onAfterArchive={onAfterArchive}
            onAfterDelete={onAfterDelete}
            onClose={onClose}
            session={session}
            visible={visible}
        />
    );
}

function SessionActionsPopoverContent({
    anchor,
    onAfterArchive,
    onAfterDelete,
    onClose,
    session,
    visible,
}: Omit<SessionActionsPopoverProps, 'sessionId'> & { session: Session }) {
    const { actionItems: actions } = useSessionQuickActions(session, {
        onAfterArchive,
        onAfterDelete,
    });
    const preferredModifier = React.useMemo(() => getPreferredShortcutModifier(
        typeof navigator === 'undefined' ? undefined : navigator,
    ), []);

    const runAction = React.useCallback((action: (typeof actions)[number]) => {
        onClose();
        action.onPress();
    }, [onClose]);

    React.useEffect(() => {
        if (Platform.OS !== 'web' || typeof window === 'undefined' || !visible || !anchor) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            const action = actions.find((candidate) => {
                const chord = SESSION_ACTION_SHORTCUTS[candidate.id as SessionActionShortcutId];
                return chord ? matchesShortcutChord(event, preferredModifier, chord) : false;
            });
            if (!action) return;
            event.preventDefault();
            event.stopPropagation();
            runAction(action);
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [actions, anchor, preferredModifier, runAction, visible]);

    const items = React.useMemo<ActionMenuItem[]>(() => actions.map((action) => ({
        id: action.id,
        icon: action.icon,
        label: (() => {
            const chord = SESSION_ACTION_SHORTCUTS[action.id as SessionActionShortcutId];
            return Platform.OS === 'web' && chord
                ? `${action.label}  ${formatShortcutChord(preferredModifier, chord)}`
                : action.label;
        })(),
        onPress: action.onPress,
        destructive: action.destructive,
    })), [actions, preferredModifier]);

    return (
        <ActionMenu
            anchor={anchor}
            items={items}
            onClose={onClose}
            visible={visible}
        />
    );
}
