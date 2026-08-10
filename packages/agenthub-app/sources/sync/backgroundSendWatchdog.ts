type TimerHandle = ReturnType<typeof setTimeout>;

export type BackgroundSendWatchdogOptions = {
    timeoutMs: number;
    now: () => number;
    setTimeout: (callback: () => void, delayMs: number) => TimerHandle;
    clearTimeout: (handle: TimerHandle) => void;
    scheduleNotification: () => Promise<string | null>;
    cancelNotification: (notificationId: string) => Promise<void>;
    notifyFailure: () => Promise<void>;
    failPending: (reason: string) => void;
    hasPending: () => boolean;
    log: (message: string) => void;
};

export type BackgroundSendStartState = {
    isWeb: boolean;
    isActive: boolean;
    hasPending: boolean;
};

/** Owns the background-send timeout, notification and fail-pending lifecycle. */
export class BackgroundSendWatchdog {
    private readonly options: BackgroundSendWatchdogOptions;
    private timeout: TimerHandle | null = null;
    private notificationId: string | null = null;
    private startedAt: number | null = null;
    private lifecycle = 0;

    constructor(options: BackgroundSendWatchdogOptions) {
        this.options = options;
    }

    maybeStart(state: BackgroundSendStartState): void {
        if (state.isWeb || state.isActive || !state.hasPending || this.timeout) {
            return;
        }

        this.options.log('📨 Pending messages detected in background. Starting 30s send watchdog.');
        const lifecycle = ++this.lifecycle;
        this.startedAt = this.options.now();
        this.timeout = this.options.setTimeout(() => {
            this.timeout = null;
            void this.handleTimeout(lifecycle);
        }, this.options.timeoutMs);
        void this.scheduleNotification(lifecycle);
    }

    clear(): void {
        this.lifecycle += 1;
        if (this.timeout) {
            this.options.clearTimeout(this.timeout);
            this.timeout = null;
        }
        this.startedAt = null;
    }

    async stop(): Promise<void> {
        this.clear();
        await this.cancelNotification();
    }

    async handleAppActive(hasPending: () => boolean): Promise<void> {
        const shouldFailAfterResume = this.startedAt !== null
            && hasPending()
            && (this.options.now() - this.startedAt) >= this.options.timeoutMs;

        this.clear();
        const settleLifecycle = this.lifecycle;
        await this.cancelNotification();

        if (settleLifecycle !== this.lifecycle) {
            return;
        }

        if (shouldFailAfterResume) {
            await this.options.notifyFailure();
            if (settleLifecycle !== this.lifecycle) {
                return;
            }
            this.options.failPending('Message failed to send in background after 30s. Please retry.');
        }
    }

    private async scheduleNotification(lifecycle: number): Promise<void> {
        if (this.notificationId) {
            return;
        }
        try {
            const notificationId = await this.options.scheduleNotification();
            if (lifecycle !== this.lifecycle) {
                if (notificationId) {
                    await this.options.cancelNotification(notificationId);
                }
                return;
            }
            this.notificationId = notificationId;
        } catch (error) {
            this.options.log(`Failed to schedule background send timeout notification: ${error}`);
        }
    }

    private async cancelNotification(): Promise<void> {
        if (!this.notificationId) {
            return;
        }
        const notificationId = this.notificationId;
        this.notificationId = null;
        try {
            await this.options.cancelNotification(notificationId);
        } catch (error) {
            this.options.log(`Failed to cancel background send timeout notification: ${error}`);
        }
    }

    private async handleTimeout(expectedLifecycle: number): Promise<void> {
        if (expectedLifecycle !== this.lifecycle) {
            return;
        }
        const settleLifecycle = ++this.lifecycle;
        if (!this.options.hasPending()) {
            await this.cancelNotification();
            if (settleLifecycle !== this.lifecycle) {
                return;
            }
            this.startedAt = null;
            return;
        }

        await this.cancelNotification();
        if (settleLifecycle !== this.lifecycle) {
            return;
        }
        await this.options.notifyFailure();
        if (settleLifecycle !== this.lifecycle) {
            return;
        }
        this.options.failPending('Message failed to send in background after 30s. Please retry.');
        this.startedAt = null;
    }

}
