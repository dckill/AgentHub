import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { Modal } from '@/modal';
import { Typography } from '@/constants/Typography';
import { GlassButton } from '@/components/glass';
import { useUnistyles } from 'react-native-unistyles';
import { useLocalSearchParams } from 'expo-router';

// Example custom modal component
function CustomContentModal({ onClose, title, message }: { onClose: () => void; title: string; message: string }) {
    const { theme } = useUnistyles();
    return (
        <View style={styles.customModal}>
            <Text style={[styles.customModalTitle, { color: theme.colors.text }, Typography.default('semiBold')]}>{title}</Text>
            <Text style={[styles.customModalMessage, { color: theme.colors.textSecondary }, Typography.default()]}>{message}</Text>
            <View style={styles.customModalButtons}>
                <GlassButton
                    title="Close"
                    onPress={onClose}
                    variant="primary"
                />
            </View>
        </View>
    );
}

export default function ModalDemoScreen() {
    const { theme } = useUnistyles();
    const { agenthubNativeQa } = useLocalSearchParams<{ agenthubNativeQa?: string }>();
    const [lastResult, setLastResult] = React.useState<string>('No action taken yet');
    const didRunNativeQaRef = React.useRef(false);

    const showSimpleAlert = () => {
        Modal.alert('Simple Alert', 'This is a simple alert modal.');
        setLastResult('Showed simple alert');
    };

    const showAlertWithMessage = () => {
        Modal.alert(
            'Alert with Message',
            'This alert has a longer message that explains something in detail. It can span multiple lines if needed.'
        );
        setLastResult('Showed alert with message');
    };

    const showAlertWithButtons = () => {
        Modal.alert(
            'Multiple Actions',
            'Choose an action:',
            [
                { text: 'Cancel', style: 'cancel', onPress: () => setLastResult('Pressed Cancel') },
                { text: 'Option 1', onPress: () => setLastResult('Pressed Option 1') },
                { text: 'Option 2', onPress: () => setLastResult('Pressed Option 2') }
            ]
        );
    };

    const showConfirm = async () => {
        const result = await Modal.confirm(
            'Confirm Action',
            'Are you sure you want to proceed?'
        );
        setLastResult(`Confirm result: ${result ? 'Confirmed' : 'Cancelled'}`);
    };

    const showDestructiveConfirm = async () => {
        const result = await Modal.confirm(
            'Delete Item',
            'This action cannot be undone. Are you sure?',
            {
                confirmText: 'Delete',
                cancelText: 'Keep',
                destructive: true
            }
        );
        setLastResult(`Delete result: ${result ? 'Deleted' : 'Kept'}`);
    };

    const showPrompt = async () => {
        const result = await Modal.prompt(
            'Rename workspace',
            'Enter a short name for this AgentHub workspace.',
            {
                placeholder: 'Workspace name',
                defaultValue: 'AgentHub Local',
                cancelText: 'Cancel',
                confirmText: 'Save',
            }
        );
        setLastResult(`Prompt result: ${result || 'Cancelled'}`);
    };

    React.useEffect(() => {
        if (!agenthubNativeQa || didRunNativeQaRef.current) {
            return;
        }
        didRunNativeQaRef.current = true;
        const timer = setTimeout(() => {
            if (agenthubNativeQa === 'prompt') {
                void showPrompt();
                return;
            }
            if (agenthubNativeQa === 'alert') {
                showSimpleAlert();
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [agenthubNativeQa]);

    const showCustomModal = () => {
        Modal.show({
            component: CustomContentModal,
            props: {
                title: 'Custom Modal',
                message: 'This is a completely custom modal component. You can put anything in here!'
            }
        });
        setLastResult('Showed custom modal');
    };

    const showMultipleModals = async () => {
        Modal.alert('First Modal', 'This is the first modal');
        
        setTimeout(() => {
            Modal.alert('Second Modal', 'This modal appeared after the first one');
        }, 1500);
        
        setLastResult('Showed multiple modals');
    };

    return (
        <ScrollView style={[styles.container, { backgroundColor: theme.colors.canvas }]}>
            <View style={[styles.header, { backgroundColor: theme.colors.canvas, borderBottomColor: theme.colors.border }]}>
                <Text style={[styles.title, { color: theme.colors.text }, Typography.default('semiBold')]}>Modal Demo</Text>
                <Text style={[styles.subtitle, { color: theme.colors.textSecondary }, Typography.default()]}>
                    Platform: {Platform.OS} ({Platform.OS === 'web' ? 'Custom modals' : 'Native alerts'})
                </Text>
            </View>

            <ItemList>
                <ItemGroup title="Alert Modals">
                    <Item
                        title="Simple Alert"
                        subtitle="Basic alert with title only"
                        onPress={showSimpleAlert}
                    />
                    <Item
                        title="Alert with Message"
                        subtitle="Alert with title and message"
                        onPress={showAlertWithMessage}
                    />
                    <Item
                        title="Alert with Multiple Buttons"
                        subtitle="Alert with custom buttons"
                        onPress={showAlertWithButtons}
                    />
                </ItemGroup>

                <ItemGroup title="Confirmation Modals">
                    <Item
                        title="Basic Confirmation"
                        subtitle="Simple yes/no confirmation"
                        onPress={showConfirm}
                    />
                    <Item
                        title="Destructive Confirmation"
                        subtitle="Confirmation with destructive action"
                        onPress={showDestructiveConfirm}
                        destructive
                    />
                </ItemGroup>

                <ItemGroup title="Prompt Modals">
                    <Item
                        title="Text Prompt"
                        subtitle="Prompt with glass text field"
                        onPress={showPrompt}
                    />
                </ItemGroup>

                <ItemGroup title="Custom Modals">
                    <Item
                        title="Custom Modal"
                        subtitle="Fully custom modal component"
                        onPress={showCustomModal}
                    />
                    <Item
                        title="Multiple Modals"
                        subtitle="Show multiple modals in sequence"
                        onPress={showMultipleModals}
                    />
                </ItemGroup>

                <ItemGroup title="Last Action Result">
                    <View style={[styles.resultContainer, { backgroundColor: theme.colors.glass.raised }]}>
                        <Text style={[styles.resultText, { color: theme.colors.accent }, Typography.default()]}>
                            {lastResult}
                        </Text>
                    </View>
                </ItemGroup>
            </ItemList>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        padding: 20,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    title: {
        fontSize: 24,
        marginBottom: 4
    },
    subtitle: {
        fontSize: 14,
        color: '#8E8E93'
    },
    resultContainer: {
        padding: 16,
    },
    resultText: {
        fontSize: 16,
    },
    customModal: {
        width: '100%',
        alignItems: 'flex-start'
    },
    customModalTitle: {
        fontSize: 20,
        marginBottom: 12
    },
    customModalMessage: {
        fontSize: 16,
        marginBottom: 20,
    },
    customModalButtons: {
        width: '100%'
    }
});
