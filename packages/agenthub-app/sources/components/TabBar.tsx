import * as React from 'react';
import { View, Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { t } from '@/text';
import { Typography } from '@/constants/Typography';
import { layout } from '@/components/layout';
import { getAmberRaisedButtonVisuals } from './amberVisuals';
import { getAccessibleTabProps } from './accessibilityProps';

export type TabType = 'machines' | 'sessions' | 'settings';

interface TabBarProps {
    activeTab: TabType;
    onTabPress: (tab: TabType) => void;
}

const styles = StyleSheet.create((theme) => ({
    outerContainer: {
        backgroundColor: theme.colors.surface,
        borderTopWidth: 1,
        borderTopColor: theme.colors.divider,
    },
    innerContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'flex-start',
        maxWidth: layout.maxWidth,
        width: '100%',
        alignSelf: 'center',
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        paddingTop: 7,
        paddingBottom: 5,
    },
    tabContent: {
        alignItems: 'center',
        position: 'relative',
    },
    iconFrame: {
        width: 48,
        height: 32,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        overflow: 'hidden',
    },
    label: {
        fontSize: 10,
        marginTop: 3,
        ...Typography.default(),
    },
    labelActive: {
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    labelInactive: {
        color: theme.colors.textSecondary,
    },
}));

function TabIcon(props: { type: TabType; active: boolean }) {
    const { theme } = useUnistyles();
    const amberVisuals = getAmberRaisedButtonVisuals(theme);
    const color = props.active ? theme.colors.button.primary.tint : theme.colors.textSecondary;
    const frameBackground = props.active ? theme.colors.accent : 'transparent';
    const frameBorder = props.active ? amberVisuals.borderColor : 'transparent';
    const frameStyle = [
        styles.iconFrame,
        {
            backgroundColor: frameBackground,
            borderColor: frameBorder,
            shadowColor: props.active ? amberVisuals.shadowColor : 'transparent',
            shadowOpacity: props.active ? (theme.dark ? 0.38 : 0.22) : 0,
            shadowRadius: props.active ? 9 : 0,
            shadowOffset: { width: 0, height: 4 },
            elevation: props.active ? 2 : 0,
        },
    ];
    const activeFill = props.active ? (
        <>
            <LinearGradient
                pointerEvents="none"
                colors={amberVisuals.colors}
                start={{ x: 0.14, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            <View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    top: 2,
                    left: 8,
                    right: 8,
                    height: 6,
                    borderRadius: 6,
                    backgroundColor: amberVisuals.highlightColor,
                }}
            />
            <View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    top: 9,
                    left: 11,
                    right: 11,
                    height: 10,
                    borderRadius: 10,
                    backgroundColor: amberVisuals.secondaryHighlightColor,
                }}
            />
        </>
    ) : null;

    if (props.type === 'machines') {
        return (
            <View style={frameStyle}>
                {activeFill}
                <Ionicons name="desktop-outline" size={22} color={color} />
            </View>
        );
    }

    if (props.type === 'sessions') {
        return (
            <View style={frameStyle}>
                {activeFill}
                <Ionicons name="chatbubbles-outline" size={22} color={color} />
            </View>
        );
    }

    return (
        <View style={frameStyle}>
            {activeFill}
            <Ionicons name="settings-outline" size={23} color={color} />
        </View>
    );
}

export const TabBar = React.memo(({ activeTab, onTabPress }: TabBarProps) => {
    const insets = useSafeAreaInsets();

    const tabs: { key: TabType; label: string }[] = React.useMemo(() => {
        return [
            { key: 'machines', label: t('tabs.machines') },
            { key: 'sessions', label: t('tabs.sessions') },
            { key: 'settings', label: t('tabs.settings') },
        ];
    }, []);

    return (
        <View style={[styles.outerContainer, { paddingBottom: insets.bottom }]}>
            <View accessibilityRole="tablist" style={styles.innerContainer}>
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.key;

                    return (
                        <Pressable
                            key={tab.key}
                            {...getAccessibleTabProps(tab.label, isActive)}
                            style={styles.tab}
                            onPress={() => onTabPress(tab.key)}
                            hitSlop={8}
                        >
                            <View style={styles.tabContent}>
                                <TabIcon type={tab.key} active={isActive} />
                            </View>
                            <Text style={[
                                styles.label,
                                isActive ? styles.labelActive : styles.labelInactive
                            ]}>
                                {tab.label}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );
});
