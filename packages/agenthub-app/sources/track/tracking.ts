// Tracking - no-op stub
// All methods are no-ops. Analytics providers are not configured in this build.

interface TrackingNoOp {
    capture(_event: string, _properties?: Record<string, unknown>): void;
    identify(_distinctId: string, _properties?: Record<string, unknown>): void;
    reset(): void;
    optIn(): void;
    optOut(): void;
    screen(_screenName: string): void;
}

const trackingNoOp: TrackingNoOp = {
    capture() {},
    identify() {},
    reset() {},
    optIn() {},
    optOut() {},
    screen() {},
};

export const tracking: TrackingNoOp = trackingNoOp;
