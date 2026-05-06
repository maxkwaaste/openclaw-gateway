import { fetchCandidates, fetchQueuedSequences } from '../forge.mjs';

export async function checkPipeline() {
  const [candidates, sequences] = await Promise.all([
    fetchCandidates(50),
    fetchQueuedSequences(),
  ]);

  const byStage = {};
  const byCategory = { post_demo_followup: 0, new_inbound: 0, stale_deal_nudge: 0, customer_upsell: 0, win_back: 0 };

  for (const c of candidates) {
    const stage = c.deal_stage || 'no_deal';
    byStage[stage] = (byStage[stage] || 0) + 1;

    const daysSinceEmail = Number(c.days_since_last_email) || 999;
    const daysSinceMeeting = Number(c.days_since_last_meeting) || 999;

    if (daysSinceMeeting <= 5) byCategory.post_demo_followup++;
    else if (daysSinceEmail <= 2) byCategory.new_inbound++;
    else if (daysSinceEmail >= 7 && c.deal_stage && c.deal_stage !== 'closedlost') byCategory.stale_deal_nudge++;
    else if (c.deal_stage === 'closedlost') byCategory.win_back++;
  }

  return {
    total_candidates: candidates.length,
    deals_by_stage: byStage,
    estimated_categories: byCategory,
    queued_sequences: sequences.length,
    sequence_contacts: sequences.map(s => ({
      contact_id: s.contact_id,
      step: s.step,
      due_date: s.due_date,
    })),
  };
}
