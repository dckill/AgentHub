import Octicons from '@expo/vector-icons/Octicons';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { hapticsLight } from './haptics';
import { t } from '@/text';

interface AttachmentMenuProps {
    onProjectFiles: () => void;
    onLocalFiles: () => void;
}

const ITEM_HEIGHT = 48;

const stylesheet = StyleSheet.create((theme) => ({
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        height: ITEM_HEIGHT,
        gap: 10,
    },
    iconContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: theme.colors.surfaceHigh,
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        fontSize: 14,
        color: theme.colors.text,
        ...Typography.default(),
    },
}));

export const AttachmentMenu = React.memo((props: AttachmentMenuProps) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();

    return (
        <View
            accessibilityRole="menu"
            accessibilityLabel={t('attachmentMenu.projectFiles')}
        >
            <Pressable
                accessibilityRole="menuitem"
                onPress={() => {
                    hapticsLight();
                    props.onProjectFiles();
                }}
                style={({ pressed }) => ({
                    height: ITEM_HEIGHT,
                    backgroundColor: pressed
                        ? theme.colors.surfacePressed
                        : 'transparent',
                })}
            >
                <View style={styles.item}>
                    <View style={styles.iconContainer}>
                        <Octicons
                            name="repo"
                            size={15}
                            color={theme.colors.textSecondary}
                        />
                    </View>
                    <Text style={styles.label}>
                        {t('attachmentMenu.projectFiles')}
                    </Text>
                </View>
            </Pressable>
            <Pressable
                accessibilityRole="menuitem"
                onPress={() => {
                    hapticsLight();
                    props.onLocalFiles();
                }}
                style={({ pressed }) => ({
                    height: ITEM_HEIGHT,
                    backgroundColor: pressed
                        ? theme.colors.surfacePressed
                        : 'transparent',
                })}
            >
                <View style={styles.item}>
                    <View style={styles.iconContainer}>
                        <Ionicons
                            name="image-outline"
                            size={15}
                            color={theme.colors.textSecondary}
                        />
                    </View>
                    <Text style={styles.label}>
                        {t('attachmentMenu.localFiles')}
                    </Text>
                </View>
            </Pressable>
        </View>
    );
});
