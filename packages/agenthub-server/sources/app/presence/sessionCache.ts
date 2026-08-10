import { db } from "@/storage/db";
import { log } from "@/utils/log";
import { sessionCacheCounter, databaseUpdatesSkippedCounter } from "@/app/monitoring/metrics2";

interface SessionCacheEntry {
    validUntil: number;
    lastUpdateSent: number;
    pendingUpdate: number | null;
    userId: string;
    thinking: boolean;
    thinkingAt: number | null;
    pendingThinking: boolean | null;
    pendingThinkingAt: number | null;
}

interface MachineCacheEntry {
    validUntil: number;
    lastUpdateSent: number;
    pendingUpdate: number | null;
    userId: string;
}

export class ActivityCache {
    private sessionCache = new Map<string, SessionCacheEntry>();
    private machineCache = new Map<string, MachineCacheEntry>();
    /** Sessions whose stop/archive/delete window must reject in-flight heartbeats. */
    private stoppedSessions = new Map<string, number>();
    private batchTimer: ReturnType<typeof setInterval> | null = null;
    
    // Cache TTL (30 seconds)
    private readonly CACHE_TTL = 30 * 1000;
    
    // Only update DB if time difference is significant (30 seconds)
    private readonly UPDATE_THRESHOLD = 30 * 1000;
    
    // Batch update interval (5 seconds)
    private readonly BATCH_INTERVAL = 5 * 1000;

    // Longer than CACHE_TTL + BATCH_INTERVAL so queued/in-flight heartbeats
    // cannot revalidate a session after an explicit stop.
    private readonly STOPPED_TTL = 60 * 1000;

    /** Prevent a timer tick and graceful shutdown from flushing the same batch concurrently. */
    private flushPromise: Promise<void> | null = null;

    constructor(options: { autoStart?: boolean } = {}) {
        if (options.autoStart ?? true) {
            this.startBatchTimer();
        }
    }

    private startBatchTimer(): void {
        if (this.batchTimer) {
            clearInterval(this.batchTimer);
        }
        
        this.batchTimer = setInterval(() => {
            this.flushPendingUpdates().catch(error => {
                log({ module: 'session-cache', level: 'error' }, `Error flushing updates: ${error}`);
            });
        }, this.BATCH_INTERVAL);
    }

    async isSessionValid(sessionId: string, userId: string): Promise<boolean> {
        const now = Date.now();
        if (this.isSessionStopped(sessionId, now)) {
            sessionCacheCounter.inc({ operation: 'session_validation', result: 'stopped' });
            return false;
        }
        const cached = this.sessionCache.get(sessionId);
        
        // Check cache first
        if (cached && cached.validUntil > now && cached.userId === userId) {
            sessionCacheCounter.inc({ operation: 'session_validation', result: 'hit' });
            return true;
        }
        
        sessionCacheCounter.inc({ operation: 'session_validation', result: 'miss' });
        
        // Cache miss - check database
        try {
            const session = await db.session.findUnique({
                where: { id: sessionId, accountId: userId, active: true }
            });

            if (session?.active === true) {
                // The stop/archive/delete may have started while the DB read was
                // in flight. Do not repopulate the cache from that stale result.
                if (this.isSessionStopped(sessionId, Date.now())) {
                    sessionCacheCounter.inc({ operation: 'session_validation', result: 'stopped' });
                    return false;
                }
                // Cache the result
                this.sessionCache.set(sessionId, {
                    validUntil: now + this.CACHE_TTL,
                    lastUpdateSent: session.lastActiveAt.getTime(),
                    pendingUpdate: null,
                    userId,
                    thinking: session.thinking === true,
                    thinkingAt: session.thinkingAt?.getTime() ?? null,
                    pendingThinking: null,
                    pendingThinkingAt: null
                });
                return true;
            }
            
            return false;
        } catch (error) {
            log({ module: 'session-cache', level: 'error' }, `Error validating session ${sessionId}: ${error}`);
            return false;
        }
    }

    async isMachineValid(machineId: string, userId: string): Promise<boolean> {
        const now = Date.now();
        const cached = this.machineCache.get(machineId);
        
        // Check cache first
        if (cached && cached.validUntil > now && cached.userId === userId) {
            sessionCacheCounter.inc({ operation: 'machine_validation', result: 'hit' });
            return true;
        }
        
        sessionCacheCounter.inc({ operation: 'machine_validation', result: 'miss' });
        
        // Cache miss - check database
        try {
            const machine = await db.machine.findUnique({
                where: {
                    accountId_id: {
                        accountId: userId,
                        id: machineId
                    }
                }
            });
            
            if (machine) {
                // Cache the result
                this.machineCache.set(machineId, {
                    validUntil: now + this.CACHE_TTL,
                    lastUpdateSent: machine.lastActiveAt?.getTime() || 0,
                    pendingUpdate: null,
                    userId
                });
                return true;
            }
            
            return false;
        } catch (error) {
            log({ module: 'session-cache', level: 'error' }, `Error validating machine ${machineId}: ${error}`);
            return false;
        }
    }

    /**
     * Drop a session validity entry after an explicit archive/session-end.
     * Otherwise a cached heartbeat can queue an unconditional `active=true`
     * write for up to CACHE_TTL after the database row was deactivated.
     */
    invalidateSession(sessionId: string, userId: string): boolean {
        const cached = this.sessionCache.get(sessionId);
        if (!cached || cached.userId !== userId) {
            return false;
        }
        this.sessionCache.delete(sessionId);
        return true;
    }

    /**
     * Stop accepting session heartbeats before an archive/delete write begins.
     * This closes the race where a heartbeat validation started before the write
     * finishes and would otherwise re-cache the session or queue active=true.
     */
    clearSessionUpdates(sessionId: string): void {
        this.sessionCache.delete(sessionId);
        this.stoppedSessions.set(sessionId, Date.now() + this.STOPPED_TTL);
    }

    /** Allow heartbeats again when an existing session is legitimately restarted. */
    resumeSessionUpdates(sessionId: string): void {
        this.stoppedSessions.delete(sessionId);
    }

    private isSessionStopped(sessionId: string, now: number): boolean {
        const stoppedUntil = this.stoppedSessions.get(sessionId);
        if (stoppedUntil === undefined) return false;
        if (stoppedUntil <= now) {
            this.stoppedSessions.delete(sessionId);
            return false;
        }
        return true;
    }

    queueSessionUpdate(sessionId: string, timestamp: number, thinking: boolean = false): boolean {
        if (this.isSessionStopped(sessionId, Date.now())) {
            databaseUpdatesSkippedCounter.inc({ type: 'session' });
            return false;
        }
        const cached = this.sessionCache.get(sessionId);
        if (!cached) {
            return false; // Should validate first
        }
        
        const nextThinking = thinking === true;
        const effectiveThinking = cached.pendingThinking ?? cached.thinking;
        const effectiveThinkingAt = cached.pendingThinkingAt ?? cached.thinkingAt;
        const thinkingChanged = effectiveThinking !== nextThinking;

        // Queue if time difference is significant or if thinking changed.
        const timeDiff = Math.abs(timestamp - cached.lastUpdateSent);
        if (timeDiff > this.UPDATE_THRESHOLD || thinkingChanged) {
            cached.pendingUpdate = timestamp;
            cached.pendingThinking = nextThinking;
            cached.pendingThinkingAt = thinkingChanged
                ? timestamp
                : effectiveThinkingAt ?? (nextThinking ? timestamp : null);
            return true;
        }
        
        databaseUpdatesSkippedCounter.inc({ type: 'session' });
        return false; // No update needed
    }

    queueMachineUpdate(machineId: string, timestamp: number): boolean {
        const cached = this.machineCache.get(machineId);
        if (!cached) {
            return false; // Should validate first
        }
        
        // Only queue if time difference is significant
        const timeDiff = Math.abs(timestamp - cached.lastUpdateSent);
        if (timeDiff > this.UPDATE_THRESHOLD) {
            cached.pendingUpdate = timestamp;
            return true;
        }
        
        databaseUpdatesSkippedCounter.inc({ type: 'machine' });
        return false; // No update needed
    }

    async flushPendingUpdates(): Promise<void> {
        if (this.flushPromise) {
            return this.flushPromise;
        }

        this.flushPromise = this.flushPendingUpdatesInternal();
        try {
            await this.flushPromise;
        } finally {
            this.flushPromise = null;
        }
    }

    private async flushPendingUpdatesInternal(): Promise<void> {
        const sessionUpdates: {
            id: string;
            timestamp: number;
            thinking: boolean | null;
            thinkingAt: number | null;
            entry: SessionCacheEntry;
        }[] = [];
        const machineUpdates: { id: string; timestamp: number; userId: string; entry: MachineCacheEntry }[] = [];
        
        // Collect session updates
        for (const [sessionId, entry] of this.sessionCache.entries()) {
            if (entry.pendingUpdate !== null) {
                sessionUpdates.push({
                    id: sessionId,
                    timestamp: entry.pendingUpdate,
                    thinking: entry.pendingThinking,
                    thinkingAt: entry.pendingThinkingAt,
                    entry,
                });
            }
        }
        
        // Collect machine updates
        for (const [machineId, entry] of this.machineCache.entries()) {
            if (entry.pendingUpdate !== null) {
                machineUpdates.push({ 
                    id: machineId, 
                    timestamp: entry.pendingUpdate,
                    userId: entry.userId,
                    entry,
                });
            }
        }
        
        // Batch update sessions
        if (sessionUpdates.length > 0) {
            const flushed = await Promise.all(sessionUpdates.map(async update => {
                try {
                    await db.session.updateMany({
                        // A heartbeat must never resurrect a row archived after
                        // it was queued but before this batch flushed.
                        where: { id: update.id, active: true },
                        data: {
                            lastActiveAt: new Date(update.timestamp),
                            active: true,
                            ...(update.thinking !== null ? {
                                thinking: update.thinking,
                                thinkingAt: update.thinkingAt !== null ? new Date(update.thinkingAt) : null
                            } : {})
                        }
                    });

                    // Only acknowledge the entry after the database write succeeds.
                    // If a newer heartbeat arrived while awaiting the database, leave
                    // that newer pending value untouched for the next batch.
                    const current = this.sessionCache.get(update.id);
                    if (current === update.entry &&
                        current.pendingUpdate === update.timestamp &&
                        current.pendingThinking === update.thinking &&
                        current.pendingThinkingAt === update.thinkingAt) {
                        current.lastUpdateSent = update.timestamp;
                        if (update.thinking !== null) {
                            current.thinking = update.thinking;
                            current.thinkingAt = update.thinkingAt;
                        }
                        current.pendingUpdate = null;
                        current.pendingThinking = null;
                        current.pendingThinkingAt = null;
                    }
                    return true;
                } catch (error) {
                    log({ module: 'session-cache', level: 'error' }, `Error updating session ${update.id}: ${error}`);
                    return false;
                }
            }));

            const successCount = flushed.filter(Boolean).length;
            if (successCount > 0) {
                log({ module: 'session-cache' }, `Flushed ${successCount} session updates`);
            }
        }
        
        // Batch update machines
        if (machineUpdates.length > 0) {
            const flushed = await Promise.all(machineUpdates.map(async update => {
                try {
                    await db.machine.update({
                        where: {
                            accountId_id: {
                                accountId: update.userId,
                                id: update.id
                            }
                        },
                        data: { lastActiveAt: new Date(update.timestamp) }
                    });

                    const current = this.machineCache.get(update.id);
                    if (current === update.entry && current.pendingUpdate === update.timestamp) {
                        current.lastUpdateSent = update.timestamp;
                        current.pendingUpdate = null;
                    }
                    return true;
                } catch (error) {
                    log({ module: 'session-cache', level: 'error' }, `Error updating machine ${update.id}: ${error}`);
                    return false;
                }
            }));

            const successCount = flushed.filter(Boolean).length;
            if (successCount > 0) {
                log({ module: 'session-cache' }, `Flushed ${successCount} machine updates`);
            }
        }
    }

    // Cleanup old cache entries periodically
    cleanup(): void {
        const now = Date.now();
        
        for (const [sessionId, entry] of this.sessionCache.entries()) {
            if (entry.validUntil < now) {
                this.sessionCache.delete(sessionId);
            }
        }
        
        for (const [machineId, entry] of this.machineCache.entries()) {
            if (entry.validUntil < now) {
                this.machineCache.delete(machineId);
            }
        }

        for (const [sessionId, stoppedUntil] of this.stoppedSessions.entries()) {
            if (stoppedUntil <= now) this.stoppedSessions.delete(sessionId);
        }
    }

    async shutdown(): Promise<void> {
        if (this.batchTimer) {
            clearInterval(this.batchTimer);
            this.batchTimer = null;
        }
        
        // Flush any remaining updates
        try {
            await this.flushPendingUpdates();
        } catch (error) {
            log({ module: 'session-cache', level: 'error' }, `Error flushing final updates: ${error}`);
        }
        this.stoppedSessions.clear();
    }
}

// Global instance
export const activityCache = new ActivityCache({ autoStart: process.env.NODE_ENV !== 'test' });

// Cleanup every 5 minutes
if (process.env.NODE_ENV !== 'test') {
    setInterval(() => {
        activityCache.cleanup();
    }, 5 * 60 * 1000);
}
