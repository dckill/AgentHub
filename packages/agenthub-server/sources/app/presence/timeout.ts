import { db } from "@/storage/db";
import { delay } from "@/utils/delay";
import { forever } from "@/utils/forever";
import { shutdownSignal } from "@/utils/shutdown";
import { buildMachineActivityEphemeral, buildSessionActivityEphemeral, eventRouter } from "@/app/events/eventRouter";
import { clearExpiredExternalShareCiphertexts } from "@/app/maintenance/externalShareCleanup";
import { backgroundLoopObserver } from "@/app/monitoring/metrics2";
import { activityCache } from "@/app/presence/sessionCache";

export function startTimeout() {
    forever('session-timeout', async () => {
        // Find timed out sessions
        const sessions = await db.session.findMany({
            where: {
                active: true,
                lastActiveAt: {
                    lte: new Date(Date.now() - 1000 * 60 * 10) // 10 minutes
                }
            }
        });
        for (const session of sessions) {
            // Prevent a heartbeat that was validated before this sweep from
            // re-caching and reviving the session after the timeout write.
            activityCache.clearSessionUpdates(session.id);
            const updated = await db.session.updateManyAndReturn({
                where: { id: session.id, active: true },
                data: { active: false, thinking: false, thinkingAt: new Date() }
            });
            if (updated.length === 0) {
                continue;
            }
            eventRouter.emitEphemeral({
                userId: session.accountId,
                payload: buildSessionActivityEphemeral(session.id, false, updated[0].lastActiveAt.getTime(), false),
                recipientFilter: { type: 'user-scoped-only' }
            });
        }

        // Find timed out machines
        const machines = await db.machine.findMany({
            where: {
                active: true,
                lastActiveAt: {
                    lte: new Date(Date.now() - 1000 * 60 * 10) // 10 minutes
                }
            }
        });
        for (const machine of machines) {
            const updated = await db.machine.updateManyAndReturn({
                where: { id: machine.id, active: true },
                data: { active: false }
            });
            if (updated.length === 0) {
                continue;
            }
            eventRouter.emitEphemeral({
                userId: machine.accountId,
                payload: buildMachineActivityEphemeral(machine.id, false, updated[0].lastActiveAt.getTime()),
                recipientFilter: { type: 'user-scoped-only' }
            });
        }

        await clearExpiredExternalShareCiphertexts();

        // Wait for 1 minute
        await delay(1000 * 60, shutdownSignal);
    }, backgroundLoopObserver);
}
