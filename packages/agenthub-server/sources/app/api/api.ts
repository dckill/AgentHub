import fastify from "fastify";
import cors from "@fastify/cors";
import { log, logger } from "@/utils/log";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { onShutdown } from "@/utils/shutdown";
import { Fastify } from "./types";
import { authRoutes } from "./routes/authRoutes";
import { pushRoutes } from "./routes/pushRoutes";
import { sessionRoutes } from "./routes/sessionRoutes";
import { credentialRoutes } from "./routes/credentialRoutes";
import { accountRoutes } from "./routes/accountRoutes";
import { startSocket } from "./socket";
import { machinesRoutes } from "./routes/machinesRoutes";
import { devRoutes } from "./routes/devRoutes";
import { versionRoutes } from "./routes/versionRoutes";
import { artifactsRoutes } from "./routes/artifactsRoutes";
import { accessKeysRoutes } from "./routes/accessKeysRoutes";
import { enableMonitoring } from "./utils/enableMonitoring";
import { enableErrorHandlers } from "./utils/enableErrorHandlers";
import { enableAuthentication } from "./utils/enableAuthentication";
import { userRoutes } from "./routes/userRoutes";
import { kvRoutes } from "./routes/kvRoutes";
import { v3SessionRoutes } from "./routes/v3SessionRoutes";
import { v4SyncRoutes } from "./routes/v4SyncRoutes";
import { isLocalStorage, getLocalFilesDir, verifyLocalFileToken } from "@/storage/files";
import * as path from "path";
import * as fs from "fs";
import { getAllowedOriginsForLog, resolveCorsOrigin } from "./utils/security";
import { allowUnsignedLocalFiles } from "@/config/env";
import { HTTP_BODY_LIMIT_BYTES } from "./utils/resourceLimits";
import { enableResourceLimits } from "./utils/enableResourceLimits";
import { externalSharesRoutes } from "./routes/externalSharesRoutes";

export async function startApi() {

    // Configure
    log('Starting API...');

    // Start API
    const app = fastify({
        loggerInstance: logger,
        bodyLimit: HTTP_BODY_LIMIT_BYTES,
    });
    app.register(cors, {
        origin: resolveCorsOrigin,
        allowedHeaders: ['Authorization', 'Content-Type', 'X-AgentHub-Client', 'X-AgentHub-Debug-Secret'],
        methods: ['GET', 'POST', 'DELETE']
    });
    log({ module: 'cors', allowedOrigins: getAllowedOriginsForLog() }, 'CORS policy configured');
    app.get('/', function (request, reply) {
        reply.send('Welcome to AgentHub Server!');
    });

    // Create typed provider
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;

    // Enable features
    enableMonitoring(typed);
    enableResourceLimits(typed);
    enableErrorHandlers(typed);
    enableAuthentication(typed);

    // Serve local files when using local storage
    if (isLocalStorage()) {
        app.get('/files/*', function (request, reply) {
            const filePath = (request.params as any)['*'];
            if (!allowUnsignedLocalFiles() && !verifyLocalFileToken(filePath, (request.query as any).token)) {
                reply.code(403).send('Forbidden');
                return;
            }
            const baseDir = path.resolve(getLocalFilesDir());
            const fullPath = path.resolve(baseDir, filePath);
            if (!fullPath.startsWith(baseDir + path.sep)) {
                reply.code(403).send('Forbidden');
                return;
            }
            if (!fs.existsSync(fullPath)) {
                reply.code(404).send('Not found');
                return;
            }
            const stream = fs.createReadStream(fullPath);
            reply.send(stream);
        });
    }

    // Routes
    authRoutes(typed);
    pushRoutes(typed);
    sessionRoutes(typed);
    accountRoutes(typed);
    credentialRoutes(typed);
    machinesRoutes(typed);
    artifactsRoutes(typed);
    externalSharesRoutes(typed);
    accessKeysRoutes(typed);
    devRoutes(typed);
    versionRoutes(typed);
    userRoutes(typed);
    kvRoutes(typed);
    v3SessionRoutes(typed);
    v4SyncRoutes(typed);

    // Start HTTP 
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 13017;
    await app.listen({ port, host: '0.0.0.0' });
    onShutdown('api', async () => {
        await app.close();
    });

    // Start Socket
    startSocket(typed);

    // End
    log('API ready on port http://localhost:' + port);
}
