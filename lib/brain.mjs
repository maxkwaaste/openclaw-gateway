import { spawn } from "child_process";
import { searchOpenBrain, captureThought } from "./tools/open-brain.mjs";
import {
  fetchActiveDeals,
  filterStuckDeals,
  searchDeals,
  getDealCount,
  searchContacts,
  fetchContactDetails,
} from "./tools/hubspot.mjs";
import { getReviewQueue, approveDraft } from "./tools/review-queue.mjs";
import { runClaude } from "./tools/claude-executor.mjs";
import { createEmailDraft } from "./tools/email-drafter.mjs";
import { isWriteOperation, formatConfirmation } from "./safety.mjs";

const CLAUDE_PATH = process.env.CLAUDE_PATH || "claude";

const SYSTEM_PROMPT = `You are OpenClaw, Max's AI business assistant for Proxuma (MSP software company). You run on Max's M1 Pro server and can execute tasks autonomously.

Available tools:
1. search_open_brain(query, limit?) - Search Open Brain memory for prior decisions, context, notes
2. capture_thought(content) - Save a decision, insight, or note to Open Brain
3. query_hubspot(action, query?, contact_ids?, stuck_days?) - Query HubSpot CRM. Actions: active_deals, stuck_deals, deal_count, search_deals, search_contacts, contact_details
4. check_review_queue() - List pending items in the review queue (email drafts awaiting approval)
5. approve_draft(id) - Approve a draft for sending [REQUIRES CONFIRMATION]
6. run_claude(prompt) - Spawn Claude Opus for complex analysis, research, or code tasks
7. send_email_draft(to, subject, body) - Create an email draft [REQUIRES CONFIRMATION]

Rules:
1. Be concise. Max messages from mobile. Short answers unless he asks for detail.
2. Never send emails or approve drafts without explicit confirmation from Max.
3. When asked to do something complex, explain what you'll do in one sentence, then do it.
4. Use Open Brain to remember decisions, context, and relationship notes.
5. When spawning Claude, give it a focused, specific task.
6. If unsure what Max means, ask one clarifying question.
7. Report results concisely: "Done. 3 drafts posted to review queue." not a wall of text.
8. You can proactively suggest things but never act without permission.

RESPONSE FORMAT: Respond with ONLY a raw JSON object. No markdown, no code fences, no text outside the JSON.

To reply directly:
{"action":"reply","text":"your response here"}

To call one tool first:
{"action":"tool_call","tool":"search_open_brain","args":{"query":"proxuma pricing"}}

To call multiple tools:
{"action":"tool_calls","calls":[{"tool":"search_open_brain","args":{"query":"test"}},{"tool":"query_hubspot","args":{"action":"deal_count"}}]}`;

function formatHistory(messages) {
  return messages
    .map((m) => `${m.role === "user" ? "Max" : "OpenClaw"}: ${m.content}`)
    .join("\n");
}

function buildPrompt(userMessage, history, toolContext) {
  let parts = [SYSTEM_PROMPT];

  if (history.length > 0) {
    parts.push("--- Recent conversation ---");
    parts.push(formatHistory(history));
  }

  if (toolContext.length > 0) {
    parts.push("--- Tool results from this turn ---");
    for (const tc of toolContext) {
      parts.push(`Called ${tc.tool}(${JSON.stringify(tc.args)})\nResult: ${tc.result}`);
    }
    parts.push("Now respond to Max based on these results.");
  }

  parts.push(`Max: ${userMessage}`);
  parts.push("JSON:");
  return parts.join("\n\n");
}

function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const proc = spawn(CLAUDE_PATH, ["-p", "--output-format", "text"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error("Claude timed out after 120s"));
    }, 120_000);

    proc.stdout.on("data", (chunk) => (stdout += chunk));
    proc.stderr.on("data", (chunk) => (stderr += chunk));

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`claude exit ${code}: ${stderr}`));
      else resolve(stdout.trim());
    });

    proc.on("error", reject);
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

function parseClaudeResponse(raw) {
  try {
    return JSON.parse(raw);
  } catch {}

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch {}
  }

  const obj = raw.match(/\{[\s\S]*\}/);
  if (obj) {
    try { return JSON.parse(obj[0]); } catch {}
  }

  return { action: "reply", text: raw };
}

let pendingOperation = null;

async function executeTool(name, args) {
  if (isWriteOperation(name)) {
    pendingOperation = { name, args };
    return formatConfirmation(name, args);
  }

  switch (name) {
    case "search_open_brain":
      return JSON.stringify(await searchOpenBrain(args.query, args.limit));
    case "capture_thought":
      return JSON.stringify(await captureThought(args.content));
    case "query_hubspot": {
      let result;
      switch (args.action) {
        case "active_deals": result = await fetchActiveDeals(); break;
        case "stuck_deals": result = filterStuckDeals(await fetchActiveDeals(), args.stuck_days || 7); break;
        case "deal_count": result = await getDealCount(); break;
        case "search_deals": result = await searchDeals(args.query); break;
        case "search_contacts": result = await searchContacts(args.query); break;
        case "contact_details": result = await fetchContactDetails(args.contact_ids || []); break;
        default: result = { error: `Unknown action: ${args.action}` };
      }
      return JSON.stringify(result);
    }
    case "check_review_queue":
      return JSON.stringify(await getReviewQueue());
    case "run_claude":
      return JSON.stringify(await runClaude(args.prompt));
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

async function runPendingTool(name, args) {
  switch (name) {
    case "approve_draft": return JSON.stringify(await approveDraft(args.id));
    case "send_email_draft": return JSON.stringify(await createEmailDraft(args.to, args.subject, args.body));
    default: return JSON.stringify({ error: `Unknown write op: ${name}` });
  }
}

export function getPendingOperation() { return pendingOperation; }
export function clearPendingOperation() { pendingOperation = null; }

export async function executePendingOperation() {
  if (!pendingOperation) return null;
  const { name, args } = pendingOperation;
  pendingOperation = null;
  return runPendingTool(name, args);
}

export async function processMessage(userMessage, conversationHistory) {
  const toolCalls = [];
  const toolContext = [];

  try {
    let iterations = 0;
    while (iterations < 5) {
      iterations++;

      const prompt = buildPrompt(userMessage, conversationHistory, toolContext);
      const raw = await callClaude(prompt);
      const parsed = parseClaudeResponse(raw);

      if (parsed.action === "reply") {
        return { response: parsed.text, toolCalls };
      }

      if (parsed.action === "tool_call") {
        const result = await executeTool(parsed.tool, parsed.args || {});
        toolCalls.push({ name: parsed.tool, args: parsed.args, result });

        if (isWriteOperation(parsed.tool)) {
          return { response: result, toolCalls };
        }

        toolContext.push({ tool: parsed.tool, args: parsed.args || {}, result });
        continue;
      }

      if (parsed.action === "tool_calls") {
        let hitWrite = false;
        for (const call of parsed.calls || []) {
          const result = await executeTool(call.tool, call.args || {});
          toolCalls.push({ name: call.tool, args: call.args, result });

          if (isWriteOperation(call.tool)) {
            hitWrite = true;
            return { response: result, toolCalls };
          }

          toolContext.push({ tool: call.tool, args: call.args || {}, result });
        }
        if (!hitWrite) continue;
      }

      return { response: parsed.text || raw, toolCalls };
    }

    return { response: "Reached tool call limit. Try a simpler request.", toolCalls };
  } catch (err) {
    console.error("processMessage failed:", err.message);
    return { response: "Brain offline, try again in a minute.", toolCalls: [] };
  }
}
