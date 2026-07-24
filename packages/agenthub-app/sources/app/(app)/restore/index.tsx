import React, { useRef } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@/auth/AuthContext';
import { RoundButton } from '@/components/RoundButton';
import { Typography } from '@/constants/Typography';
import { encodeBase64 } from '@/encryption/base64';
import { prepareAuthKeyPair, authQRStart, type QRAuthKeyPair } from '@/auth/authQRStart';
import { authQRWait } from '@/auth/authQRWait';
import { Modal } from '@/modal';
import { t } from '@/text';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { QRCode } from '@/components/qr/QRCode';
import { getPostAuthLoginRoute, shouldRunRestoreQrAuth } from '@/auth/loginFlow';

const stylesheet = StyleSheet.create((theme) => ({
    scrollView: {
        flex: 1,
        backgroundColor: theme.colors.surface,
    },
    container: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    secondInstructionText: {
        fontSize: 16,
        color: theme.colors.textSecondary,
        marginBottom: 20,
        marginTop: 30,
        ...Typography.default(),
    },
}));

export default function Restore() {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const auth = useAuth();
    const router = useRouter();
    const [authReady, setAuthReady] = React.useState(false);
    const activeRunIdRef = useRef(0);
    const keypairRef = useRef<QRAuthKeyPair | null>(null);
    const [visibleKeypair, setVisibleKeypair] = React.useState<QRAuthKeyPair | null>(null);

    // Start QR authentication only while this screen is focused.
    useFocusEffect(React.useCallback(() => {
        const runId = activeRunIdRef.current + 1;
        activeRunIdRef.current = runId;
        const isRunActive = () => activeRunIdRef.current === runId;

        if (!shouldRunRestoreQrAuth({ isAuthenticated: auth.isAuthenticated, isFocused: true })) {
            setAuthReady(false);
            return () => {
                if (activeRunIdRef.current === runId) {
                    activeRunIdRef.current = 0;
                }
                setAuthReady(false);
            };
        }

        const startQRAuth = async () => {
            try {
                const keypair = keypairRef.current ?? await prepareAuthKeyPair();
                if (!isRunActive()) {
                    return;
                }
                keypairRef.current = keypair;
                setVisibleKeypair(keypair);

                // Send authentication request
                const success = await authQRStart(keypair);
                if (!success) {
                    if (isRunActive()) {
                        Modal.alert(t('common.error'), t('errors.authenticationFailed'));
                    }
                    return;
                }

                if (!isRunActive()) {
                    return;
                }
                setAuthReady(true);

                // Start waiting for authentication
                const credentials = await authQRWait(
                    keypair,
                    undefined,
                    () => !isRunActive()
                );

                if (credentials && isRunActive()) {
                    // Convert secret bytes to base64url string for login
                    const secretString = encodeBase64(credentials.secret, 'base64url');
                    await auth.login(credentials.token, secretString, { restoreExistingAccount: true });
                    if (isRunActive()) {
                        router.replace(getPostAuthLoginRoute());
                    }
                } else if (isRunActive()) {
                    Modal.alert(t('common.error'), t('errors.authenticationFailed'));
                }

            } catch (error) {
                if (isRunActive()) {
                    console.error('QR Auth error:', error);
                    Modal.alert(t('common.error'), t('errors.authenticationFailed'));
                }
            } finally {
                if (isRunActive()) {
                    setAuthReady(false);
                }
            }
        };

        void startQRAuth();

        // Cleanup function
        return () => {
            if (activeRunIdRef.current === runId) {
                activeRunIdRef.current = 0;
                setAuthReady(false);
            }
        };
    }, [auth.isAuthenticated, auth.login, router]));

    return (
        <ScrollView style={styles.scrollView} contentContainerStyle={{ flexGrow: 1 }}>
            <View style={styles.container}>

                <View style={{justifyContent: 'flex-end' }}>
                    <Text style={styles.secondInstructionText}>
                        1. Open AgentHub on your mobile device{'\n'}
                        2. Go to Settings → Account{'\n'}
                        3. Tap "Link New Device"{'\n'}
                        4. Scan this QR code
                    </Text>
                </View>
                {!authReady && (
                    <View style={{ width: 200, height: 200, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                        <ActivityIndicator size="small" color={theme.colors.text} />
                    </View>
                )}
                {authReady && visibleKeypair && (
                    <QRCode
                        data={'agenthub:///account?' + encodeBase64(visibleKeypair.publicKey, 'base64url')}
                        size={300}
                        foregroundColor={'black'}
                        backgroundColor={'white'}
                    />
                )}
                <View style={{ flexGrow: 4, paddingTop: 30 }}>
                    <RoundButton title="Restore with Secret Key Instead" display='inverted' onPress={() => {
                        router.push('/restore/manual');
                    }} />
                </View>
            </View>
        </ScrollView>
    );
}
