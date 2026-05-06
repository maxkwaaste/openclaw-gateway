const REVIEW_API = process.env.REVIEW_API || 'http://localhost:3040';

export async function getReviewQueue() {
  try {
    const res = await fetch(`${REVIEW_API}/api/queue`);
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('getReviewQueue failed:', err.message);
    return [];
  }
}

export async function approveDraft(id) {
  try {
    const res = await fetch(`${REVIEW_API}/api/queue/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('approveDraft failed:', err.message);
    return null;
  }
}
