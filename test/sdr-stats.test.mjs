import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('sdr-stats returns no-batch message when 404', async () => {
  const server = createServer((req, res) => {
    res.writeHead(404);
    res.end('Not Found');
  });

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  process.env.FORGE_URL = `http://localhost:${port}`;
  process.env.FORGE_SDR_TOKEN = 'test-token';

  const { showSdrStats } = await import('../lib/tools/sdr-stats.mjs');
  const stats = await showSdrStats();
  assert.equal(stats.batch_id, null);
  assert.ok(stats.message.includes('No batch'));

  server.close();
});
