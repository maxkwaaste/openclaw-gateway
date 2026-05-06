import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

function loadEnv(filePath, remap) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      const targetKey = remap?.[key] || key;
      if (!process.env[targetKey]) process.env[targetKey] = val;
    }
  } catch {}
}

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

loadEnv(`${ROOT}/.env`);
loadEnv(`${homedir()}/.hubspot-mcp/credentials.env`, {
  HUBSPOT_ACCESS_TOKEN: 'HUBSPOT_TOKEN',
});
