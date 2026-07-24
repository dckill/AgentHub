import React from 'react';
import { Text, View } from 'react-native';
import { BaseModal } from './BaseModal';
import { AlertModalConfig, ConfirmModalConfig } from '../types';
import { Typography } from '@/constants/Typography';
import { StyleSheet } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { GlassButton } from '@/components/glass';
import { CenteredModalFrame } from './CenteredModalFrame';
import { t } from '@/text';

interface WebAlertModalProps {
    config: AlertModalConfig | ConfirmModalConfig;
    onClose: () => void;
    onConfirm?: (value: boolean) => void;
}

export function WebAlertModal({ config, onClose, onConfirm }: WebAlertModalProps) {
    const { theme } = useUnistyles();
    const isConfirm = config.type === 'confirm';
    
    const handleButtonPress = (buttonIndex: number) => {
        if (isConfirm && onConfirm) {
            onConfirm(buttonIndex === 1);
        } else if (!isConfirm && config.buttons?.[buttonIndex]?.onPress) {
            config.buttons[buttonIndex].onPress!();
        }
        onClose();
    };

    const buttons = isConfirm
        ? [
            { text: config.cancelText || t('common.cancel'), style: 'cancel' as const },
            { text: config.confirmText || t('common.ok'), style: config.destructive ? 'destructive' as const : 'default' as const }
        ]
        : config.buttons || [{ text: t('common.ok'), style: 'default' as const }];

    const styles = StyleSheet.create({
        title: {
            fontSize: 18,
            lineHeight: 24,
            textAlign: 'left',
            color: theme.colors.text,
            marginBottom: 6
        },
        message: {
            fontSize: 14,
            textAlign: 'left',
            color: theme.colors.textSecondary,
            marginTop: 2,
            lineHeight: 20
        },
        footerButton: {
            flex: 1,
        },
        destructiveText: {
            color: theme.colors.textDestructive
        }
    });

    return (
        <BaseModal
            visible={true}
            accessibilityLabel={config.title}
            onClose={onClose}
            closeOnBackdrop={false}
        >
            <CenteredModalFrame
                maxWidth={380}
                footer={
                    <>
                        {buttons.map((button, index) => {
                            const isPrimary = isConfirm && index === 1;
                            const isDestructive = button.style === 'destructive';
                            return (
                                <GlassButton
                                    key={index}
                                    title={button.text}
                                    variant={isDestructive ? 'danger' : isPrimary ? 'primary' : 'secondary'}
                                    style={styles.footerButton}
                                    onPress={() => handleButtonPress(index)}
                                />
                            );
                        })}
                    </>
                }
            >
                <View>
                    <Text style={[styles.title, Typography.default('semiBold')]}>
                        {config.title}
                    </Text>
                    {config.message && (
                        <Text style={[styles.message, Typography.default()]}>
                            {config.message}
                        </Text>
                    )}
                </View>
            </CenteredModalFrame>
        </BaseModal>
    );
}
