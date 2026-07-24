import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Modal } from '@/modal';
import type { FileTransferSettings } from '@/utils/fileTransfers';
import { hasSystemDownloadDirectory } from '@/sync/fileTransferStore';
import { t } from '@/text';

export type DownloadDirectoryUpdate = {
    downloadDirectoryUri: string;
    downloadDirectoryLabel: string;
};

export function getDirectoryLabelFromSafUri(uri: string): string {
    const decoded = decodeURIComponent(uri);
    const match = decoded.match(/(?:tree|document)\/primary:([^/]+)/);
    if (!match?.[1]) {
        return t('transferManager.systemAuthorizedDirectory');
    }
    return match[1].replace(/:/g, '/');
}

export async function ensureDownloadDirectoryBeforeStart(
    settings: FileTransferSettings,
    setDownloadDirectory: (settings: DownloadDirectoryUpdate) => void,
): Promise<boolean> {
    if (hasSystemDownloadDirectory(settings)) {
        return true;
    }
    if (Platform.OS !== 'android') {
        return true;
    }

    const confirmed = await Modal.confirm(
        t('transferManager.setupDirectoryTitle'),
        t('transferManager.setupDirectoryMessage'),
        {
            cancelText: t('transferManager.setupDirectoryCancel'),
            confirmText: t('transferManager.setupDirectoryConfirm'),
        },
    );
    if (!confirmed) {
        return false;
    }

    const initialUri = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Download');
    const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
    if (!result.granted) {
        return false;
    }

    setDownloadDirectory({
        downloadDirectoryUri: result.directoryUri,
        downloadDirectoryLabel: getDirectoryLabelFromSafUri(result.directoryUri),
    });
    return true;
}
