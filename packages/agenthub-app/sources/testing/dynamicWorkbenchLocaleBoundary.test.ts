import { describe, expect, it } from 'vitest';
import { en as defaults } from '../text/_default';
import { ca } from '../text/translations/ca';
import { es } from '../text/translations/es';
import { it as itLocale } from '../text/translations/it';
import { ja } from '../text/translations/ja';
import { pl } from '../text/translations/pl';
import { pt } from '../text/translations/pt';
import { ru } from '../text/translations/ru';

const localizedDictionaries = { ca, es, it: itLocale, ja, pl, pt, ru } as const;

const transferManagerKeys = [
    'title',
    'management',
    'filterActive',
    'filterFailed',
    'filterPaused',
    'filterCompleted',
    'statusQueued',
    'statusDownloading',
    'statusPaused',
    'statusCompleted',
    'statusFailed',
    'statusCancelled',
    'setupDirectoryTitle',
    'setupDirectoryMessage',
    'pauseDownload',
    'resumeDownload',
    'openFile',
    'cancelDownload',
    'removeTransfer',
    'removeTitle',
    'removeDescription',
    'deleteLocalFile',
    'deleteLocalFileHint',
    'detailTitle',
    'remotePath',
    'localPath',
    'openDirectory',
    'unsupportedDirectoryTitle',
    'unsupportedDirectoryMessage',
    'restorePrivateTitle',
    'restorePrivateMessage',
    'nothingToClear',
    'clearCompletedTitle',
    'deleteLocalFailed',
    'chooseDefaultLocation',
    'restorePrivateDirectory',
    'clearCompleted',
    'noTasks',
    'noTasksSubtitle',
    'cancelDownloadTitle',
    'keepDownload',
] as const;

const fileBrowserKeys = [
    'title',
    'browseOnline',
    'browseOffline',
    'noTransfers',
    'noTransfersSubtitle',
    'viewAllTransfers',
    'failedTasks',
    'downloadingTasks',
    'pausedTasks',
    'viewDownloadTask',
    'pauseDownload',
    'resumeDownload',
    'cancelDownload',
    'downloadToDevice',
    'queuedTitle',
    'fileInfoTitle',
    'copyPath',
    'deleteRemoteFile',
    'deleteTitle',
    'deleteFailed',
    'deviceOffline',
    'deviceOfflineMessage',
    'loadingDevice',
    'selectFile',
    'missingReadSource',
    'missingMachineForDownload',
    'unknownError',
] as const;

const agentInputKeys = [
    'context.compactConfirmTitle',
    'context.compactConfirmMessage',
    'context.compactConfirmAction',
    'noMachinesAvailable',
    'send',
] as const;

const toolViewKeys = ['input', 'output', 'stateRunning', 'stateCompleted', 'stateError', 'stateUnknown'] as const;
const toolGroupKeys = ['editedFile'] as const;
const fullToolViewKeys = [
    'description',
    'inputParams',
    'output',
    'error',
    'completed',
    'noOutput',
    'running',
    'command',
    'status',
    'exitCode',
    'duration',
] as const;

const legitimateIdenticalTerms = new Set([
    'ca:tools.fullView:error',
    'es:tools.fullView:error',
    'it:toolView:input',
    'it:toolView:output',
    'it:tools.fullView:output',
    'pl:tools.fullView:status',
    'pt:toolView:stateUnknown',
    'pt:tools.fullView:status',
]);

function getPath(value: any, path: string): unknown {
    return path.split('.').reduce((current, segment) => current?.[segment], value);
}

function findEnglishFallbacks(
    locale: string,
    namespace: string,
    localized: any,
    english: any,
    keys: readonly string[],
): string[] {
    return keys
        .filter(key => getPath(localized, key) === getPath(english, key))
        .map(key => `${locale}:${namespace}:${key}`)
        .filter(key => !legitimateIdenticalTerms.has(key));
}

describe('dynamic transfer, file, and workbench locale boundary', () => {
    it('localizes every critical populated transfer and file-browser state', () => {
        const fallbacks: string[] = [];
        for (const [locale, dictionary] of Object.entries(localizedDictionaries)) {
            fallbacks.push(...findEnglishFallbacks(locale, 'transferManager', dictionary.transferManager, defaults.transferManager, transferManagerKeys));
            fallbacks.push(...findEnglishFallbacks(locale, 'fileBrowser', dictionary.fileBrowser, defaults.fileBrowser, fileBrowserKeys));
        }
        expect(fallbacks, 'critical transfer/file English fallbacks').toEqual([]);
    });

    it('localizes transfer and file-browser formatter output with populated values', () => {
        const transferArgs = { attempt: 2, total: 4 };
        const locationArgs = { label: '/storage/emulated/0/Download' };
        const clearArgs = { count: 3 };
        const machineArgs = { machine: 'Studio Mac' };
        const summaryArgs = { active: 2, failed: 1, paused: 3 };
        const fileInfoArgs = { name: 'report.txt', path: '/tmp/report.txt', size: '1 KB', modified: '2026-07-17' };
        const deleteArgs = { path: '/tmp/report.txt' };

        for (const [locale, dictionary] of Object.entries(localizedDictionaries)) {
            expect(dictionary.transferManager.streamRetry(transferArgs), `${locale}:streamRetry`).not.toBe(defaults.transferManager.streamRetry(transferArgs));
            expect(dictionary.transferManager.locationUpdatedMessage(locationArgs), `${locale}:locationUpdatedMessage`).not.toBe(defaults.transferManager.locationUpdatedMessage(locationArgs));
            expect(dictionary.transferManager.clearCompletedMessage(clearArgs), `${locale}:clearCompletedMessage`).not.toBe(defaults.transferManager.clearCompletedMessage(clearArgs));
            expect(dictionary.transferManager.clearCompletedCount(clearArgs), `${locale}:clearCompletedCount`).not.toBe(defaults.transferManager.clearCompletedCount(clearArgs));
            expect(dictionary.transferManager.machineTitle(machineArgs), `${locale}:machineTitle`).not.toBe(defaults.transferManager.machineTitle(machineArgs));
            expect(dictionary.fileBrowser.transferSummary(summaryArgs), `${locale}:transferSummary`).not.toBe(defaults.fileBrowser.transferSummary(summaryArgs));
            expect(dictionary.fileBrowser.fileInfoMessage(fileInfoArgs), `${locale}:fileInfoMessage`).not.toBe(defaults.fileBrowser.fileInfoMessage(fileInfoArgs));
            expect(dictionary.fileBrowser.deleteMessage(deleteArgs), `${locale}:deleteMessage`).not.toBe(defaults.fileBrowser.deleteMessage(deleteArgs));
        }
    });

    it('localizes critical session composer and tool execution states', () => {
        const formatterFallbacks: string[] = [];
        const stringFallbacks: string[] = [];
        for (const [locale, dictionary] of Object.entries(localizedDictionaries)) {
            stringFallbacks.push(...findEnglishFallbacks(locale, 'agentInput', dictionary.agentInput, defaults.agentInput, agentInputKeys));
            stringFallbacks.push(...findEnglishFallbacks(locale, 'toolView', dictionary.toolView, defaults.toolView, toolViewKeys));
            stringFallbacks.push(...findEnglishFallbacks(locale, 'toolGroup', dictionary.toolGroup, defaults.toolGroup, toolGroupKeys));
            stringFallbacks.push(...findEnglishFallbacks(locale, 'tools.fullView', dictionary.tools.fullView, defaults.tools.fullView, fullToolViewKeys));

            const formatterSamples = [
                ['context.remaining', dictionary.agentInput.context.remaining({ percent: 42 }), defaults.agentInput.context.remaining({ percent: 42 })],
                ['toolGroup.editedFiles', dictionary.toolGroup.editedFiles({ count: 3 }), defaults.toolGroup.editedFiles({ count: 3 })],
                ['toolGroup.readFiles', dictionary.toolGroup.readFiles({ count: 3 }), defaults.toolGroup.readFiles({ count: 3 })],
                ['toolGroup.ranCommands', dictionary.toolGroup.ranCommands({ count: 3 }), defaults.toolGroup.ranCommands({ count: 3 })],
                ['toolGroup.searched', dictionary.toolGroup.searched({ count: 3 }), defaults.toolGroup.searched({ count: 3 })],
                ['toolGroup.fetchedUrls', dictionary.toolGroup.fetchedUrls({ count: 3 }), defaults.toolGroup.fetchedUrls({ count: 3 })],
                ['toolGroup.ranTasks', dictionary.toolGroup.ranTasks({ count: 3 }), defaults.toolGroup.ranTasks({ count: 3 })],
                ['toolGroup.workedFor', dictionary.toolGroup.workedFor({ duration: '2m 5s' }), defaults.toolGroup.workedFor({ duration: '2m 5s' })],
                ['toolGroup.usedTools', dictionary.toolGroup.usedTools({ count: 3 }), defaults.toolGroup.usedTools({ count: 3 })],
                ['tools.taskView.moreTools', dictionary.tools.taskView.moreTools({ count: 3 }), defaults.tools.taskView.moreTools({ count: 3 })],
                ['tools.todo.progressLabel', dictionary.tools.todo.progressLabel({ completed: 2, total: 5, percent: 40 }), defaults.tools.todo.progressLabel({ completed: 2, total: 5, percent: 40 })],
            ] as const;
            for (const [key, localized, english] of formatterSamples) {
                if (localized === english) formatterFallbacks.push(`${locale}:${key}`);
            }
        }
        expect(
            [...stringFallbacks, ...formatterFallbacks],
            'critical workbench English fallbacks',
        ).toEqual([]);
    });
});
