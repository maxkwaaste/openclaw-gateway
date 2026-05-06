import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const KEY = 'openclaw:conversation';
const MAX_MESSAGES = 20;

let redis = null;
let messages = [];
let messageCount = 0;

function getRedis() {
  if (!redis) {
    redis = new Redis(REDIS_URL);
    redis.on('error', err => console.error('Redis error:', err.message));
  }
  return redis;
}

export async function loadConversation() {
  try {
    const raw = await getRedis().get(KEY);
    messages = raw ? JSON.parse(raw) : [];
    return messages;
  } catch (err) {
    console.error('loadConversation failed:', err.message);
    messages = [];
    return [];
  }
}

export async function addMessage(role, content) {
  messages.push({ role, content });
  if (messages.length > MAX_MESSAGES) messages.shift();
  messageCount++;
  if (messageCount % 5 === 0) await persistConversation();
}

export function getMessages() {
  return [...messages];
}

export async function persistConversation() {
  try {
    await getRedis().set(KEY, JSON.stringify(messages));
  } catch (err) {
    console.error('persistConversation failed:', err.message);
  }
}

export async function clearConversation() {
  messages = [];
  await persistConversation();
}
