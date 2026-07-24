import * as React from 'react';
import { Stack, useRouter } from 'expo-router';
import { MachinesView } from '@/components/MachinesView';
import { TransferHeaderIcon } from '@/components/FileTransferBadge';
import { useFileTransferStore } from '@/sync/fileTransferStore';
import { buildTransferSummary } from '@/utils/fileTransfers';
import { t } from '@/text';

export default function MachinesScreen() {
    const router = useRouter();
    const transferTasks = useFileTransferStore(state => state.tasks);
    const transferSummary = React.useMemo(
        () => buildTransferSummary(transferTasks),
        [transferTasks],
    );

    return (
        <>
            <Stack.Screen
                options={{
                    headerRight: () => (
                        <TransferHeaderIcon
                            failedCount={transferSummary.global.failedCount}
                            activeCount={transferSummary.global.activeCount}
                            accessibilityLabel={t('common.fileTransfers')}
                            onPress={() => router.push('/transfers' as any)}
                        />
                    ),
                }}
            />
            <MachinesView />
        </>
    );
}
