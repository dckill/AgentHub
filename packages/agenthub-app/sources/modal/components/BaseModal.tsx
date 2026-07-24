import React, { useEffect, useRef } from 'react';
import {
    View,
    Modal,
    TouchableWithoutFeedback,
    Animated,
    StyleSheet,
    KeyboardAvoidingView,
    Platform
} from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

// On web, stop events from propagating to expo-router's modal overlay
// which intercepts clicks when it applies pointer-events: none to body
const stopPropagation = (e: { stopPropagation: () => void }) => e.stopPropagation();
const webEventHandlers = Platform.OS === 'web'
    ? { onClick: stopPropagation, onPointerDown: stopPropagation, onTouchStart: stopPropagation }
    : {};

interface BaseModalProps {
    visible: boolean;
    accessibilityLabel?: string;
    onClose?: () => void;
    children: React.ReactNode;
    animationType?: 'fade' | 'slide' | 'none';
    transparent?: boolean;
    closeOnBackdrop?: boolean;
}

export function BaseModal({
    visible,
    accessibilityLabel,
    onClose,
    children,
    animationType = 'fade',
    transparent = true,
    closeOnBackdrop = true
}: BaseModalProps) {
    const { theme } = useUnistyles();
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true
            }).start();
        } else {
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true
            }).start();
        }
    }, [visible, fadeAnim]);

    const handleBackdropPress = () => {
        if (closeOnBackdrop && onClose) {
            onClose();
        }
    };

    return (
        <Modal
            visible={visible}
            accessibilityLabel={accessibilityLabel}
            transparent={transparent}
            animationType={animationType}
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                {...webEventHandlers}
            >
                <TouchableWithoutFeedback onPress={handleBackdropPress}>
                    <Animated.View 
                        style={[
                            styles.backdrop,
                            { backgroundColor: theme.colors.overlay.scrim },
                            {
                                opacity: fadeAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0, theme.dark ? 0.78 : 0.62]
                                })
                            }
                        ]}
                    />
                </TouchableWithoutFeedback>
                
                <Animated.View
                    style={[
                        styles.content,
                        {
                            opacity: fadeAnim,
                            transform: [{
                                scale: fadeAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0.9, 1]
                                })
                            }]
                        }
                    ]}
                >
                    {children}
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        // On web, ensure modal can receive pointer events when body has pointer-events: none
        ...Platform.select({ web: { pointerEvents: 'auto' as const } })
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    content: {
        zIndex: 1
    }
});
