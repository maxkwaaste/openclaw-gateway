import { deepseek, MODELS } from '../deepseek.mjs';

let running = false;

export async function runDeepThink(prompt) {
  if (running) {
    return { success: false, error: 'Deep think session already running, try again shortly' };
  }

  running = true;
  try {
    const response = await deepseek.chat.completions.create({
      model: MODELS.pro,
      messages: [
        { role: 'system', content: 'You are a deep reasoning assistant for Proxuma, an MSP software company. Provide thorough, well-structured analysis. Be precise and actionable.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 4096,
    });
    return { success: true, output: response.choices[0].message.content };
  } catch (err) {
    console.error('runDeepThink failed:', err.message);
    return { success: false, error: err.message };
  } finally {
    running = false;
  }
}
