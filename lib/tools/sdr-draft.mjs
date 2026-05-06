import { deepseek, MODELS } from '../deepseek.mjs';
import { fetchDeepContext, fetchLearnings } from '../forge.mjs';
import { buildDraftingPrompt } from '../prompts/sdr-drafting.mjs';

export async function draftEmail(contactId, category) {
  const [context, learnings] = await Promise.all([
    fetchDeepContext(contactId),
    fetchLearnings(),
  ]);

  if (!context || !context.contact) {
    return { success: false, error: `Contact ${contactId} not found in Forge` };
  }

  const prompt = buildDraftingPrompt(learnings.rules || []);

  const input = {
    contact_id: contactId,
    category: category || 'stale_deal_nudge',
    deep_context: context,
  };

  const response = await deepseek.chat.completions.create({
    model: MODELS.flash,
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: `Draft one email for this contact:\n\n${JSON.stringify(input)}` },
    ],
    temperature: 0.7,
  });

  try {
    const raw = response.choices[0].message.content.trim();
    const jsonStr = raw.startsWith('[') ? raw : raw.startsWith('{') ? raw : raw.match(/[\[{][\s\S]*[\]}]/)?.[0];
    const parsed = JSON.parse(jsonStr);
    const draft = Array.isArray(parsed) ? parsed[0] : parsed;
    return { success: true, draft };
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse draft: ${err.message}`,
      raw: response.choices[0].message.content.slice(0, 500),
    };
  }
}
