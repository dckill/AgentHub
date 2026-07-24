import { z } from 'zod';
import { auth } from '@/app/auth/auth';
import { Fastify } from '../types';

async function authenticateDebugLogRequest(request: any, reply: any) {
    const configuredSecret = process.env.AGENTHUB_DEBUG_LOG_SECRET;
    const providedSecret = request.headers['x-agenthub-debug-secret'];
    if (configuredSecret && providedSecret === configuredSecret) {
        return;
    }

    const authHeader = request.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        const verified = await auth.verifyToken(authHeader.substring(7));
        if (verified) {
            request.userId = verified.userId;
            return;
        }
    }

    return reply.code(401).send({ error: 'Unauthorized debug log request' });
}

export function devRoutes(app: Fastify) {

    if (process.env.DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING) {
        app.post('/logs-combined-from-cli-and-mobile-for-simple-ai-debugging', {
            preHandler: authenticateDebugLogRequest,
            bodyLimit: 64 * 1024,
            schema: {
                body: z.object({
                    timestamp: z.string().max(64),
                    level: z.string().max(16),
                    message: z.string().max(16 * 1024),
                    messageRawObject: z.unknown().optional(),
                    source: z.enum(['mobile', 'cli']),
                    platform: z.string().max(64).optional()
                })
            }
        }, async (request, reply) => {
            const { timestamp, level, message, source, platform } = request.body;
            const logData = {
                source,
                platform,
                timestamp
            };

            const { fileConsolidatedLogger } = await import('@/utils/log');

            if (!fileConsolidatedLogger) {
                return reply.send({ success: true });
            }

            switch (level.toLowerCase()) {
                case 'error':
                    fileConsolidatedLogger.error(logData, message);
                    break;
                case 'warn':
                case 'warning':
                    fileConsolidatedLogger.warn(logData, message);
                    break;
                case 'debug':
                    fileConsolidatedLogger.debug(logData, message);
                    break;
                default:
                    fileConsolidatedLogger.info(logData, message);
            }

            return reply.send({ success: true });
        });
    }
}
