import cron from 'node-cron';
import { deepseek, MODELS } from './deepseek.mjs';
import { runSdrBatch } from './tools/sdr-batch.mjs';
import {
  fetchBatchByDate,
  fetchLearnings,
  fetchFeedbackStats,
  putWritingRules,
} from './forge.mjs';

let morningJob = null;
let eveningJob = null;

async function morningBatch() {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`[CRON] Morning SDR batch starting for ${today}`);

  try {
    const result = await runSdrBatch();
    console.log(`[CRON] Morning batch result:`, JSON.stringify(result));
  } catch (err) {
    console.error(`[CRON] Morning batch failed:`, err.message);
  }
}

async function eveningLearning() {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`[CRON] Evening learning extraction starting for ${today}`);

  try {
    const [batch, currentLearnings, feedbackStats] = await Promise.all([
      fetchBatchByDate(today).catch(() => null),
      fetchLearnings(),
      fetchFeedbackStats(),
    ]);

    if (!batch || !batch.drafts?.length) {
      console.log('[CRON] No batch or no feedback today, skipping learning');
      return;
    }

    const editedDrafts = (batch.drafts || []).filter(
      d => d.status === 'edited' && d.sent_body && d.sent_body !== d.body
    );

    if (editedDrafts.length === 0 && !feedbackStats.recent_edits?.length) {
      console.log('[CRON] No edits to learn from today');
      return;
    }

    const learningInput = JSON.stringify({
      current_rules: currentLearnings.rules || [],
      approval_rates: currentLearnings.approval_rates_7d || [],
      todays_edits: editedDrafts.map(d => ({
        category: d.category,
        original_subject: d.subject,
        sent_subject: d.sent_subject,
        original_body: d.body,
        sent_body: d.sent_body,
        feedback: d.feedback?.[0]?.explicit_feedback || null,
      })),
      recent_feedback_stats: feedbackStats,
    });

    console.log(`[CRON] Analyzing ${editedDrafts.length} edits with V4 Pro...`);

    const response = await deepseek.chat.completions.create({
      model: MODELS.pro,
      messages: [
        {
          role: 'system',
          content: `You are the learning engine for Proxuma's SDR system. Analyze today's edit diffs and feedback to extract or update writing rules.

## Rule Management

- New pattern (5+ examples): create rule with confidence 0.5
- Existing rule reinforced: increase confidence (max 1.0)
- Existing rule contradicted: decrease confidence
- Rules below 0.3 confidence: set active to false
- 30-day decay: rules not reinforced in 30 days should drop 0.1 confidence

## Output Format

Return the full updated rules array as JSON:

\`\`\`json
[
  {
    "rule": "Never open with 'I hope this finds you well'",
    "confidence": 0.95,
    "example_count": 23,
    "source": "edit_diff",
    "category": null,
    "active": true
  }
]
\`\`\`

Return ONLY the JSON array.`,
        },
        {
          role: 'user',
          content: `Analyze this data and return updated writing rules:\n\n${learningInput}`,
        },
      ],
      temperature: 0.2,
    });

    try {
      const raw = response.choices[0].message.content.trim();
      const jsonStr = raw.startsWith('[') ? raw : raw.match(/\[[\s\S]*\]/)?.[0];
      const updatedRules = JSON.parse(jsonStr);

      await putWritingRules(updatedRules);
      console.log(`[CRON] Updated ${updatedRules.length} writing rules`);
    } catch (err) {
      console.error(`[CRON] Learning parse failed: ${err.message}`);
    }
  } catch (err) {
    console.error(`[CRON] Evening learning failed:`, err.message);
  }
}

export function startCron() {
  morningJob = cron.schedule('0 7 * * 1-5', morningBatch, {
    timezone: 'Europe/Amsterdam',
  });

  eveningJob = cron.schedule('0 17 * * 1-5', eveningLearning, {
    timezone: 'Europe/Amsterdam',
  });

  console.log('[CRON] SDR scheduled: morning batch 07:00 CET, evening learning 17:00 CET (Mon-Fri)');
}

export function stopCron() {
  morningJob?.stop();
  eveningJob?.stop();
}

export { morningBatch, eveningLearning };
