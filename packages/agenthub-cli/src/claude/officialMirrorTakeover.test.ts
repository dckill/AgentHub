import { describe, expect, it } from 'vitest';

import { takeOfficialMirrorScannerForCleanup } from './officialMirrorTakeover';

describe('takeOfficialMirrorScannerForCleanup', () => {
    it('takes the scanner exactly once when mobile takeover begins', () => {
        const scanner = { id: 'scanner-1' };

        const first = takeOfficialMirrorScannerForCleanup(scanner, false);

        expect(first).toEqual({
            scannerToCleanup: scanner,
            scanner: null,
            takeoverStarted: true,
        });

        const second = takeOfficialMirrorScannerForCleanup(first.scanner, first.takeoverStarted);

        expect(second).toEqual({
            scannerToCleanup: null,
            scanner: null,
            takeoverStarted: true,
        });
    });

    it('does nothing when there is no official mirror scanner', () => {
        expect(takeOfficialMirrorScannerForCleanup(null, false)).toEqual({
            scannerToCleanup: null,
            scanner: null,
            takeoverStarted: false,
        });
    });
});
