const MINIMUM_NETWORK_MAXIMUM = 64 * 1024;

function niceCeiling(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return MINIMUM_NETWORK_MAXIMUM;
    const magnitude = 10 ** Math.floor(Math.log10(value));
    const normalized = value / magnitude;
    const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return nice * magnitude;
}

export function buildNetworkTrendScale(peak: number, previousMaximum: number | null) {
    const target = Math.max(MINIMUM_NETWORK_MAXIMUM, niceCeiling(Math.max(0, peak) * 1.1));
    const maximum = previousMaximum === null || target >= previousMaximum
        ? target
        : target <= previousMaximum * 0.55
            ? Math.max(target, previousMaximum * 0.8)
            : previousMaximum;

    return {
        maximum,
        ticks: [maximum, maximum * 2 / 3, maximum / 3, 0],
    };
}

export function formatNetworkRateTick(bytesPerSecond: number): string {
    if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '0';
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const unitIndex = Math.min(Math.floor(Math.log(bytesPerSecond) / Math.log(1024)), units.length - 1);
    const value = bytesPerSecond / 1024 ** unitIndex;
    const digits = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 0 : 1;
    return `${value.toFixed(digits)} ${units[unitIndex]}`;
}
