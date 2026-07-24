# Standalone agenthub-server: single container, no external dependencies
# Uses PGlite (embedded Postgres), local filesystem storage, no Redis

# Stage 1: install dependencies
FROM node:20@sha256:8f693eaa7e0a8e71560c9a82b55fd54c2ae920a2ba5d2cde28bac7d1c01c9ba5 AS deps

ENV COREPACK_DEFAULT_TO_LATEST=0

RUN apt-get update && apt-get install -y python3 make g++ build-essential && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY scripts ./scripts
COPY patches ./patches

RUN mkdir -p packages/agenthub-app packages/agenthub-server packages/agenthub-cli packages/agenthub-agent packages/agenthub-wire

COPY packages/agenthub-app/package.json packages/agenthub-app/
COPY packages/agenthub-server/package.json packages/agenthub-server/
COPY packages/agenthub-cli/package.json packages/agenthub-cli/
COPY packages/agenthub-agent/package.json packages/agenthub-agent/
COPY packages/agenthub-wire/package.json packages/agenthub-wire/

# Workspace postinstall requirements
COPY packages/agenthub-app/patches packages/agenthub-app/patches
COPY packages/agenthub-server/prisma packages/agenthub-server/prisma
COPY packages/agenthub-cli/scripts packages/agenthub-cli/scripts
COPY packages/agenthub-cli/tools packages/agenthub-cli/tools

RUN SKIP_AGENTHUB_WIRE_BUILD=1 pnpm install --frozen-lockfile

# Stage 2: copy source and type-check
FROM deps AS builder

COPY packages/agenthub-wire ./packages/agenthub-wire
COPY packages/agenthub-server ./packages/agenthub-server

RUN pnpm --filter @artsum/agenthub-wire build
RUN pnpm --filter agenthub-server build

# Stage 3: runtime
FROM node:20-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS runner

WORKDIR /repo

RUN apt-get update && apt-get install -y ffmpeg curl && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 10001 agenthub \
    && useradd --system --uid 10001 --gid agenthub --create-home --home-dir /home/agenthub agenthub \
    && mkdir -p /data \
    && chown agenthub:agenthub /data

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PGLITE_DIR=/data/pglite

COPY --from=builder --chown=agenthub:agenthub /repo/node_modules /repo/node_modules
COPY --from=builder --chown=agenthub:agenthub /repo/packages/agenthub-wire /repo/packages/agenthub-wire
COPY --from=builder --chown=agenthub:agenthub /repo/packages/agenthub-server /repo/packages/agenthub-server

VOLUME /data
EXPOSE 13017

WORKDIR /repo/packages/agenthub-server

USER agenthub

CMD ["sh", "-c", "../../node_modules/.bin/tsx sources/standalone.ts migrate && exec ../../node_modules/.bin/tsx sources/standalone.ts serve"]
