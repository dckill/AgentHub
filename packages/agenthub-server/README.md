# AgentHub Server

Minimal backend for open-source end-to-end encrypted AI coding-agent clients.

## What is AgentHub?

AgentHub Server is the synchronization backbone for AgentHub App, AgentHub CLI, and `agenthub-agent`. It lets phones, browsers, desktop clients, terminal controllers, and machine daemons share encrypted conversations, machine state, RPC requests, artifacts, credentials, and user KV while the server only stores encrypted blobs it cannot read.

## Features

- 🔐 **Zero Knowledge** - The server stores encrypted data but has no ability to decrypt it
- 🎯 **Minimal Surface** - Only essential features for secure sync, nothing more  
- 🕵️ **Privacy First** - No analytics, no tracking, no data mining
- 📖 **Open Source** - Transparent implementation you can audit and self-host
- 🔑 **Cryptographic Auth** - No passwords stored, only public key signatures
- ⚡ **Real-time Sync** - WebSocket-based synchronization across all your devices
- 📱 **Multi-device** - Seamless session management across phones, tablets, and computers
- 🔔 **Push Notifications** - Notify when an agent finishes tasks or needs permissions (encrypted, we can't see the content)
- 🌐 **Distributed Ready** - Built to scale horizontally when needed

## How It Works

AgentHub clients generate encryption keys locally and use AgentHub Server as a secure relay. Messages, machine metadata, daemon state, credentials, artifacts, and user KV are encrypted before leaving the device. The server stores, orders, and broadcasts encrypted blobs in real time; machine-scoped Socket.IO connections also carry RPC requests for remote spawn/resume/stop.

## Hosting

You can use the default AgentHub Server at `https://agenthub.yzsd.asia:8443`, or run your own. Since sensitive data is end-to-end encrypted before it reaches the server, the server stores and relays encrypted blobs rather than plaintext session content.

That said, AgentHub Server is open source and self-hostable if you prefer running your own infrastructure. The security model is identical whether you use our servers or your own.

## Self-Hosting with Docker

The standalone Docker image runs everything in a single container with no external dependencies (no Postgres, no Redis, no S3).

```bash
docker build -t agenthub-server -f Dockerfile .
```

Run from the monorepo root:

```bash
docker run -p 13017:13017 \
  -e AGENTHUB_MASTER_SECRET=<your-secret> \
  -v agenthub-data:/data \
  agenthub-server
```

This uses:
- **PGlite** - embedded PostgreSQL (data stored in `/data/pglite`)
- **Local filesystem** - for file uploads (stored in `/data/files`)
- **In-memory event bus** - no Redis needed

Data persists in the `agenthub-data` Docker volume across container restarts.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AGENTHUB_MASTER_SECRET` | Development only | - | Legacy development fallback; production must use purpose-specific versioned keys |
| `AGENTHUB_DATA_ENCRYPTION_KEY_VERSION` | Production | - | Active version used for new server-encrypted managed credentials |
| `AGENTHUB_DATA_ENCRYPTION_KEYS` | Production | - | JSON map of accepted data-encryption key versions; retain old versions during rotation |
| `AGENTHUB_TOKEN_KEY_VERSION` | No | `1` | Positive integer identifying the active token signing key |
| `AGENTHUB_TOKEN_KEYS` | Production | - | JSON object mapping accepted key versions to signing secrets; the active version must be present |
| `AGENTHUB_TOKEN_TTL_SECONDS` | No | `2592000` | Token lifetime in seconds (default 30 days) |
| `LOCAL_FILE_SIGNING_SECRET` | Production local storage | - | Dedicated secret for signed local-file URLs; must not equal a data/token key |
| `PUBLIC_URL` | No | `http://localhost:13017` | Public base URL for file URLs sent to clients |
| `PORT` | No | `13017` | Server port |
| `DATA_DIR` | No | `/data` | Base data directory |
| `PGLITE_DIR` | No | `/data/pglite` | PGlite database directory |

### Optional: External Services

To use external Postgres or Redis instead of the embedded defaults, set:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection URL (bypasses PGlite) |
| `REDIS_URL` | Redis connection URL |
| `S3_HOST` | S3/MinIO host (bypasses local file storage) |

When `S3_HOST` is not set, local file URLs are signed and served from `/files/*`. Production deployments should set `PUBLIC_URL` to the externally reachable server URL.

### Token key rotation

For a zero-downtime rotation, add the new secret beside the old one in `AGENTHUB_TOKEN_KEYS`, increment `AGENTHUB_TOKEN_KEY_VERSION`, deploy, and retain the old entry until all tokens signed by it have expired or been revoked. Never remove the old entry before that point. The first deployment of the persistent token lifecycle intentionally invalidates legacy tokens without `jti`, `exp`, and `keyVersion`; clients must sign in again after this security cutover.

Server-encrypted managed credentials follow the same overlap procedure with `AGENTHUB_DATA_ENCRYPTION_KEYS` and `AGENTHUB_DATA_ENCRYPTION_KEY_VERSION`. Reads try the active key and retained older keys; new writes use only the active key. Generate every purpose secret independently with a cryptographically secure generator and at least 32 characters. For local Kubernetes development, copy `deploy/overlays/local/secrets.example.yaml` to the ignored `secrets.yaml` and replace every placeholder before applying the overlay.

## License

Apache-2.0。Happy 上游代码的 MIT 许可证与归属保留在仓库根目录
`LICENSE-MIT` 和 `NOTICE` 中。
