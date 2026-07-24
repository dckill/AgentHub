import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const imageRoot = resolve(__dirname, '../assets/images');

interface WebImageBudget {
    source: string;
    maxWidth: number;
    maxHeight: number;
    maxBytes: number;
}

const budgets: WebImageBudget[] = [
    { source: 'agenthub-logo-light.png', maxWidth: 256, maxHeight: 256, maxBytes: 160_000 },
    { source: 'agenthub-logo-dark.png', maxWidth: 256, maxHeight: 256, maxBytes: 160_000 },
    { source: 'agenthub-logotype-light.png', maxWidth: 256, maxHeight: 256, maxBytes: 160_000 },
    { source: 'agenthub-settings-banner-light.png', maxWidth: 1_400, maxHeight: 350, maxBytes: 360_000 },
    { source: 'agenthub-settings-banner-dark.png', maxWidth: 1_400, maxHeight: 350, maxBytes: 280_000 },
];

function getWebVariant(source: string): string {
    return source.replace(/\.png$/, '.web.png');
}

function readPngDimensions(path: string): { width: number; height: number } {
    const header = readFileSync(path).subarray(0, 24);
    expect(header.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(header.subarray(12, 16).toString('ascii')).toBe('IHDR');
    return {
        width: header.readUInt32BE(16),
        height: header.readUInt32BE(20),
    };
}

describe('Web runtime image asset budget', () => {
    it.each(budgets)('ships a bounded $source Web variant without reducing native source assets', (budget) => {
        const nativePath = resolve(imageRoot, budget.source);
        const webPath = resolve(imageRoot, getWebVariant(budget.source));

        expect(existsSync(nativePath)).toBe(true);
        expect(existsSync(webPath), `${getWebVariant(budget.source)} must exist`).toBe(true);

        const nativeDimensions = readPngDimensions(nativePath);
        const webDimensions = readPngDimensions(webPath);
        expect(webDimensions.width).toBeLessThanOrEqual(budget.maxWidth);
        expect(webDimensions.height).toBeLessThanOrEqual(budget.maxHeight);
        expect(statSync(webPath).size).toBeLessThanOrEqual(budget.maxBytes);
        expect(webDimensions.width).toBeLessThan(nativeDimensions.width);
        expect(webDimensions.height).toBeLessThan(nativeDimensions.height);
    });
});
