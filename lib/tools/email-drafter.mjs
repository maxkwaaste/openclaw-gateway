import { runClaude } from './claude-executor.mjs';

export async function createEmailDraft(to, subject, body) {
  const prompt = `Use the MS365 MCP tools to create a draft email (do NOT send it).
To: ${to}
Subject: ${subject}
Body:
${body}

Create the draft only. Do not send the email.`;

  return runClaude(prompt);
}
