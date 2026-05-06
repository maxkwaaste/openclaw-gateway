import OpenAI from 'openai';

let _client;

export function getClient() {
  if (!_client) {
    _client = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey: process.env.DEEPSEEK_API_KEY,
    });
  }
  return _client;
}

export const deepseek = { get chat() { return getClient().chat; } };

export const MODELS = {
  flash: 'deepseek-v4-flash',
  pro: 'deepseek-v4-pro',
};
