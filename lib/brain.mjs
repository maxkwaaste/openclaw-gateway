import { deepseek, MODELS } from './deepseek.mjs';
import { searchOpenBrain, captureThought } from './tools/open-brain.mjs';
import {
  fetchActiveDeals,
  filterStuckDeals,
  searchDeals,
  getDealCount,
  searchContacts,
  fetchContactDetails,
} from './tools/hubspot.mjs';
import { getReviewQueue, approveDraft } from './tools/review-queue.mjs';
import { runDeepThink } from './tools/deep-think.mjs';
import { createEmailDraft } from './tools/email-drafter.mjs';
import { searchInbox, searchSent, getRecent, readEmail } from './tools/outlook.mjs';
import { listTopics, getTopicArticles, readArticle, searchKB } from './tools/kb.mjs';
import { isWriteOperation, formatConfirmation } from './safety.mjs';

const SYSTEM_PROMPT = `You are OpenClaw, Max's AI business assistant for Proxuma (MSP software company). You run on Max's M1 Pro server and can execute tasks via tools.

Rules:
1. Be concise. Max messages from mobile. Short answers unless he asks for detail.
2. Never send emails or approve drafts without explicit confirmation from Max.
3. When asked to do something complex, explain what you'll do in one sentence, then do it.
4. Use Open Brain to remember decisions, context, and relationship notes.
5. When using deep think, give it a focused, specific task.
6. If unsure what Max means, ask one clarifying question.
7. Report results concisely: "Done. 3 drafts posted to review queue." not a wall of text.
8. You can proactively suggest things but never act without permission.`;

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'search_open_brain',
      description: 'Search Open Brain memory for prior decisions, context, notes',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'number', description: 'Max results to return (default 5)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'capture_thought',
      description: 'Save a decision, insight, or note to Open Brain for future reference',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The thought, decision, or insight to save' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_hubspot',
      description: 'Query HubSpot CRM for deals, contacts, and pipeline data',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['active_deals', 'stuck_deals', 'deal_count', 'search_deals', 'search_contacts', 'contact_details'],
            description: 'The CRM action to perform',
          },
          query: { type: 'string', description: 'Search query (for search_deals, search_contacts)' },
          contact_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Contact IDs to look up (for contact_details)',
          },
          stuck_days: { type: 'number', description: 'Days without activity to consider stuck (default 7)' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_review_queue',
      description: 'List pending items in the review queue (email drafts awaiting approval)',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'approve_draft',
      description: 'Approve a draft for sending. REQUIRES CONFIRMATION from Max before execution.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The draft ID to approve' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_deep_think',
      description: 'Escalate to DeepSeek V4 Pro for complex analysis, multi-step reasoning, or research tasks. Use when Flash is insufficient.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'The specific task or question for deep analysis' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_email_draft',
      description: 'Create an email draft via MS365. REQUIRES CONFIRMATION from Max before execution.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string', description: 'Email subject line' },
          body: { type: 'string', description: 'Email body (HTML supported)' },
        },
        required: ['to', 'subject', 'body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_outlook',
      description: 'Read emails from Outlook. Search inbox, search sent items, get recent emails, or read a specific email.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['search_inbox', 'search_sent', 'recent', 'read'],
            description: 'What to do: search_inbox, search_sent, recent (latest 20), read (single email by ID)',
          },
          query: { type: 'string', description: 'Search query (for search_inbox, search_sent)' },
          message_id: { type: 'string', description: 'Message ID to read (for read action)' },
          top: { type: 'number', description: 'Max results to return (default 10)' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_kb',
      description: 'Search the Proxuma Knowledge Base at kb.proxuma.com. List topics, get articles in a topic, read an article, or search by title.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list_topics', 'topic_articles', 'read_article', 'search'],
            description: 'What to do: list_topics, topic_articles (by slug), read_article (by slug), search (by title keyword)',
          },
          slug: { type: 'string', description: 'Topic or article slug (for topic_articles, read_article)' },
          query: { type: 'string', description: 'Search query (for search action)' },
        },
        required: ['action'],
      },
    },
  },
];

async function executeTool(name, args) {
  switch (name) {
    case 'search_open_brain':
      return JSON.stringify(await searchOpenBrain(args.query, args.limit));
    case 'capture_thought':
      return JSON.stringify(await captureThought(args.content));
    case 'query_hubspot': {
      let result;
      switch (args.action) {
        case 'active_deals': result = await fetchActiveDeals(); break;
        case 'stuck_deals': result = filterStuckDeals(await fetchActiveDeals(), args.stuck_days || 7); break;
        case 'deal_count': result = await getDealCount(); break;
        case 'search_deals': result = await searchDeals(args.query); break;
        case 'search_contacts': result = await searchContacts(args.query); break;
        case 'contact_details': result = await fetchContactDetails(args.contact_ids || []); break;
        default: result = { error: `Unknown action: ${args.action}` };
      }
      return JSON.stringify(result);
    }
    case 'check_review_queue':
      return JSON.stringify(await getReviewQueue());
    case 'run_deep_think':
      return JSON.stringify(await runDeepThink(args.prompt));
    case 'approve_draft':
      return JSON.stringify(await approveDraft(args.id));
    case 'send_email_draft':
      return JSON.stringify(await createEmailDraft(args.to, args.subject, args.body));
    case 'read_outlook': {
      let result;
      switch (args.action) {
        case 'search_inbox': result = await searchInbox(args.query, args.top || 10); break;
        case 'search_sent': result = await searchSent(args.query, args.top || 10); break;
        case 'recent': result = await getRecent(args.top || 20); break;
        case 'read': result = await readEmail(args.message_id); break;
        default: result = { error: `Unknown action: ${args.action}` };
      }
      return JSON.stringify(result);
    }
    case 'search_kb': {
      let result;
      switch (args.action) {
        case 'list_topics': result = await listTopics(); break;
        case 'topic_articles': result = await getTopicArticles(args.slug); break;
        case 'read_article': result = await readArticle(args.slug); break;
        case 'search': result = await searchKB(args.query); break;
        default: result = { error: `Unknown action: ${args.action}` };
      }
      return JSON.stringify(result);
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

let pendingOperation = null;

export function getPendingOperation() { return pendingOperation; }
export function clearPendingOperation() { pendingOperation = null; }

export async function executePendingOperation() {
  if (!pendingOperation) return null;
  const { name, args } = pendingOperation;
  pendingOperation = null;
  return executeTool(name, args);
}

export async function processMessage(userMessage, conversationHistory) {
  const toolCalls = [];

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  try {
    let iterations = 0;
    while (iterations < 5) {
      iterations++;

      const response = await deepseek.chat.completions.create({
        model: MODELS.flash,
        messages,
        tools: TOOL_DEFINITIONS,
      });

      const choice = response.choices[0];
      const msg = choice.message;

      if (choice.finish_reason === 'stop' || !msg.tool_calls?.length) {
        return { response: msg.content || '', toolCalls };
      }

      messages.push(msg);

      for (const tc of msg.tool_calls) {
        const name = tc.function.name;
        const args = JSON.parse(tc.function.arguments);

        if (isWriteOperation(name)) {
          pendingOperation = { name, args };
          return { response: formatConfirmation(name, args), toolCalls };
        }

        const result = await executeTool(name, args);
        toolCalls.push({ name, args, result });

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        });
      }
    }

    return { response: 'Reached tool call limit. Try a simpler request.', toolCalls };
  } catch (err) {
    console.error('processMessage failed:', err.message);
    return { response: 'Brain offline, try again in a minute.', toolCalls: [] };
  }
}
