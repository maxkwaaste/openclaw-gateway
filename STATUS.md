# OpenClaw -- Current Status

Last updated: 2026-05-06

## Summary

The gateway is fully built but not yet running. All modules are written, import chains verified, no syntax errors. Two blockers remain before first live test.

## What is built

### Gateway (`gateway.mjs`)
Entry point. Creates Telegram bot, listens for messages from Max (user ID check), routes to brain, sends response back. Handles pending write operation confirmations. Persists conversation on shutdown.

### Brain (`lib/brain.mjs`)
Spawns `claude -p` via stdin per message. System prompt defines OpenClaw identity and 7 available tools. Claude responds with JSON (`reply` or `tool_call`). Gateway parses response, executes tools, feeds results back for up to 5 iterations. Falls back to treating raw output as reply if JSON parsing fails.

### Conversation (`lib/conversation.mjs`)
In-memory message buffer (max 20). Redis persistence every 5 messages. Load on startup, save on shutdown.

### Safety (`lib/safety.mjs`)
Write operations (`approve_draft`, `send_email_draft`) blocked until Max confirms with trigger phrase ("do it", "yes", etc.).

### Telegram (`lib/telegram.mjs`)
Bot creation (long-polling), message sending with 4096-char chunking, typing action.

### Tools

| File | Status | Notes |
|------|--------|-------|
| `tools/open-brain.mjs` | Ready | HTTP calls to localhost:9876 |
| `tools/hubspot.mjs` | Ready | 6 CRM actions via HubSpot REST API |
| `tools/review-queue.mjs` | Ready | HTTP calls to review dashboard at :3040 |
| `tools/claude-executor.mjs` | Ready | Spawns `claude -p` for heavy Opus tasks |
| `tools/email-drafter.mjs` | Ready | Creates drafts via claude-executor + MS365 MCP |

### Config

| File | Purpose |
|------|---------|
| `ecosystem.config.cjs` | PM2 config |
| `lib/env.mjs` | Loads .env + HubSpot credentials |
| `.env` | Runtime config (bot token, service URLs) |

## Blockers

### 1. Telegram bot token conflict
The `com.proxuma.claude-telegram` LaunchAgent is running (PID active) and uses the same bot token (`8047925244`). Two processes cannot poll the same bot token. Must stop it first:
```bash
launchctl bootout gui/$(id -u)/com.proxuma.claude-telegram
```

### 2. HubSpot token
`HUBSPOT_TOKEN` in .env is empty. The token is loaded from `~/.hubspot-mcp/credentials.env` via env.mjs, so this may work if that file exists. Needs verification.

## Not yet tested

- End-to-end message flow (Telegram -> brain -> tool -> response)
- Tool execution with real data
- Multi-tool chaining (Claude calling 2+ tools in sequence)
- Conversation persistence across restarts
- Error recovery (Redis down, Open Brain down, HubSpot rate limit)

## Dependencies

```json
{
  "node-telegram-bot-api": "^0.66.0",
  "ioredis": "^5.4.0"
}
```

No LLM SDK. All AI inference via CLI subprocess.

## File tree

```
openclaw-gateway/
  gateway.mjs            Entry point
  ecosystem.config.cjs   PM2 config
  package.json
  .env                   Runtime config
  lib/
    brain.mjs            Claude CLI orchestrator
    conversation.mjs     Redis-backed message buffer
    env.mjs              Environment loader
    safety.mjs           Write operation gating
    telegram.mjs         Bot + message sender
    tools/
      claude-executor.mjs   Spawn Claude for heavy tasks
      email-drafter.mjs     Email draft creation
      hubspot.mjs           CRM queries
      open-brain.mjs        Memory search/capture
      review-queue.mjs      Draft approval queue
```
