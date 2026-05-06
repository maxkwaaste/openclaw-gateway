import { fetchBatchByDate } from '../forge.mjs';

export async function showSdrStats() {
  const today = new Date().toISOString().slice(0, 10);

  try {
    const batch = await fetchBatchByDate(today);

    const statusCounts = { pending: 0, approved: 0, edited: 0, rejected: 0, snoozed: 0 };
    for (const draft of batch.drafts || []) {
      const s = draft.status || 'pending';
      if (s in statusCounts) statusCounts[s]++;
    }

    return {
      date: today,
      batch_id: batch.id,
      draft_count: batch.draft_count,
      ...statusCounts,
      completed: batch.completed_at !== null,
    };
  } catch (err) {
    if (err.message.includes('404')) {
      return { date: today, batch_id: null, draft_count: 0, message: 'No batch yet today' };
    }
    throw err;
  }
}
