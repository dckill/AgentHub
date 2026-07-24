import * as React from 'react';
import { GestureResponderEvent, Pressable } from 'react-native';
import { ActionMenu, ActionMenuAnchor, ActionMenuItem } from './ActionMenu';
import { useSessionQuickActions } from '@/hooks/useSessionQuickActions';
import { Session } from '@/sync/storageTypes';
import { t } from '@/text';

interface SessionActionsNativeMenuProps {
    children: React.ReactNode;
    onAfterArchive?: () => void;
    onAfterDelete?: () => void;
    session: Session;
}

export function SessionActionsNativeMenu({
    children,
    onAfterArchive,
    onAfterDelete,
    session,
}: SessionActionsNativeMenuProps) {
    const [anchor, setAnchor] = React.useState<ActionMenuAnchor | null>(null);
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

    const openMenu = React.useCallback((event: GestureResponderEvent) => {
        event.stopPropagation?.();
        const nativeEvent = event.nativeEvent;
        setAnchor({
            type: 'point',
            x: nativeEvent.pageX,
            y: nativeEvent.pageY,
        });
    }, []);

    const trigger = React.isValidElement(children)
        ? React.cloneElement(children, {
            accessibilityState: {
                ...(children.props as { accessibilityState?: object }).accessibilityState,
                expanded: !!anchor,
            },
            onPress: openMenu,
        } as Partial<React.ComponentProps<typeof Pressable>>)
        : (
            <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: !!anchor }}
                onPress={openMenu}
            >
                {children}
            </Pressable>
        );

    return (
        <>
            {trigger}
            <ActionMenu
                anchor={anchor}
                items={items}
                onClose={() => setAnchor(null)}
                title={t('sessionInfo.quickActions')}
                visible={!!anchor}
            />
        </>
    );
}
