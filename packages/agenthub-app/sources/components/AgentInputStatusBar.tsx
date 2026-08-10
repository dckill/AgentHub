import Ionicons from '@expo/vector-icons/Ionicons';
import * as React from 'react';
import { View, Text } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import type { PermissionMode } from './modelModeOptions';
import { StatusDot } from './StatusDot';

interface ConnectionStatus {
    text: string;
    color: string;
    dotColor: string;
    isPulsing?: boolean;
    cliStatus?: {
        claude: boolean | null;
        codex: boolean | null;
    };
}

interface AgentInputStatusBarProps {
    connectionStatus?: ConnectionStatus;
    contextWarning: { text: string; color: string } | null;
    displayPermissionMode: PermissionMode | null;
    permissionModeKey: string;
    isSandboxedYoloMode: boolean;
    withSandboxSuffix: (label: string, modeKey?: string) => string;
}

export const AgentInputStatusBar = React.memo((props: AgentInputStatusBarProps) => {
    const { theme } = useUnistyles();

    if (!props.connectionStatus && !props.contextWarning && (!props.displayPermissionMode || props.permissionModeKey === 'default')) {
        return null;
    }

    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingBottom: 4,
            minHeight: 20,
        }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 11 }}>
                {props.connectionStatus && (
                    <>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <StatusDot
                                color={props.connectionStatus.dotColor}
                                isPulsing={props.connectionStatus.isPulsing}
                                size={6}
                            />
                            <Text style={{
                                fontSize: 11,
                                color: props.connectionStatus.color,
                                ...Typography.default(),
                            }}>
                                {props.connectionStatus.text}
                            </Text>
                        </View>
                        {props.connectionStatus.cliStatus && (
                            <>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Text style={{
                                        fontSize: 11,
                                        color: props.connectionStatus.cliStatus.claude ? theme.colors.success : theme.colors.textDestructive,
                                        ...Typography.default(),
                                    }}>
                                        {props.connectionStatus.cliStatus.claude ? '✓' : '✗'}
                                    </Text>
                                    <Text style={{
                                        fontSize: 11,
                                        color: props.connectionStatus.cliStatus.claude ? theme.colors.success : theme.colors.textDestructive,
                                        ...Typography.default(),
                                    }}>
                                        claude
                                    </Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Text style={{
                                        fontSize: 11,
                                        color: props.connectionStatus.cliStatus.codex ? theme.colors.success : theme.colors.textDestructive,
                                        ...Typography.default(),
                                    }}>
                                        {props.connectionStatus.cliStatus.codex ? '✓' : '✗'}
                                    </Text>
                                    <Text style={{
                                        fontSize: 11,
                                        color: props.connectionStatus.cliStatus.codex ? theme.colors.success : theme.colors.textDestructive,
                                        ...Typography.default(),
                                    }}>
                                        codex
                                    </Text>
                                </View>
                            </>
                        )}
                    </>
                )}
                {props.contextWarning && (
                    <Text style={{
                        fontSize: 11,
                        color: props.contextWarning.color,
                        marginLeft: props.connectionStatus ? 8 : 0,
                        ...Typography.default(),
                    }}>
                        {props.connectionStatus ? '• ' : ''}{props.contextWarning.text}
                    </Text>
                )}
            </View>
            {props.displayPermissionMode && props.permissionModeKey !== 'default' && (() => {
                const permColor = props.isSandboxedYoloMode ? '#4169E1' :
                    props.permissionModeKey === 'acceptEdits' ? theme.colors.permission.acceptEdits :
                        props.permissionModeKey === 'bypassPermissions' ? theme.colors.permission.bypass :
                            props.permissionModeKey === 'plan' ? theme.colors.permission.plan :
                                props.permissionModeKey === 'read-only' ? theme.colors.permission.readOnly :
                                    props.permissionModeKey === 'safe-yolo' ? theme.colors.permission.safeYolo :
                                        props.permissionModeKey === 'yolo' ? theme.colors.permission.yolo :
                                            theme.colors.textSecondary;
                const permIcon: 'play-forward' | 'pause' = props.permissionModeKey === 'plan' || props.permissionModeKey === 'read-only'
                    ? 'pause' : 'play-forward';
                return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name={permIcon} size={11} color={permColor} />
                        <Text style={{ fontSize: 11, color: permColor, ...Typography.default() }}>
                            {props.withSandboxSuffix(props.displayPermissionMode.name, props.permissionModeKey)}
                        </Text>
                    </View>
                );
            })()}
        </View>
    );
});
