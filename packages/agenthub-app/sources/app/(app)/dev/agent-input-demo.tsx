import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StyleSheet } from 'react-native-unistyles';
import { AgentInput, type LocalFile } from '@/components/AgentInput';
import { getCodexModelModes, getCodexPermissionModes, type ModelMode, type PermissionMode } from '@/components/modelModeOptions';
import { t } from '@/text';

const localFiles: LocalFile[] = [{
    name: 'screenshot-before.png',
    mimeType: 'image/png',
    data: '',
    size: 148000,
}];

function DemoComposer(props: { locked?: boolean; attachments?: boolean }) {
    const [value, setValue] = React.useState(props.locked ? 'This send is intentionally locked' : 'Refine the authentication flow and explain the risk.');
    const [mode, setMode] = React.useState<PermissionMode | null>(getCodexPermissionModes(t)[1] ?? null);
    const [model, setModel] = React.useState<ModelMode | null>(getCodexModelModes(t)[2] ?? null);
    const permissionModes = React.useMemo(() => getCodexPermissionModes(t), []);
    const modelModes = React.useMemo(() => getCodexModelModes(t), []);

    return (
        <AgentInput
            placeholder="Ask AgentHub to inspect, edit, or explain..."
            value={value}
            onChangeText={setValue}
            sessionId="agenthub-composer-demo"
            onSend={() => {}}
            permissionMode={mode}
            onPermissionModeChange={setMode}
            availableModes={permissionModes}
            modelMode={model}
            onModelModeChange={setModel}
            availableModels={modelModes}
            metadata={{
                flavor: 'codex',
                path: '/workspace/agenthub',
                home: '/home/agenthub',
            } as any}
            agentType="codex"
            connectionStatus={{
                text: 'connected',
                color: '#158A4B',
                dotColor: '#158A4B',
            }}
            blockSend={props.locked}
            machineName="agenthub-devbox"
            onMachineClick={() => {}}
            currentPath="/workspace/agenthub"
            onPathClick={() => {}}
            fileReferences={props.attachments ? ['packages/agenthub-app/sources/components/AgentInput.tsx'] : []}
            onFileReferencesChange={() => {}}
            onFilePickerOpen={() => {}}
            localFiles={props.attachments ? localFiles : []}
            onLocalFileRemove={() => {}}
            onLocalFilePick={() => {}}
            onSlashCommandSelect={() => {}}
            autocompletePrefixes={['@', '/']}
            autocompleteSuggestions={async () => []}
            usageData={{
                inputTokens: 12000,
                outputTokens: 8400,
                cacheCreation: 0,
                cacheRead: 0,
                contextSize: 20400,
                contextWindow: 128000,
            }}
            alwaysShowContextSize
            onCompactPress={() => {}}
        />
    );
}

export default function AgentInputDemoScreen() {
    return (
        <>
            <Stack.Screen options={{ headerTitle: 'Agent Input Demo' }} />
            <ScrollView style={styles.container} contentContainerStyle={styles.content}>
                <Text style={styles.title}>AgentHub Composer</Text>
                <View style={[styles.section, styles.firstSection]}>
                    <Text style={styles.sectionTitle}>Ready to send</Text>
                    <DemoComposer />
                </View>
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>With attachments</Text>
                    <DemoComposer attachments />
                </View>
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Locked send</Text>
                    <DemoComposer locked />
                </View>
            </ScrollView>
        </>
    );
}

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.canvas,
    },
    content: {
        alignSelf: 'center',
        gap: 28,
        maxWidth: 980,
        paddingHorizontal: 24,
        paddingVertical: 28,
        width: '100%',
    },
    title: {
        color: theme.colors.text,
        fontSize: 26,
        fontWeight: '700',
    },
    section: {
        gap: 10,
    },
    firstSection: {
        marginTop: 180,
    },
    sectionTitle: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.6,
        textTransform: 'uppercase',
    },
}));
