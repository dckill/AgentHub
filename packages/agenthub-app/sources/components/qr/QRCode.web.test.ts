import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

const { act, create } = require('react-test-renderer') as {
    act: (callback: () => Promise<void> | void) => Promise<void>;
    create: (element: React.ReactElement) => { toJSON: () => unknown; unmount: () => void };
};

vi.mock('react-native', () => ({
    ActivityIndicator: 'ActivityIndicator',
    Text: 'Text',
    View: 'View',
}));

vi.mock('@/text', () => ({
    t: () => 'Loading',
}));

vi.mock('./qrMatrix', () => ({
    createQRMatrix: vi.fn(async () => ({
        size: 21,
        getNeighbors: () => ({
            top: false,
            right: false,
            bottom: false,
            left: false,
            current: false,
        }),
    })),
}));

import { QRCode } from './QRCode.web';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Web QR code async encoder', () => {
    it('keeps a stable hook order when the deferred matrix resolves', async () => {
        const rendererRef: {
            current?: { toJSON: () => unknown; unmount: () => void };
        } = {};

        await act(async () => {
            rendererRef.current = create(React.createElement(QRCode, { data: 'agenthub:///account?test' }));
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(rendererRef.current?.toJSON()).not.toBeNull();
        await act(async () => rendererRef.current?.unmount());
    });
});
