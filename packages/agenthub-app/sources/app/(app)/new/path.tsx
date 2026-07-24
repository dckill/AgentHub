import * as React from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUnistyles } from 'react-native-unistyles';
import { useAllMachines, useSessions } from '@/sync/storage';
import { useNewSessionDraft } from '@/hooks/useNewSessionDraft';
import { isMachineOnline } from '@/utils/machineUtils';
import { formatPathRelativeToHome } from '@/utils/sessionUtils';
import { PathPickerContent, type PickerItem } from '@/components/PathPickerContent';
import type { Session } from '@/sync/storageTypes';
import { t } from '@/text';

/**
 * Full-screen working-directory picker. Reached from the new-session screen via
 * `router.push('/new/path')`. Path state lives in the shared `useNewSessionDraft`
 * store, so this screen just writes the selection back and the new-session screen
 * re-renders automatically — no router params or callbacks needed.
 */
export default function NewSessionPathScreen() {
    const router = useRouter();
    const safeArea = useSafeAreaInsets();
    const { theme } = useUnistyles();

    const draft = useNewSessionDraft();
    const selectedMachineId = draft.selectedMachineId;
    const selectedPath = draft.selectedPath;
    const setPath = draft.setPath;

    const allMachines = useAllMachines({ includeOffline: true });
    const sessions = useSessions();

    const selectedMachine = React.useMemo(
        () => allMachines.find(m => m.id === selectedMachineId) ?? null,
        [allMachines, selectedMachineId],
    );
    const selectedHomeDir = selectedMachine?.metadata?.homeDir;
    const isOnline = !!selectedMachine && isMachineOnline(selectedMachine);

    // Build path items from session history for the selected machine
    // (mirrors the derivation in new/index.tsx).
    const pathItems = React.useMemo<PickerItem[]>(() => {
        if (!selectedMachineId || !sessions) return [];
        const paths = new Set<string>();
        for (const s of sessions) {
            if (typeof s === 'string') continue;
            const session = s as Session;
            if (session.metadata?.machineId === selectedMachineId && session.metadata?.path) {
                paths.add(session.metadata.path);
            }
        }
        return Array.from(paths).sort().map(p => ({
            key: p,
            label: formatPathRelativeToHome(p, selectedHomeDir),
        }));
    }, [selectedMachineId, sessions, selectedHomeDir]);

    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <View role="main" style={{ flex: 1, paddingTop: safeArea.top, backgroundColor: theme.colors.surface }}>
                <PathPickerContent
                    title={t('newSession.browseFolders')}
                    items={pathItems}
                    value={selectedPath}
                    homeDir={selectedHomeDir}
                    onChangeValue={setPath}
                    onDone={() => router.back()}
                    machineId={selectedMachineId ?? undefined}
                    isOnline={isOnline}
                    recentPaths={pathItems.map((p) => p.key)}
                    showDoneButton
                />
            </View>
        </>
    );
}
