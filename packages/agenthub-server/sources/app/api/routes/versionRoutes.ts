import { z } from "zod";
import { type Fastify } from "../types";

export function versionRoutes(app: Fastify) {
    app.post('/v1/version', {
        schema: {
            body: z.object({
                platform: z.string(),
                version: z.string(),
                app_id: z.string()
            }),
            response: {
                200: z.object({
                    updateUrl: z.string().nullable()
                })
            }
        }
    }, async (_request, reply) => {
        // Self-hosted fork: no upstream app store listings.
        // Always report up-to-date (null) since updates are managed locally.
        reply.send({ updateUrl: null });
    });
}