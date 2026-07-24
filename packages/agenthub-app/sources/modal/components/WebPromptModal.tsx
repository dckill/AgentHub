import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardTypeOptions, Platform } from 'react-native';
import { BaseModal } from './BaseModal';
import { PromptModalConfig } from '../types';
import { Typography } from '@/constants/Typography';
import { useUnistyles } from 'react-native-unistyles';
import { GlassButton, GlassTextField } from '@/components/glass';
import { CenteredModalFrame } from './CenteredModalFrame';
import { t } from '@/text';

interface WebPromptModalProps {
    config: PromptModalConfig;
    onClose: () => void;
    onConfirm: (value: string | null) => void;
}

export function WebPromptModal({ config, onClose, onConfirm }: WebPromptModalProps) {
    const { theme } = useUnistyles();
    const [inputValue, setInputValue] = useState(config.defaultValue || '');
    const inputRef = useRef<TextInput>(null);

    useEffect(() => {
        // Auto-focus the input when modal opens
        const timer = setTimeout(() => {
            inputRef.current?.focus();
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    const handleCancel = () => {
        onConfirm(null);
        onClose();
    };

    const handleConfirm = () => {
        onConfirm(inputValue);
        onClose();
    };

    const getKeyboardType = (): KeyboardTypeOptions => {
        switch (config.inputType) {
            case 'email-address':
                return 'email-address';
            case 'numeric':
                return 'numeric';
            default:
                return 'default';
        }
    };

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
        input: {
            marginTop: 16,
        },
        form: {
            width: '100%',
        },
        footerButton: {
            flex: 1,
        }
    });

    return (
        <BaseModal
            visible={true}
            accessibilityLabel={config.title}
            onClose={handleCancel}
            closeOnBackdrop={false}
        >
            <CenteredModalFrame
                maxWidth={400}
                footer={
                    <>
                        <GlassButton
                            title={config.cancelText || t('common.cancel')}
                            variant="secondary"
                            style={styles.footerButton}
                            onPress={handleCancel}
                        />
                        <GlassButton
                            title={config.confirmText || t('common.ok')}
                            variant="primary"
                            style={styles.footerButton}
                            onPress={handleConfirm}
                        />
                    </>
                }
            >
                <View style={styles.form}>
                    <Text style={[styles.title, Typography.default('semiBold')]}>
                        {config.title}
                    </Text>
                    {config.message && (
                        <Text style={[styles.message, Typography.default()]}>
                            {config.message}
                        </Text>
                    )}
                    <GlassTextField
                        ref={inputRef}
                        inputStyle={styles.input}
                        value={inputValue}
                        onChangeText={setInputValue}
                        placeholder={config.placeholder}
                        keyboardType={getKeyboardType()}
                        secureTextEntry={config.inputType === 'secure-text'}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoFocus={Platform.OS === 'web'}
                        onSubmitEditing={handleConfirm}
                        returnKeyType="done"
                    />
                </View>
            </CenteredModalFrame>
        </BaseModal>
    );
}
