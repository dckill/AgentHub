export type NetworkCounterSample = {
    sampledAt: number;
    receivedBytes: number;
    sentBytes: number;
};

export type NetworkThroughputSample = {
    sampledAt: number;
    downloadBytesPerSecond: number;
    uploadBytesPerSecond: number;
};

export function calculateNetworkThroughput(
    previous: NetworkCounterSample,
    current: NetworkCounterSample,
): NetworkThroughputSample | null {
    const elapsedSeconds = (current.sampledAt - previous.sampledAt) / 1_000;
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return null;

    const receivedDelta = Math.max(0, current.receivedBytes - previous.receivedBytes);
    const sentDelta = Math.max(0, current.sentBytes - previous.sentBytes);
    return {
        sampledAt: current.sampledAt,
        downloadBytesPerSecond: receivedDelta / elapsedSeconds,
        uploadBytesPerSecond: sentDelta / elapsedSeconds,
    };
}
