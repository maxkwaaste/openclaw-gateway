const WRITE_OPS = new Set(['approve_draft', 'send_email_draft', 'run_sdr_batch']);

export function isWriteOperation(toolName) {
  return WRITE_OPS.has(toolName);
}

export function formatConfirmation(toolName, args) {
  switch (toolName) {
    case 'approve_draft':
      return `About to approve draft #${args.id}. Say 'do it' to confirm.`;
    case 'send_email_draft':
      return `About to create email draft to ${args.to} with subject '${args.subject}'. Say 'do it' to confirm.`;
    case 'run_sdr_batch':
      return 'About to run SDR morning batch (fetches candidates, drafts up to 25 emails, posts to Forge). This takes 2-5 minutes. Say \'do it\' to confirm.';
    default:
      return `About to execute ${toolName}. Say 'do it' to confirm.`;
  }
}

export const CONFIRMATION_PHRASES = new Set([
  'do it',
  'send it',
  'approve',
  'yes',
  'go ahead',
  'confirm',
  'ok',
]);
