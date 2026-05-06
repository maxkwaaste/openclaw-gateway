import TelegramBot from 'node-telegram-bot-api';

const MAX_LENGTH = 4096;

export function createBot(token) {
  return new TelegramBot(token, { polling: true });
}

export async function sendMessage(bot, chatId, text) {
  try {
    if (text.length <= MAX_LENGTH) {
      return await bot.sendMessage(chatId, text);
    }

    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= MAX_LENGTH) {
        chunks.push(remaining);
        break;
      }
      let splitAt = remaining.lastIndexOf('\n', MAX_LENGTH);
      if (splitAt === -1 || splitAt < MAX_LENGTH / 2) {
        splitAt = remaining.lastIndexOf(' ', MAX_LENGTH);
      }
      if (splitAt === -1 || splitAt < MAX_LENGTH / 2) {
        splitAt = MAX_LENGTH;
      }
      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }

    let last = null;
    for (const chunk of chunks) {
      last = await bot.sendMessage(chatId, chunk);
    }
    return last;
  } catch (err) {
    console.error('sendMessage failed:', err.message);
    return null;
  }
}

export async function sendTypingAction(bot, chatId) {
  try {
    await bot.sendChatAction(chatId, 'typing');
  } catch {}
}
