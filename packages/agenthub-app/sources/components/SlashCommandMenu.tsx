import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { hapticsLight } from './haptics';
import { getAllCommands, type CommandItem } from '@/sync/suggestionCommands';
import { t } from '@/text';

interface SlashCommandMenuProps {
    sessionId: string;
    onSelect: (command: CommandItem) => void;
    hideCompact?: boolean;
}

const ITEM_HEIGHT = 48;
const GROUP_ORDER: NonNullable<CommandItem['category']>[] = ['common', 'builtin', 'extension'];

const stylesheet = StyleSheet.create((theme) => ({
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        minHeight: ITEM_HEIGHT,
        paddingVertical: 8,
    },
    itemBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
    },
    commandName: {
        fontSize: 14,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    commandDesc: {
        fontSize: 13,
        lineHeight: 18,
        color: theme.colors.textSecondary,
        flex: 1,
    },
    groupHeader: {
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 5,
    },
    groupHeaderText: {
        fontSize: 12,
        lineHeight: 16,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        ...Typography.default('semiBold'),
    },
}));

function getGroupTitle(category: NonNullable<CommandItem['category']>) {
    switch (category) {
        case 'common':
            return t('slashCommands.groups.common');
        case 'builtin':
            return t('slashCommands.groups.builtin');
        case 'extension':
            return t('slashCommands.groups.extension');
    }
}

export const SlashCommandMenu = React.memo((props: SlashCommandMenuProps) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();

    const commands = React.useMemo(() => {
        return getAllCommands(props.sessionId, { hideCompact: props.hideCompact });
    }, [props.hideCompact, props.sessionId]);

    const groupedCommands = React.useMemo(() => {
        return GROUP_ORDER
            .map((category) => ({
                category,
                commands: commands.filter((command) => (command.category ?? 'builtin') === category),
            }))
            .filter((group) => group.commands.length > 0);
    }, [commands]);

    return (
        <View
            accessibilityRole="menu"
            accessibilityLabel={t('slashCommands.help')}
        >
            {groupedCommands.map((group) => (
                <React.Fragment key={group.category}>
                    <View style={styles.groupHeader}>
                        <Text style={styles.groupHeaderText}>
                            {getGroupTitle(group.category)}
                        </Text>
                    </View>
                    {group.commands.map((cmd, index) => (
                        <Pressable
                            key={cmd.command}
                            accessibilityRole="menuitem"
                            onPress={() => {
                                hapticsLight();
                                props.onSelect(cmd);
                            }}
                            style={({ pressed }) => ({
                                minHeight: ITEM_HEIGHT,
                                backgroundColor: pressed
                                    ? theme.colors.surfacePressed
                                    : 'transparent',
                            })}
                        >
                            <View style={[styles.item, index < group.commands.length - 1 && styles.itemBorder]}>
                                <Text style={[styles.commandName, { marginRight: cmd.description ? 12 : 0 }]}>
                                    {cmd.label ?? `/${cmd.command}`}
                                </Text>
                                {cmd.description && (
                                    <Text style={styles.commandDesc} numberOfLines={2}>
                                        {cmd.description}
                                    </Text>
                                )}
                            </View>
                        </Pressable>
                    ))}
                </React.Fragment>
            ))}
        </View>
    );
});
