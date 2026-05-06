const FORGE_URL = process.env.FORGE_URL || 'http://localhost:8000';
const FORGE_TOKEN = process.env.FORGE_SDR_TOKEN;

async function forgeRequest(method, path, body) {
  const options = {
    method,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${FORGE_TOKEN}`,
    },
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${FORGE_URL}/api${path}`, options);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Forge ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }

  return res.json();
}

export async function fetchCandidates(limit = 50) {
  const data = await forgeRequest('GET', `/sdr/candidates?limit=${limit}`);
  return data.data || [];
}

export async function fetchDeepContext(contactId) {
  return forgeRequest('GET', `/sdr/candidates/${contactId}/deep-context`);
}

export async function fetchLearnings() {
  return forgeRequest('GET', '/sdr/learnings');
}

export async function fetchQueuedSequences() {
  const data = await forgeRequest('GET', '/sdr/sequences?status=queued');
  return data.data || [];
}

export async function postBatch(date, drafts, complete = true) {
  return forgeRequest('POST', '/sdr/batches', { date, complete, drafts });
}

export async function fetchBatchByDate(date) {
  return forgeRequest('GET', `/sdr/batches/${date}`);
}

export async function fetchBatches(limit = 14) {
  const data = await forgeRequest('GET', `/sdr/batches?limit=${limit}`);
  return data.data || [];
}

export async function putWritingRules(rules) {
  return forgeRequest('PUT', '/sdr/writing-rules', { rules });
}

export async function fetchFeedbackStats() {
  return forgeRequest('GET', '/sdr/feedback-stats');
}
