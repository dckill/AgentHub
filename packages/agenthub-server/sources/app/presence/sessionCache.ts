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
    private batchTimer: ReturnType<typeof setInterval> | null = null;
    
    // Cache TTL (30 seconds)
    private readonly CACHE_TTL = 30 * 1000;
    
    // Only update DB if time difference is significant (30 seconds)
    private readonly UPDATE_THRESHOLD = 30 * 1000;
    
    // Batch update interval (5 seconds)
    private readonly BATCH_INTERVAL = 5 * 1000;

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

    queueSessionUpdate(sessionId: string, timestamp: number, thinking: boolean = false): boolean {
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
        const sessionUpdates: { id: string, timestamp: number, thinking: boolean | null, thinkingAt: number | null }[] = [];
        const machineUpdates: { id: string, timestamp: number, userId: string }[] = [];
        
        // Collect session updates
        for (const [sessionId, entry] of this.sessionCache.entries()) {
            if (entry.pendingUpdate) {
                sessionUpdates.push({
                    id: sessionId,
                    timestamp: entry.pendingUpdate,
                    thinking: entry.pendingThinking,
                    thinkingAt: entry.pendingThinkingAt
                });
                entry.lastUpdateSent = entry.pendingUpdate;
                if (entry.pendingThinking !== null) {
                    entry.thinking = entry.pendingThinking;
                    entry.thinkingAt = entry.pendingThinkingAt;
                }
                entry.pendingUpdate = null;
                entry.pendingThinking = null;
                entry.pendingThinkingAt = null;
            }
        }
        
        // Collect machine updates
        for (const [machineId, entry] of this.machineCache.entries()) {
            if (entry.pendingUpdate) {
                machineUpdates.push({ 
                    id: machineId, 
                    timestamp: entry.pendingUpdate, 
                    userId: entry.userId 
                });
                entry.lastUpdateSent = entry.pendingUpdate;
                entry.pendingUpdate = null;
            }
        }
        
        // Batch update sessions
        if (sessionUpdates.length > 0) {
            try {
                await Promise.all(sessionUpdates.map(update =>
                    db.session.updateMany({
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
                    })
                ));
                
                log({ module: 'session-cache' }, `Flushed ${sessionUpdates.length} session updates`);
            } catch (error) {
                log({ module: 'session-cache', level: 'error' }, `Error updating sessions: ${error}`);
            }
        }
        
        // Batch update machines
        if (machineUpdates.length > 0) {
            try {
                await Promise.all(machineUpdates.map(update =>
                    db.machine.update({
                        where: {
                            accountId_id: {
                                accountId: update.userId,
                                id: update.id
                            }
                        },
                        data: { lastActiveAt: new Date(update.timestamp) }
                    })
                ));
                
                log({ module: 'session-cache' }, `Flushed ${machineUpdates.length} machine updates`);
            } catch (error) {
                log({ module: 'session-cache', level: 'error' }, `Error updating machines: ${error}`);
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
    }

    shutdown(): void {
        if (this.batchTimer) {
            clearInterval(this.batchTimer);
            this.batchTimer = null;
        }
        
        // Flush any remaining updates
        this.flushPendingUpdates().catch(error => {
            log({ module: 'session-cache', level: 'error' }, `Error flushing final updates: ${error}`);
        });
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
