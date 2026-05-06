# OpenClaw -- Specification

Personal AI business assistant for Proxuma, accessible via Telegram.

## Core principle

One-person business tool. Telegram in, action out. The gateway spawns an LLM brain per message, the brain decides what to do, tools execute, results come back.

Cost predictability matters, but reliability matters more. The brain backend must be swappable without touching gateway logic.

## Architecture

```
Telegram (Max on mobile)
  |
  v
gateway.mjs (Node.js, long-polling)
  |
  v
brain.mjs (spawns brain backend per message)
  |
  +--> Brain responds with JSON: { action, tool?, args?, text? }
  |
  v
Tool executor (runs the requested tool)
  |
  v
Brain called again with tool results (up to 5 iterations)
  |
  v
Final text reply sent back to Telegram
```

## Brain

### Primary: DeepSeek V4 Flash

- **Engine:** DeepSeek V4 API via OpenAI SDK
- **Model:** `deepseek-v4-flash`
- **Billing:** Per-token. ~$2-5/mo at 50-100 messages/day
- **Invocation:** `openai.chat.completions.create()` with tools parameter
- **Response format:** Native OpenAI tool calling. Either text response or `tool_calls` array.
- **Tool chaining:** Up to 5 iterations per message. Tool results fed back as `role: 'tool'` messages.

### Escalation: DeepSeek V4 Pro

Complex reasoning tasks escalate to V4 Pro via the `run_deep_think` tool. Same API, same SDK, different model parameter. Flash decides when to escalate.

- **Model:** `deepseek-v4-pro`
- **Billing:** ~$0.435/M input, $0.87/M output
- **Triggers:** User asks for deep analysis, multi-step reasoning, or says "think harder"

### Backend interface

`brain.mjs` exports `processMessage(userMessage, conversationHistory)`. Internally uses the OpenAI SDK with DeepSeek base URL. The gateway does not know or care which model handles a given message.

## Tools

| Tool | Type | Description |
|------|------|-------------|
| `search_open_brain` | Read | Search Open Brain memory (semantic search) |
| `capture_thought` | Write | Save decision/insight/note to Open Brain |
| `query_hubspot` | Read | Query HubSpot CRM (deals, contacts, pipeline) |
| `check_review_queue` | Read | List pending items in the review queue |
| `approve_draft` | Write | Approve a draft for sending |
| `run_deep_think` | Read | Escalate to DeepSeek V4 Pro for complex reasoning |
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
- **Dependencies:** `node-telegram-bot-api`, `ioredis`, `openai`
- **Services required:** Redis, Open Brain API (port 9876), Review Dashboard (port 3040)

## Environment variables

```
DEEPSEEK_API_KEY   DeepSeek API key
BOT_TOKEN          Telegram bot token
ALLOWED_USER_ID    Telegram user ID (Max)
OPEN_BRAIN_URL     Open Brain API (http://localhost:9876)
REVIEW_API         Review dashboard API (http://localhost:3040)
REDIS_URL          Redis connection (redis://localhost:6379)
HUBSPOT_TOKEN      HubSpot API token
MS365_CLIENT_ID    Azure AD app client ID (for email drafts)
MS365_CLIENT_SECRET Azure AD app client secret
MS365_REFRESH_TOKEN OAuth refresh token for Max's mailbox
```

## What OpenClaw is NOT

- Not a general-purpose chatbot. It is a business tool for one person.
- Not a web app. Telegram is the only interface.
- Not autonomous. Write operations always require explicit human confirmation.
