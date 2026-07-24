import { db } from "@/storage/db";
import { Fastify } from "../types";
import { httpRequestsCounter, httpRequestDurationHistogram, getMetricsLabelsFromRequest, normalizeHttpRouteMetricLabel } from "@/app/monitoring/metrics2";
import { log } from "@/utils/log";

export function enableMonitoring(app: Fastify) {
    // Add metrics hooks
    app.addHook('onRequest', async (request, reply) => {
        request.startTime = Date.now();
    });

    app.addHook('onResponse', async (request, reply) => {
        const duration = (Date.now() - (request.startTime || Date.now())) / 1000;
        const method = request.method;
        // Only registered route templates are safe metric labels. Raw unmatched
        // paths are attacker-controlled and would create unbounded series.
        const route = normalizeHttpRouteMetricLabel(request.routeOptions?.url);
        const status = reply.statusCode.toString();
        const labels = getMetricsLabelsFromRequest(request);

        // Increment request counter
        httpRequestsCounter.inc({ method, route, status, ...labels });

        // Record request duration
        httpRequestDurationHistogram.observe({ method, route, status, ...labels }, duration);
    });

    app.get('/health', async (request, reply) => {
        try {
            // Test database connectivity
            await db.$queryRaw`SELECT 1`;
            reply.send({
                status: 'ok',
                timestamp: new Date().toISOString(),
                service: 'agenthub-server'
            });
        } catch (error) {
            log({ module: 'health', level: 'error' }, `Health check failed: ${error}`);
            reply.code(503).send({
                status: 'error',
                timestamp: new Date().toISOString(),
                service: 'agenthub-server',
                error: 'Database connectivity failed'
            });
        }
    });
}
