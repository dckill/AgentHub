import * as React from 'react';
import { TouchableWithoutFeedback, View, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import { hapticsLight } from './haptics';
import { AgentInputRadioOption } from './AgentInputRadioOption';
import { FloatingOverlay } from './FloatingOverlay';
import type { EffortLevel, ModelMode, PermissionMode } from './modelModeOptions';

interface AgentInputSettingsOverlayProps {
    isCodex: boolean;
    isWide: boolean;
    availableModes: PermissionMode[];
    permissionModeKey: string;
    availableModels: ModelMode[];
    modelModeKey?: string;
    availableEffortLevels: EffortLevel[];
    effortLevelKey?: string;
    onDismiss: () => void;
    onPermissionModeChange?: (mode: PermissionMode) => void;
    onModelModeChange?: (mode: ModelMode) => void;
    onEffortLevelChange?: (level: EffortLevel) => void;
    withSandboxSuffix: (label: string, modeKey?: string) => string;
}

const styles = StyleSheet.create((theme) => ({
    backdrop: {
        position: 'absolute',
        top: -1000,
        left: -1000,
        right: -1000,
        bottom: -1000,
        zIndex: 999,
    },
    container: {
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        marginBottom: 8,
        zIndex: 1000,
    },
    content: {
        paddingVertical: 8,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.textSecondary,
        paddingHorizontal: 16,
        paddingBottom: 4,
        ...Typography.default('semiBold'),
    },
    divider: {
        height: 1,
        backgroundColor: theme.colors.divider,
        marginHorizontal: 16,
    },
    columns: {
        flexDirection: 'row',
    },
    column: {
        paddingVertical: 8,
        flex: 1,
    },
    columnDivider: {
        width: 1,
        backgroundColor: theme.colors.divider,
        marginVertical: 8,
    },
    emptyText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        paddingHorizontal: 16,
        paddingVertical: 8,
        ...Typography.default(),
    },
}));

export const AgentInputSettingsOverlay = React.memo((props: AgentInputSettingsOverlayProps) => {
    return (
        <>
            <TouchableWithoutFeedback onPress={props.onDismiss}>
                <View accessible={false} style={styles.backdrop} />
            </TouchableWithoutFeedback>
            <View style={[styles.container, { paddingHorizontal: props.isWide ? 0 : 8 }]}>
                <FloatingOverlay maxHeight={400} keyboardShouldPersistTaps="always">
                    <View style={styles.content}>
                        <View
                            role="radiogroup"
                            accessibilityLabel={props.isCodex ? t('agentInput.codexPermissionMode.title') : t('agentInput.permissionMode.title')}
                        >
                            <Text style={styles.sectionTitle}>
                                {props.isCodex ? t('agentInput.codexPermissionMode.title') : t('agentInput.permissionMode.title')}
                            </Text>
                            {props.availableModes.map((mode) => (
                                <AgentInputRadioOption
                                    key={mode.key}
                                    label={props.withSandboxSuffix(mode.name, mode.key)}
                                    description={mode.description ?? undefined}
                                    selected={props.permissionModeKey === mode.key}
                                    onPress={() => {
                                        hapticsLight();
                                        props.onPermissionModeChange?.(mode);
                                        props.onDismiss();
                                    }}
                                />
                            ))}
                        </View>

                        <View style={styles.divider} />

                        <View style={styles.columns}>
                            <View role="radiogroup" accessibilityLabel={t('agentInput.model.title')} style={styles.column}>
                                <Text style={styles.sectionTitle}>{t('agentInput.model.title')}</Text>
                                {props.availableModels.length > 0 ? (
                                    props.availableModels.map((model) => (
                                        <AgentInputRadioOption
                                            key={model.key}
                                            label={model.name}
                                            selected={props.modelModeKey === model.key}
                                            onPress={() => {
                                                hapticsLight();
                                                props.onModelModeChange?.(model);
                                                props.onDismiss();
                                            }}
                                        />
                                    ))
                                ) : (
                                    <Text style={styles.emptyText}>{t('agentInput.model.configureInCli')}</Text>
                                )}
                            </View>

                            {props.availableEffortLevels.length > 0 && props.onEffortLevelChange && (
                                <>
                                    <View style={styles.columnDivider} />
                                    <View role="radiogroup" accessibilityLabel={t('agentInput.effort.title')} style={styles.column}>
                                        <Text style={styles.sectionTitle}>{t('agentInput.effort.title')}</Text>
                                        {props.availableEffortLevels.map((level) => (
                                            <AgentInputRadioOption
                                                key={level.key}
                                                label={level.name}
                                                selected={props.effortLevelKey === level.key}
                                                onPress={() => {
                                                    hapticsLight();
                                                    props.onEffortLevelChange?.(level);
                                                    props.onDismiss();
                                                }}
                                            />
                                        ))}
                                    </View>
                                </>
                            )}
                        </View>
                    </View>
                </FloatingOverlay>
            </View>
        </>
    );
});
