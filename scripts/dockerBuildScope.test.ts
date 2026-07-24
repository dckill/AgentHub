import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAllDocuments } from 'yaml';

const repoRoot = resolve(__dirname, '..');
const dockerfiles = ['Dockerfile', 'Dockerfile.server', 'Dockerfile.webapp'];

describe('Docker workspace build scope', () => {
    it('uses the published Wire workspace name in every image build', () => {
        for (const filename of dockerfiles) {
            const contents = readFileSync(resolve(repoRoot, filename), 'utf8');

            expect(contents, filename).toContain('pnpm --filter @artsum/agenthub-wire build');
            expect(contents, filename).not.toContain('@dckill/agenthub-wire');
        }
    });

    it('keeps generated and local dependency trees out of the Docker context', () => {
        const dockerignore = readFileSync(resolve(repoRoot, '.dockerignore'), 'utf8');

        expect(dockerignore).toMatch(/^node_modules$/m);
        expect(dockerignore).toMatch(/^\*\*\/node_modules$/m);
        expect(dockerignore).toMatch(/^\*\*\/src-tauri\/target$/m);
        expect(dockerignore).toMatch(/^\.git$/m);
        expect(dockerignore).toMatch(/^\.worktrees$/m);
        expect(dockerignore).toMatch(/^\.gitnexus$/m);
        expect(dockerignore).toMatch(/^artifacts$/m);
        expect(dockerignore).toMatch(/^environments$/m);
        expect(dockerignore).toMatch(/^\*\*\/\.env\*$/m);
        expect(dockerignore).toMatch(/^packages\/agenthub-server\/data$/m);
        expect(dockerignore).toMatch(/^packages\/agenthub-server\/\.logs$/m);
        expect(dockerignore).toMatch(/^\*\*\/build$/m);
        expect(dockerignore).toMatch(/^\*\*\/coverage$/m);
        expect(dockerignore).toMatch(/^\*\*\/reports$/m);
        expect(dockerignore).toMatch(/^\*\*\/\*\.cpuprofile$/m);
    });

    it('keeps the Web dependency install independent from unrelated native scripts', () => {
        const webDockerfile = readFileSync(resolve(repoRoot, 'Dockerfile.webapp'), 'utf8');
        const rootPostinstall = readFileSync(resolve(repoRoot, 'scripts/postinstall.cjs'), 'utf8');
        const unistylesPatch = readFileSync(resolve(repoRoot, 'patches/fix-unistyles-webkit-style-tag.cjs'), 'utf8');

        expect(webDockerfile).toContain('--ignore-scripts');
        expect(webDockerfile).toContain('RUN SKIP_AGENTHUB_WIRE_BUILD=1 node ./scripts/postinstall.cjs');
        expect(webDockerfile).toContain('RUN pnpm --filter agenthub-app run postinstall');
        expect(webDockerfile.indexOf('pnpm install')).toBeLessThan(webDockerfile.indexOf('COPY scripts ./scripts'));
        expect(webDockerfile.indexOf('pnpm install')).toBeLessThan(webDockerfile.indexOf('COPY patches ./patches'));
        expect(webDockerfile.indexOf('pnpm install')).toBeLessThan(
            webDockerfile.indexOf('COPY packages/agenthub-app/patches packages/agenthub-app/patches'),
        );
        expect(webDockerfile).toContain('AGENTHUB_APP_PACKAGE_ROOT=/repo/packages/agenthub-app');
        expect(rootPostinstall).toContain("createRequire(path.join(appRoot, 'package.json'))");
        expect(rootPostinstall).toContain('AGENTHUB_UNISTYLES_PACKAGE_ROOT');
        expect(rootPostinstall).toContain('AGENTHUB_DRAWER_LAYOUT_PACKAGE_ROOT');
        expect(rootPostinstall).toContain('AGENTHUB_NOBLE_HASHES_PACKAGE_ROOT');
        expect(unistylesPatch).toContain('process.env.AGENTHUB_UNISTYLES_PACKAGE_ROOT');
    });

    it('keeps unrelated repository scripts out of the Server dependency cache key', () => {
        const serverDockerfile = readFileSync(resolve(repoRoot, 'Dockerfile.server'), 'utf8');

        expect(serverDockerfile).toContain('COPY scripts/postinstall.cjs ./scripts/postinstall.cjs');
        expect(serverDockerfile).not.toContain('COPY scripts ./scripts');
        expect(serverDockerfile).toContain('pnpm --filter agenthub-server...');
        expect(serverDockerfile).toContain('install --frozen-lockfile');
        expect(serverDockerfile).toContain('--config.node-linker=isolated');
        expect(serverDockerfile).toContain('--config.shamefully-hoist=false');
        expect(serverDockerfile).toContain('SKIP_AGENTHUB_APP_PATCHES=1');
        expect(serverDockerfile).not.toContain('COPY packages/agenthub-app/package.json');
        expect(serverDockerfile).not.toContain('COPY packages/agenthub-cli/package.json');
        expect(serverDockerfile).not.toContain('COPY packages/agenthub-cli/tools');
        expect(serverDockerfile).toContain(
            'FROM node:20-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS runtime-base',
        );
        const serverBase = serverDockerfile.split(' AS runtime-base')[1]?.split('FROM runtime-base AS migration')[0] ?? '';
        const serverRuntime = serverDockerfile.split(' AS runner')[1] ?? '';
        expect(serverBase).toContain('apt-get install -y --no-install-recommends openssl');
        expect(serverBase).not.toMatch(/apt-get install[^\n]*(?:python|ffmpeg)/);
        expect(serverBase).not.toContain('corepack prepare');
        expect(serverRuntime).toContain('WORKDIR /repo/packages/agenthub-server');
        expect(serverDockerfile).toContain('RUN pnpm --filter agenthub-server build:runtime');
        expect(serverDockerfile).toContain('COPY --from=runtime-deps --chown=agenthub:agenthub /repo/packages/agenthub-server/dist/runtime /repo/packages/agenthub-server/dist/runtime');
        expect(serverDockerfile).toContain('CMD ["node", "/repo/packages/agenthub-server/dist/runtime/main.mjs"]');
        expect(serverDockerfile).not.toContain('/node_modules/.bin/tsx');
        expect(serverDockerfile).not.toContain('/sources/main.ts');
        expect(serverDockerfile).not.toContain('CMD ["pnpm"');

        const rootPostinstall = readFileSync(resolve(repoRoot, 'scripts/postinstall.cjs'), 'utf8');
        expect(rootPostinstall).toContain("process.env.SKIP_AGENTHUB_APP_PATCHES !== '1'");
    });

    it('rebuilds the Server runtime dependency tree from the frozen lock in production-only offline mode', () => {
        const serverDockerfile = readFileSync(resolve(repoRoot, 'Dockerfile.server'), 'utf8');

        expect(serverDockerfile).toContain('FROM builder AS production-deps');
        const productionDeps = serverDockerfile.split('FROM builder AS production-deps')[1]?.split(' AS runner')[0] ?? '';
        expect(productionDeps).toContain('RUN rm -rf /repo/node_modules');
        expect(productionDeps).toContain('/repo/packages/agenthub-server/node_modules');
        expect(productionDeps).toContain('/repo/packages/agenthub-wire/node_modules');
        expect(productionDeps).toContain('CI=1 SKIP_AGENTHUB_WIRE_BUILD=1 SKIP_AGENTHUB_APP_PATCHES=1');
        expect(productionDeps).toContain('pnpm --filter agenthub-server...');
        expect(productionDeps).toContain('install --prod --offline --frozen-lockfile');
        expect(productionDeps).not.toContain('--ignore-scripts');
        expect(productionDeps).toContain('--config.node-linker=isolated');
        expect(productionDeps).toContain('--config.shamefully-hoist=false');

        const migration = serverDockerfile.split('FROM runtime-base AS migration')[1]?.split('FROM runtime-base AS runner')[0] ?? '';
        expect(migration).toContain('COPY --from=production-deps --chown=agenthub:agenthub /repo/node_modules /repo/node_modules');
        expect(migration).toContain('COPY --from=production-deps --chown=agenthub:agenthub /repo/packages/agenthub-server/node_modules /repo/packages/agenthub-server/node_modules');
        expect(migration).toContain('COPY --from=production-deps --chown=agenthub:agenthub /repo/packages/agenthub-server/prisma /repo/packages/agenthub-server/prisma');
        expect(migration).not.toContain('COPY --from=builder --chown=agenthub:agenthub /repo/node_modules');
    });

    it('separates the minimal compiled Server runtime from the Prisma migration image', () => {
        const serverDockerfile = readFileSync(resolve(repoRoot, 'Dockerfile.server'), 'utf8');
        const runtimeManifest = JSON.parse(readFileSync(
            resolve(repoRoot, 'packages/agenthub-server-runtime/package.json'),
            'utf8',
        ));
        const runtimeDependencies = Object.keys(runtimeManifest.dependencies ?? {}).sort();

        expect(runtimeManifest).toMatchObject({
            name: 'agenthub-server-runtime',
            private: true,
        });
        expect(runtimeDependencies).toEqual([
            '@artsum/agenthub-wire',
            '@electric-sql/pglite',
            '@fastify/cors',
            '@prisma/client',
            '@socket.io/redis-streams-adapter',
            'fastify',
            'fastify-type-provider-zod',
            'ioredis',
            'minio',
            'pglite-prisma-adapter',
            'pino',
            'pino-pretty',
            'privacy-kit',
            'prom-client',
            'reflect-metadata',
            'socket.io',
            'tweetnacl',
            'zod',
        ].sort());
        for (const forbidden of ['prisma', 'prisma-json-types-generator', 'tsx', 'typescript', 'vitest']) {
            expect(runtimeManifest.dependencies?.[forbidden], forbidden).toBeUndefined();
        }

        expect(serverDockerfile).toContain('FROM builder AS runtime-deps');
        expect(serverDockerfile).toContain('pnpm --dir packages/agenthub-server-runtime --ignore-workspace');
        expect(serverDockerfile).toContain('fetch --prod --frozen-lockfile');
        expect(serverDockerfile).toContain('--config.auto-install-peers=false');
        expect(serverDockerfile).toContain('node ./packages/agenthub-server/scripts/patchRuntimeDependencies.mjs');
        expect(serverDockerfile).toContain('install --prod --offline --frozen-lockfile');
        expect(serverDockerfile).toContain('FROM runtime-base AS migration');
        expect(serverDockerfile).toContain('CMD ["/repo/packages/agenthub-server/node_modules/.bin/prisma", "migrate", "deploy", "--schema=/repo/packages/agenthub-server/prisma/schema.prisma"]');

        const runtime = serverDockerfile.split(' AS runner')[1] ?? '';
        expect(runtime).toContain('/repo/packages/agenthub-server-runtime/node_modules /repo/packages/agenthub-server/node_modules');
        expect(runtime).toContain('/repo/packages/agenthub-server/prisma/migrations /repo/packages/agenthub-server/prisma/migrations');
        expect(runtime).not.toContain('COPY --from=production-deps');
        expect(runtime).not.toContain('/repo/node_modules /repo/node_modules');
        expect(runtime).not.toContain('/repo/packages/agenthub-server/prisma/schema.prisma');
    });

    it('keeps Server test and type-only packages outside the production dependency graph', () => {
        const manifest = JSON.parse(readFileSync(resolve(repoRoot, 'packages/agenthub-server/package.json'), 'utf8'));
        const developmentOnly = ['@types/jsonwebtoken', '@types/semver', 'esbuild', 'tsx', 'vite-tsconfig-paths', 'vitest'];

        for (const packageName of developmentOnly) {
            expect(manifest.dependencies?.[packageName], packageName).toBeUndefined();
            expect(manifest.devDependencies?.[packageName], packageName).toBeTruthy();
        }
        expect(manifest.devDependencies.esbuild).toMatch(/^0\.27\./);
        expect(manifest.scripts?.['build:runtime']).toBe('node ./scripts/buildRuntime.mjs');
    });

    it('does not expose unused analytics or subscription build arguments', () => {
        const webDockerfile = readFileSync(resolve(repoRoot, 'Dockerfile.webapp'), 'utf8');

        expect(webDockerfile).not.toMatch(/POSTHOG|REVENUE_CAT/);
    });

    it('runs Node server runtimes as an unprivileged dedicated user', () => {
        for (const filename of ['Dockerfile', 'Dockerfile.server']) {
            const contents = readFileSync(resolve(repoRoot, filename), 'utf8');

            expect(contents, filename).toMatch(/(?:groupadd|addgroup)[\s\S]+agenthub/);
            expect(contents, filename).toMatch(/(?:useradd|adduser)[\s\S]+agenthub/);
            expect(contents, filename).toContain('USER agenthub');
            expect(contents, filename).toContain('--chown=agenthub:agenthub');
        }
    });

    it('runs the Web Nginx runtime without a privileged low port', () => {
        const webDockerfile = readFileSync(resolve(repoRoot, 'Dockerfile.webapp'), 'utf8');

        expect(webDockerfile).toContain('COPY --from=builder --chown=nginx:nginx');
        expect(webDockerfile).toContain('chown -R nginx:nginx /run');
        expect(webDockerfile).toContain('USER nginx');
        expect(webDockerfile).toContain('listen 8080;');
        expect(webDockerfile).toContain('EXPOSE 8080');
        expect(webDockerfile).toContain("sed -i '/^user /d' /etc/nginx/nginx.conf");
        expect(webDockerfile).toContain('ENTRYPOINT []');
        expect(webDockerfile).toContain('CMD ["nginx", "-g", "daemon off;"]');
    });

    it('sets a non-root Kubernetes security boundary for the server Pod', () => {
        const documents = parseAllDocuments(
            readFileSync(resolve(repoRoot, 'packages/agenthub-server/deploy/base/agenthub.yaml'), 'utf8'),
        ).map((document) => document.toJSON() as { kind?: string; spec?: any });
        const deployment = documents.find((document) => document.kind === 'Deployment');
        const podSpec = deployment?.spec?.template?.spec;
        const containerSecurity = podSpec?.containers?.[0]?.securityContext;

        expect(podSpec?.securityContext).toMatchObject({
            runAsNonRoot: true,
            runAsUser: 10001,
            runAsGroup: 10001,
            fsGroup: 10001,
            seccompProfile: { type: 'RuntimeDefault' },
        });
        expect(containerSecurity).toMatchObject({
            allowPrivilegeEscalation: false,
            capabilities: { drop: ['ALL'] },
        });
    });

    it('pins every production Docker base image by digest', () => {
        for (const filename of ['Dockerfile', 'Dockerfile.server', 'Dockerfile.webapp']) {
            const contents = readFileSync(resolve(repoRoot, filename), 'utf8');
            const fromLines = contents
                .split('\n')
                .filter((line) => line.startsWith('FROM '))
                .filter((line) => !line.match(/^FROM\s+[a-z][a-z0-9_-]*\s+AS\s+/i));

            expect(fromLines.length, filename).toBeGreaterThan(0);
            for (const line of fromLines) {
                expect(line, `${filename}: ${line}`).toMatch(/@sha256:[0-9a-f]{64}/);
            }
        }
    });

    it('fails closed while preparing the local multi-replica stress cluster', () => {
        const localDeploy = readFileSync(
            resolve(repoRoot, 'packages/agenthub-server/deploy/integration-tests/local.sh'),
            'utf8',
        );
        const localKustomization = readFileSync(
            resolve(repoRoot, 'packages/agenthub-server/deploy/overlays/local/kustomization.yaml'),
            'utf8',
        );
        const stressRunner = readFileSync(
            resolve(repoRoot, 'packages/agenthub-server/deploy/integration-tests/run-all.sh'),
            'utf8',
        );
        const productionStress = readFileSync(
            resolve(repoRoot, 'packages/agenthub-server/deploy/integration-tests/stress-prod-realistic.mjs'),
            'utf8',
        );

        expect(localKustomization).not.toMatch(/^\s*- secrets\.yaml$/m);
        expect(localDeploy).toContain('DATA_ENCRYPTION_KEY="$(openssl rand -hex 32)"');
        expect(localDeploy).toContain('TOKEN_KEY="$(openssl rand -hex 32)"');
        expect(localDeploy).toContain('kubectl apply -f - <<EOF');
        expect(localDeploy).toContain('S3_HOST: agenthub-minio');
        expect(localDeploy).not.toMatch(/^\s*S3_HOST: minio\s*$/m);
        expect(localDeploy).toContain('docker build -t agenthub-server:local');
        expect(localDeploy).toContain('docker build --target migration -t agenthub-server-migration:local');
        expect(localDeploy).toContain('minikube image load agenthub-server:local');
        expect(localDeploy).toContain('minikube image load agenthub-server-migration:local');
        expect(localDeploy).toContain("minikube image ls | grep -q '^docker.io/library/agenthub-server:local$'");
        expect(localDeploy).toContain("minikube image ls | grep -q '^docker.io/library/agenthub-server-migration:local$'");
        expect(localDeploy).toContain('kubectl wait --for=condition=available deployment/agenthub-postgres');
        expect(localDeploy).not.toContain('minikube image build');
        expect(localDeploy).not.toContain('kubectl wait --for=condition=ready pod -l app=agenthub-postgres');
        expect(localDeploy).not.toContain('eval $(minikube docker-env)');
        expect(localDeploy).not.toContain('LOCAL_SECRETS=');
        expect(localDeploy).not.toMatch(/kubectl run agenthub-migrate[\s\S]{0,500}\|\| true/);
        expect(localDeploy).toContain('--image=agenthub-server-migration:local');
        expect(localDeploy).not.toContain('--image=agenthub-server:local');
        expect(localDeploy).toContain('/repo/packages/agenthub-server/node_modules/.bin/prisma migrate deploy');
        expect(localDeploy).not.toContain('npx prisma migrate deploy');
        expect(stressRunner).toContain('REDIS_PORT="$(node -e');
        expect(stressRunner).toContain('wait_for_redis_forward');
        expect(stressRunner).toContain('REDIS_PORT=$REDIS_PORT node');
        expect(productionStress).toContain('process.env.REDIS_PORT || "6379"');
    });
});
