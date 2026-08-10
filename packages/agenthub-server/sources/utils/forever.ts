import { AbortedExeption } from "./aborted";
import { backoff } from "./backoff";
import { keepAlive, shutdownSignal } from "./shutdown";
import type { BackgroundLoopObserver } from "./backgroundLoopObserver";

export async function forever(
    name: string,
    callback: () => Promise<void>,
    observer?: BackgroundLoopObserver,
) {
    let consecutiveFailures = 0;
    keepAlive(name, async () => {
        await backoff(async () => {
            while (!shutdownSignal.aborted) {
                try {
                    await callback();
                    if (consecutiveFailures > 0) {
                        consecutiveFailures = 0;
                        observer?.onSuccess(name);
                    }
                } catch (error) {
                    if (AbortedExeption.isAborted(error)) {
                        break;
                    } else {
                        consecutiveFailures += 1;
                        observer?.onFailure(name, error, consecutiveFailures);
                        throw error;
                    }
                }
            }
        }, shutdownSignal);
    });
}
