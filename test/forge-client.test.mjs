import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const MOCK_CANDIDATES = [
  {
    contact_id: '550e8400-e29b-41d4-a716-446655440001',
    first_name: 'Mike',
    last_name: 'Johnson',
    email: 'mike@example-msp.com',
    company_name: 'Example MSP',
    deal_id: '660e8400-e29b-41d4-a716-446655440001',
    deal_name: 'Example MSP - Proxuma',
    deal_stage: 'proposal',
    deal_amount: 1200,
    days_since_last_email: 3,
    days_since_last_meeting: 2,
  },
];

const MOCK_LEARNINGS = {
  rules: [
    { rule: 'Never open with I', confidence: 0.9, example_count: 15, source: 'edit_diff', category: null, active: true },
  ],
  approval_rates_7d: [],
};

function createMockForge() {
  const calls = [];
  const server = createServer((req, res) => {
    calls.push({ method: req.method, url: req.url });
    res.setHeader('Content-Type', 'application/json');

    if (req.url.includes('/sdr/candidates') && !req.url.includes('deep-context')) {
      res.end(JSON.stringify({ data: MOCK_CANDIDATES }));
    } else if (req.url.includes('deep-context')) {
      res.end(JSON.stringify({
        contact: MOCK_CANDIDATES[0],
        deals: [{ id: MOCK_CANDIDATES[0].deal_id, name: 'Test Deal', stage: 'proposal', amount: 1200 }],
        recent_emails: [],
        recent_meetings: [{ title: 'Demo call', start_time: '2026-05-04T10:00:00' }],
      }));
    } else if (req.url.includes('/sdr/learnings')) {
      res.end(JSON.stringify(MOCK_LEARNINGS));
    } else if (req.url.includes('/sdr/sequences')) {
      res.end(JSON.stringify({ data: [] }));
    } else if (req.method === 'POST' && req.url.includes('/sdr/batches')) {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        const parsed = JSON.parse(body);
        res.writeHead(201);
        res.end(JSON.stringify({ id: 1, date: parsed.date, draft_count: parsed.drafts.length }));
      });
      return;
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'not found' }));
    }
  });

  return { server, calls };
}

test('forge client calls correct endpoints', async () => {
  const { server, calls } = createMockForge();

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  process.env.FORGE_URL = `http://localhost:${port}`;
  process.env.FORGE_SDR_TOKEN = 'test-token';

  const { fetchCandidates, fetchLearnings, fetchQueuedSequences } = await import('../lib/forge.mjs');

  const candidates = await fetchCandidates(50);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].first_name, 'Mike');

  const learnings = await fetchLearnings();
  assert.equal(learnings.rules.length, 1);

  const sequences = await fetchQueuedSequences();
  assert.equal(sequences.length, 0);

  assert.ok(calls.some(c => c.url.includes('/sdr/candidates')));
  assert.ok(calls.some(c => c.url.includes('/sdr/learnings')));
  assert.ok(calls.some(c => c.url.includes('/sdr/sequences')));

  server.close();
});
