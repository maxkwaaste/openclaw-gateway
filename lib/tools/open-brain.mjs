const OPEN_BRAIN_URL = process.env.OPEN_BRAIN_URL || 'http://localhost:9876';

export async function searchOpenBrain(query, limit = 5) {
  try {
    const res = await fetch(`${OPEN_BRAIN_URL}/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    return data.results || data;
  } catch (err) {
    console.error('searchOpenBrain failed:', err.message);
    return [];
  }
}

export async function captureThought(content, metadata = {}) {
  try {
    const res = await fetch(`${OPEN_BRAIN_URL}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, source: 'openclaw-gateway', metadata }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('captureThought failed:', err.message);
    return null;
  }
}
