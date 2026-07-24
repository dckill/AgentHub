# AgentHub Agent

CLI client for controlling AgentHub machines and coding-agent sessions remotely.

Unlike `agenthub-cli` which both runs and controls agents, `agenthub-agent` only controls them — listing machines, spawning sessions on a machine, creating sessions, sending messages, reading history, monitoring state, and stopping sessions.

## Installation

From the monorepo:

```bash
pnpm --filter agenthub-agent build
```

Or link globally:

```bash
cd packages/agenthub-agent && npm link
```

## Authentication

AgentHub Agent uses account authentication via QR code, the same flow as linking a device in the AgentHub mobile app.

```bash
# Authenticate by scanning QR code with the AgentHub mobile app
agenthub-agent auth login

# Check authentication status
agenthub-agent auth status

# Clear stored credentials
agenthub-agent auth logout
```

Credentials are stored at `~/.agenthub/agent.key`.

## Commands

### List sessions

```bash
# List all sessions
agenthub-agent list

# List only active sessions
agenthub-agent list --active

# Output as JSON
agenthub-agent list --json
```

### List machines

```bash
# List all machines
agenthub-agent machines

# List only active machines
agenthub-agent machines --active

# Output as JSON
agenthub-agent machines --json
```

### Spawn on a machine

```bash
# Spawn a session on a specific machine
agenthub-agent spawn --machine <machine-id> --path ~/project

# Let the daemon create the directory if needed
agenthub-agent spawn --machine <machine-id> --path ~/new-project --create-dir

# Choose a specific agent
agenthub-agent spawn --machine <machine-id> --path ~/project --agent codex

# Output as JSON
agenthub-agent spawn --machine <machine-id> --path ~/project --json
```

### Session status

```bash
# Get live session state (supports ID prefix matching)
agenthub-agent status <session-id>

# Output as JSON
agenthub-agent status <session-id> --json
```

### Create a session

```bash
# Create a new session with a tag
agenthub-agent create --tag my-project

# Specify a working directory
agenthub-agent create --tag my-project --path /home/user/project

# Output as JSON
agenthub-agent create --tag my-project --json
```

### Send a message

```bash
# Send a message to a session
agenthub-agent send <session-id> "Fix the login bug"

# Send with yolo permissions
agenthub-agent send <session-id> "Ship it" --yolo

# Send and wait for the agent to finish
agenthub-agent send <session-id> "Run the tests" --wait

# Output as JSON
agenthub-agent send <session-id> "Hello" --json
```

### Message history

```bash
# View message history
agenthub-agent history <session-id>

# Limit to last N messages
agenthub-agent history <session-id> --limit 10

# Output as JSON
agenthub-agent history <session-id> --json
```

### Stop a session

```bash
agenthub-agent stop <session-id>
```

### Wait for idle

```bash
# Wait for agent to become idle (default 300s timeout)
agenthub-agent wait <session-id>

# Custom timeout
agenthub-agent wait <session-id> --timeout 60
```

Exit code 0 when agent becomes idle, 1 on timeout.

## Environment Variables

- `AGENTHUB_SERVER_URL` - API server URL (default: `https://agenthub.yzsd.asia:8443`)
- `AGENTHUB_HOME_DIR` - Home directory for credential storage (default: `~/.agenthub`)

## Session ID Matching

All commands that accept a `<session-id>` support prefix matching. You can provide the first few characters of a session ID and the CLI will resolve the full ID.

Machine-aware commands such as `spawn --machine <machine-id>` also support ID prefix matching.

## Encryption

All machine and session data is end-to-end encrypted. New records use AES-256-GCM with per-record keys. Existing records created by other clients are decrypted using the appropriate key scheme (AES-256-GCM or legacy NaCl secretbox).

## Requirements

- Node.js >= 20.0.0
- A AgentHub mobile app account for authentication

## Publishing

Maintainers should use the repository release workflow from the root:

```bash
pnpm release -- agenthub-agent
```

This flow:
- runs tests/build checks via `prepublishOnly`
- creates a release commit and `agenthub-agent-vX.Y.Z` tag
- creates a GitHub release with generated notes
- publishes `agenthub-agent` to npm

## License

Apache-2.0。Happy 上游代码的 MIT 许可证与归属保留在仓库根目录
`LICENSE-MIT` 和 `NOTICE` 中。
