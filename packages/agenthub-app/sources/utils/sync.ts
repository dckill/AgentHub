import { backoff } from "@/utils/time";

export class InvalidateSync {
    private _invalidated = false;
    private _invalidatedDouble = false;
    private _stopped = false;
    private _command: () => Promise<void>;
    private _pendings: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];

    constructor(command: () => Promise<void>) {
        this._command = command;
    }

    invalidate() {
        if (this._stopped) {
            return;
        }
        if (!this._invalidated) {
            this._invalidated = true;
            this._invalidatedDouble = false;
            this._doSync();
        } else {
            if (!this._invalidatedDouble) {
                this._invalidatedDouble = true;
            }
        }
    }

    async invalidateAndAwait() {
        if (this._stopped) {
            return;
        }
        await new Promise<void>((resolve, reject) => {
            this._pendings.push({ resolve, reject });
            this.invalidate();
        });
    }

    async awaitQueue() {
        if (this._stopped || (!this._invalidated && this._pendings.length === 0)) {
            return;
        }
        await new Promise<void>((resolve, reject) => {
            this._pendings.push({ resolve, reject });
        });
    }

    stop() {
        if (this._stopped) {
            return;
        }
        this._notifyPendings();
        this._stopped = true;
    }

    private _notifyPendings = (error?: unknown) => {
        for (let pending of this._pendings) {
            if (error) pending.reject(error);
            else pending.resolve();
        }
        this._pendings = [];
    }


    private _doSync = async () => {
        try {
            await backoff(async () => {
                if (this._stopped) return;
                await this._command();
            });
        } catch (error) {
            this._invalidated = false;
            this._invalidatedDouble = false;
            this._notifyPendings(error);
            return;
        }
        if (this._stopped) {
            this._notifyPendings();
            return;
        }
        if (this._invalidatedDouble) {
            this._invalidatedDouble = false;
            this._doSync();
        } else {
            this._invalidated = false;
            this._notifyPendings();
        }
    }
}

export class ValueSync<T> {
    private _latestValue: T | undefined;
    private _hasValue = false;
    private _processing = false;
    private _stopped = false;
    private _command: (value: T) => Promise<void>;
    private _pendings: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];

    constructor(command: (value: T) => Promise<void>) {
        this._command = command;
    }

    setValue(value: T) {
        if (this._stopped) {
            return;
        }
        this._latestValue = value;
        this._hasValue = true;
        if (!this._processing) {
            this._processing = true;
            this._doSync();
        }
    }

    async setValueAndAwait(value: T) {
        if (this._stopped) {
            return;
        }
        await new Promise<void>((resolve, reject) => {
            this._pendings.push({ resolve, reject });
            this.setValue(value);
        });
    }

    async awaitQueue() {
        if (this._stopped || (!this._processing && this._pendings.length === 0)) {
            return;
        }
        await new Promise<void>((resolve, reject) => {
            this._pendings.push({ resolve, reject });
        });
    }

    stop() {
        if (this._stopped) {
            return;
        }
        this._notifyPendings();
        this._stopped = true;
    }

    private _notifyPendings = (error?: unknown) => {
        for (let pending of this._pendings) {
            if (error) pending.reject(error);
            else pending.resolve();
        }
        this._pendings = [];
    }

    private _doSync = async () => {
        while (this._hasValue && !this._stopped) {
            const value = this._latestValue!;
            this._hasValue = false;
            
            try {
                await backoff(async () => {
                    if (this._stopped) return;
                    await this._command(value);
                });
            } catch (error) {
                this._hasValue = false;
                this._processing = false;
                this._notifyPendings(error);
                return;
            }
            
            if (this._stopped) {
                this._notifyPendings();
                return;
            }
        }
        
        this._processing = false;
        this._notifyPendings();
    }
}
