import './lib/env.mjs';
import { createBot, sendMessage, sendTypingAction } from './lib/telegram.mjs';
import { processMessage, getPendingOperation, clearPendingOperation, executePendingOperation } from './lib/brain.mjs';
import { loadConversation, addMessage, getMessages, persistConversation } from './lib/conversation.mjs';
import { CONFIRMATION_PHRASES } from './lib/safety.mjs';

async function main() {
  await loadConversation();

  const bot = createBot(process.env.BOT_TOKEN);
  const allowedUser = Number(process.env.ALLOWED_USER_ID);

  console.log(`[${new Date().toISOString()}] OpenClaw gateway started`);

  bot.on('message', async (msg) => {
    try {
      if (msg.from.id !== allowedUser) return;

      const text = msg.text;
      if (!text) return;

      const chatId = msg.chat.id;
      await sendTypingAction(bot, chatId);

      const pending = getPendingOperation();
      if (pending && CONFIRMATION_PHRASES.has(text.toLowerCase().trim())) {
        const result = await executePendingOperation();
        await addMessage('user', text);
        await addMessage('assistant', result);
        await sendMessage(bot, chatId, result);
        return;
      }

      if (pending) {
        clearPendingOperation();
      }

      const { response } = await processMessage(text, getMessages());

      await addMessage('user', text);
      await addMessage('assistant', response);
      await sendMessage(bot, chatId, response);
    } catch (err) {
      console.error('Message handler error:', err);
      try {
        await sendMessage(bot, msg.chat.id, 'Something went wrong. Try again.');
      } catch {}
    }
  });
}

async function shutdown() {
  console.log('Shutting down, persisting conversation...');
  await persistConversation();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

main();
