# OpenClaw -- Specification

Personal AI business assistant for Proxuma, accessible via Telegram.

## Core principle

All AI runs on subscription plans (Anthropic Max, OpenAI Plus). No API keys, no per-token billing. The gateway spawns CLI processes, never calls APIs directly for LLM inference.

## Architecture

```
Telegram (Max on mobile)
  |
  v
gateway.mjs (Node.js, long-polling)
  |
  v
brain.mjs (spawns `claude -p` per message)
  |
  +--> Claude responds with JSON: { action, tool?, args?, text? }
  |
  v
Tool executor (runs the requested tool)
  |
  v
Claude called again with tool results (up to 5 iterations)
  |
  v
Final text reply sent back to Telegram
```

## Brain

- **Engine:** Claude CLI (`claude -p`) via stdin, `--output-format text`
- **Model:** Whatever model the Max subscription provides (currently Sonnet)
- **Billing:** Zero. Runs on Anthropic Max subscription ($100/mo flat)
- **System prompt:** Defines OpenClaw identity, available tools, response format (JSON), and safety rules
- **Response format:** Raw JSON, no markdown. Either `{"action":"reply","text":"..."}` or `{"action":"tool_call","tool":"...","args":{...}}`
- **Tool chaining:** Up to 5 iterations per message. Each iteration spawns a fresh `claude -p` with accumulated tool results
- **Latency:** 2-5s per Claude spawn. Acceptable for a personal mobile assistant

## Tools

| Tool | Type | Description |
|------|------|-------------|
| `search_open_brain` | Read | Search Open Brain memory (semantic search) |
| `capture_thought` | Read | Save decision/insight/note to Open Brain |
| `query_hubspot` | Read | Query HubSpot CRM (deals, contacts, pipeline) |
| `check_review_queue` | Read | List pending email drafts awaiting approval |
| `approve_draft` | Write | Approve a draft for sending |
| `run_claude` | Read | Spawn Claude Opus for complex/heavy tasks |
| `send_email_draft` | Write | Create email draft via MS365 |

### HubSpot actions

`query_hubspot` supports: `active_deals`, `stuck_deals`, `deal_count`, `search_deals`, `search_contacts`, `contact_details`.

### Safety layer

Write operations (`approve_draft`, `send_email_draft`) are never executed immediately. The gateway returns a confirmation prompt. Max must reply with "do it", "send it", "approve", "yes", "go ahead", "confirm", or "ok" to execute.

## Conversation memory

- Last 20 messages stored in-memory
- Persisted to Redis every 5 messages (key: `openclaw:conversation`)
- Persisted on shutdown (SIGINT/SIGTERM)
- Format: `[{role: "user"|"assistant", content: "..."}]`

## Telegram

- Library: `node-telegram-bot-api` (long-polling, no webhooks)
- Auth: single allowed user (Max, ID `8764211796`)
- Messages chunked at 4096 chars
- Typing indicator sent before processing

## Infrastructure

- **Host:** M1 Pro (`100.85.64.20` via Tailscale)
- **Process manager:** PM2 (`openclaw-gateway`, id 4)
- **Node.js:** ESM modules
- **Dependencies:** `node-telegram-bot-api`, `ioredis` (no LLM SDK)
- **Services required:** Redis, Open Brain API (port 9876), Review Dashboard (port 3040)

## Environment variables

```
BOT_TOKEN          Telegram bot token
ALLOWED_USER_ID    Telegram user ID (Max)
CLAUDE_PATH        Path to claude binary (/opt/homebrew/bin/claude)
OPEN_BRAIN_URL     Open Brain API (http://localhost:9876)
REVIEW_API         Review dashboard API (http://localhost:3040)
REDIS_URL          Redis connection (redis://localhost:6379)
HUBSPOT_TOKEN      HubSpot API token (loaded from ~/.hubspot-mcp/credentials.env)
```

## What OpenClaw is NOT

- Not a general-purpose chatbot. It is a business tool for one person.
- Not a web app. Telegram is the only interface.
- Not an API consumer for LLM inference. All LLM calls go through subscription CLIs.
- Not autonomous. Write operations always require explicit human confirmation.
