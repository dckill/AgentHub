import * as React from 'react';
import { ActionMenu, ActionMenuAnchor, ActionMenuItem } from './ActionMenu';
import { useSessionQuickActions } from '@/hooks/useSessionQuickActions';
import { useSession } from '@/sync/storage';
import type { Session } from '@/sync/storageTypes';

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

    const items = React.useMemo<ActionMenuItem[]>(() => actions.map((action) => ({
        id: action.id,
        icon: action.icon,
        label: action.label,
        onPress: action.onPress,
        destructive: action.destructive,
    })), [actions]);

    return (
        <ActionMenu
            anchor={anchor}
            items={items}
            onClose={onClose}
            visible={visible}
        />
    );
}
