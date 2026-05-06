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

### Primary: Claude CLI (`claude -p`)

- **Engine:** Claude CLI subprocess via stdin
- **Model:** Whatever the Max subscription provides (currently Sonnet)
- **Billing:** Anthropic Max subscription ($100/mo flat)
- **Invocation:** `claude -p --output-format text` with system prompt + conversation piped to stdin
- **Response format:** Raw JSON. Either `{"action":"reply","text":"..."}` or `{"action":"tool_call","tool":"...","args":{...}}`
- **Tool chaining:** Up to 5 iterations per message. Each iteration spawns a fresh `claude -p`
- **Latency:** 2-5s per spawn. Acceptable for mobile use.

### Fallback: Anthropic API (direct)

If `claude -p` stops working (see Billing & Limits below), the brain switches to direct Anthropic API calls using the `@anthropic-ai/sdk` npm package. Same system prompt, same JSON contract, same tool chaining logic. The only change is the transport layer.

- **Model:** `claude-sonnet-4-6` (or latest Sonnet)
- **Billing:** Per-token. Estimated $5-15/mo at 50-100 messages/day with prompt caching
- **Auth:** `ANTHROPIC_API_KEY` env var
- **Advantage:** Prompt caching works properly (unlike CLI subprocess where context compaction breaks cache prefixes). Reliable, no TTY hacks, no telemetry risk.

### Backend interface

`brain.mjs` exports a single function: `ask(conversationHistory, systemPrompt) -> JSON`. The implementation behind that function is swappable. Current implementation spawns `claude -p`. Fallback implementation calls the Anthropic API. The gateway does not know or care which one is active.

## Billing & Limits

### What the research found

An independent technical review (May 2026) evaluated whether subscription-based CLI tools can legally and practically serve as automated subprocess brains. Key findings:

**Claude CLI (`claude -p`) -- high risk, actively being restricted:**

- Anthropic is deploying a `--bare` flag that forces API key authentication for all non-interactive (`-p`) usage. This flag is slated to become the mandatory default, which would block subscription-funded headless calls entirely.
- Anthropic's backend runs prompt classification heuristics that detect third-party automation harnesses. System prompts containing phrases like "personal assistant" combined with structured JSON tool schemas and 24/7 request patterns trigger HTTP 400 blocks.
- Traffic flagged as third-party automation gets routed to an "Extra Usage" billing bucket, bypassing subscription limits.
- Account termination for detected automation proxies is a documented enforcement action, not a theoretical risk.

**OpenAI Codex CLI -- not viable as primary:**

- April 2026: OpenAI replaced message-based limits with strict token-to-credit mapping. An agentic workflow doing 300+ inference loops/day (from 100 messages with tool chaining) exhausts Plus/Pro credits within days.
- ToS explicitly prohibits programmatic data extraction outside the official metered API.

**GitHub Copilot CLI -- insufficient volume:**

- Pro+ tier caps at 1,500 premium requests/month. A 100 msg/day bot needs 3,000+/month minimum.

**Google Gemini CLI -- unreliable throttling:**

- Published limits are generous (2,000 requests/day) but aggressive unstated throttling kicks in well below that for burst-pattern automated traffic.

**Poe API -- viable flat-rate alternative:**

- Official API draws from subscription compute points (660,000/mo for ~$200/yr annual plan).
- OpenAI-compatible HTTP endpoint. No CLI wrapping, no TTY hacks.
- Supports tool calling across GPT-4o, Claude Sonnet, Gemini Pro.
- ToS-compliant for programmatic use. This is the intended use case.
- Risk: point budget is finite. Premium models burn points fast. Requires model routing (cheap model for triage, expensive for reasoning).

### Cost comparison for 100 messages/day

| Backend | Monthly cost | Reliability | ToS risk |
|---------|-------------|-------------|----------|
| `claude -p` (Max sub) | $100 flat | Degrading | High |
| Anthropic API (Sonnet, cached) | ~$5-15 variable | High | None |
| Anthropic API (Opus, cached) | ~$30-80 variable | High | None |
| Poe API (annual plan) | ~$17 flat | Medium | None |
| OpenAI API (GPT-4o) | ~$5-20 variable | High | None |

### Decision

**Phase 1 (now):** Ship with `claude -p`. It works today, Max already pays for Max. Get the product running.

**Phase 2 (when `claude -p` breaks):** Switch to direct Anthropic API with prompt caching. The per-token cost at personal scale (50-100 msgs/day) is low enough that flat-rate subscription is not worth the reliability trade-off. The brain interface makes this a config change, not a rewrite.

**Not pursued:** Poe API is a valid option but adds a third-party dependency between us and the model. Direct API access to Anthropic gives better model quality, lower latency, and full control over caching and context management.

## Tools

| Tool | Type | Description |
|------|------|-------------|
| `search_open_brain` | Read | Search Open Brain memory (semantic search) |
| `capture_thought` | Write | Save decision/insight/note to Open Brain |
| `query_hubspot` | Read | Query HubSpot CRM (deals, contacts, pipeline) |
| `check_review_queue` | Read | List pending items in the review queue |
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
- **Dependencies:** `node-telegram-bot-api`, `ioredis` (no LLM SDK until Phase 2)
- **Services required:** Redis, Open Brain API (port 9876), Review Dashboard (port 3040)

## Environment variables

```
BOT_TOKEN          Telegram bot token
ALLOWED_USER_ID    Telegram user ID (Max)
CLAUDE_PATH        Path to claude binary (/opt/homebrew/bin/claude)
OPEN_BRAIN_URL     Open Brain API (http://localhost:9876)
REVIEW_API         Review dashboard API (http://localhost:3040)
REDIS_URL          Redis connection (redis://localhost:6379)
HUBSPOT_TOKEN      HubSpot API token
ANTHROPIC_API_KEY  Anthropic API key (Phase 2 fallback, optional until needed)
```

## What OpenClaw is NOT

- Not a general-purpose chatbot. It is a business tool for one person.
- Not a web app. Telegram is the only interface.
- Not autonomous. Write operations always require explicit human confirmation.
