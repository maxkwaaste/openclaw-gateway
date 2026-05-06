import { deepseek, MODELS } from '../deepseek.mjs';
import {
  fetchCandidates,
  fetchDeepContext,
  fetchLearnings,
  fetchQueuedSequences,
  postBatch,
} from '../forge.mjs';
import { SDR_SCORING_PROMPT } from '../prompts/sdr-scoring.mjs';
import { buildDraftingPrompt } from '../prompts/sdr-drafting.mjs';

export async function runSdrBatch() {
  const today = new Date().toISOString().slice(0, 10);
  const log = (msg) => console.log(`[SDR ${today}] ${msg}`);

  log('Starting morning batch');

  const [learnings, sequences, candidates] = await Promise.all([
    fetchLearnings(),
    fetchQueuedSequences(),
    fetchCandidates(50),
  ]);

  log(`Fetched ${candidates.length} candidates, ${sequences.length} queued sequences, ${(learnings.rules || []).length} writing rules`);

  if (candidates.length === 0) {
    return { success: false, reason: 'No candidates returned from Forge' };
  }

  const scoringInput = JSON.stringify({
    candidates,
    queued_sequences: sequences,
    approval_rates: learnings.approval_rates_7d || [],
  });

  log('Scoring with V4 Pro...');
  const scoringResponse = await deepseek.chat.completions.create({
    model: MODELS.pro,
    messages: [
      { role: 'system', content: SDR_SCORING_PROMPT },
      { role: 'user', content: `Score and select the top 25 from these candidates:\n\n${scoringInput}` },
    ],
    temperature: 0.3,
  });

  let selected;
  try {
    const raw = scoringResponse.choices[0].message.content.trim();
    const jsonStr = raw.startsWith('[') ? raw : raw.match(/\[[\s\S]*\]/)?.[0];
    selected = JSON.parse(jsonStr);
  } catch (err) {
    log(`Scoring parse failed: ${err.message}`);
    return { success: false, reason: `Scoring output was not valid JSON: ${err.message}` };
  }

  log(`Selected ${selected.length} contacts for drafting`);

  if (selected.length === 0) {
    return { success: false, reason: 'Scoring returned 0 contacts' };
  }

  log('Fetching deep context...');
  const deepContexts = await Promise.all(
    selected.map(async (s) => {
      try {
        const ctx = await fetchDeepContext(s.contact_id);
        return { ...s, deep_context: ctx };
      } catch (err) {
        log(`Deep context failed for ${s.contact_id}: ${err.message}`);
        return { ...s, deep_context: null };
      }
    })
  );

  const draftingPrompt = buildDraftingPrompt(learnings.rules || []);

  const BATCH_SIZE = 5;
  const allDrafts = [];

  for (let i = 0; i < deepContexts.length; i += BATCH_SIZE) {
    const chunk = deepContexts.slice(i, i + BATCH_SIZE);
    log(`Drafting batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(deepContexts.length / BATCH_SIZE)}...`);

    const draftingResponse = await deepseek.chat.completions.create({
      model: MODELS.flash,
      messages: [
        { role: 'system', content: draftingPrompt },
        { role: 'user', content: `Draft emails for these ${chunk.length} contacts:\n\n${JSON.stringify(chunk)}` },
      ],
      temperature: 0.7,
    });

    try {
      const raw = draftingResponse.choices[0].message.content.trim();
      const jsonStr = raw.startsWith('[') ? raw : raw.match(/\[[\s\S]*\]/)?.[0];
      const drafts = JSON.parse(jsonStr);
      allDrafts.push(...drafts);
    } catch (err) {
      log(`Drafting parse failed for chunk ${i}: ${err.message}`);
    }
  }

  log(`Generated ${allDrafts.length} drafts, posting to Forge...`);

  if (allDrafts.length === 0) {
    return { success: false, reason: 'Drafting produced 0 emails' };
  }

  const batch = await postBatch(today, allDrafts, allDrafts.length >= selected.length);

  log(`Batch posted: ${allDrafts.length} drafts`);

  return {
    success: true,
    date: today,
    drafted: allDrafts.length,
    selected: selected.length,
    candidates: candidates.length,
    batch_id: batch.id,
  };
}
