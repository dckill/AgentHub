export function takeOfficialMirrorScannerForCleanup<TScanner>(
    scanner: TScanner | null,
    takeoverStarted: boolean,
): {
    scannerToCleanup: TScanner | null;
    scanner: TScanner | null;
    takeoverStarted: boolean;
} {
    if (!scanner || takeoverStarted) {
        return {
            scannerToCleanup: null,
            scanner,
            takeoverStarted,
        };
    }

    return {
        scannerToCleanup: scanner,
        scanner: null,
        takeoverStarted: true,
    };
}
