import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const source = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('compact navigation and machine metrics boundary', () => {
    it('does not wrap navigation slots in separate mobile glass capsules', () => {
        const header = source('components/navigation/Header.tsx');

        expect(header).not.toContain('interactive style={styles.mobileControl}');
        expect(header).not.toContain('style={styles.mobileTitle}');
        expect(header).not.toContain('mobileControl:');
        expect(header).not.toContain('mobileTitle:');
    });

    it('does not add a decorative settings banner above actual settings', () => {
        const settings = source('components/SettingsView.tsx');

        expect(settings).not.toContain('function SettingsHeader');
        expect(settings).not.toContain('<SettingsHeader />');
        expect(settings).not.toContain('agenthub-settings-banner');
    });

    it('polls machine metrics only from the machine detail surface', () => {
        const machineDetail = source('app/(app)/machine/[id].tsx');

        expect(machineDetail).toContain('<MachineSystemOverview');
        expect(machineDetail).toContain('refreshIntervalMs={3_000}');
    });

    it('renders an accessible two-series network throughput chart', () => {
        const overview = source('components/MachineSystemOverview.tsx');

        expect(overview).toContain("from 'react-native-svg'");
        expect(overview).toContain("t('machine.downloadSpeed')");
        expect(overview).toContain("t('machine.uploadSpeed')");
        expect(overview).toContain('networkHistory');
        expect(overview).toContain('accessibilityRole="image"');
    });

    it('clips network fills and lines to the grid without covering y-axis labels', () => {
        const overview = source('components/MachineSystemOverview.tsx');

        expect(overview).toContain('ClipPath');
        expect(overview).toContain('<Rect x={0} y={0} width={plotWidth} height={plotHeight} />');
        expect(overview).toContain('clipPath="url(#networkPlotClip)"');
        expect(overview).toContain('x={labelWidth - 8}');
        expect(overview).toContain('textAnchor="end"');
        expect(overview).not.toContain('<Svg x={labelWidth}');
    });
});
