const KB_URL = process.env.KB_URL || 'https://kb.proxuma.com';
const KB_TOKEN = process.env.KB_TOKEN;

async function kbFetch(path) {
  if (!KB_TOKEN) throw new Error('KB_TOKEN not configured');

  const res = await fetch(`${KB_URL}${path}`, {
    headers: { Authorization: `Bearer ${KB_TOKEN}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KB API ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

export async function listTopics() {
  try {
    const resp = await kbFetch('/api/topics');
    const topics = (resp.data || resp).map(t => ({ title: t.title, slug: t.slug }));
    return { success: true, topics };
  } catch (err) {
    console.error('listTopics failed:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getTopicArticles(slug) {
  try {
    const resp = await kbFetch(`/api/topics/${encodeURIComponent(slug)}`);
    const topic = resp.data || resp;
    const articles = (topic.articles || []).map(a => ({
      title: a.title,
      slug: a.slug,
      description: (a.description || '').slice(0, 200),
    }));
    return { success: true, topic: topic.title, articles };
  } catch (err) {
    console.error('getTopicArticles failed:', err.message);
    return { success: false, error: err.message };
  }
}

export async function readArticle(slug) {
  try {
    const resp = await kbFetch(`/api/articles/${encodeURIComponent(slug)}`);
    const article = resp.data || resp;
    return {
      success: true,
      title: article.title,
      slug: article.slug,
      description: article.description,
    };
  } catch (err) {
    console.error('readArticle failed:', err.message);
    return { success: false, error: err.message };
  }
}

export async function searchKB(query) {
  try {
    const topicsResp = await kbFetch('/api/topics');
    const topics = topicsResp.data || topicsResp;
    const q = query.toLowerCase();
    const results = [];

    for (const topic of topics) {
      const topicResp = await kbFetch(`/api/topics/${encodeURIComponent(topic.slug)}`);
      const full = topicResp.data || topicResp;
      for (const article of full.articles || []) {
        const title = (article.title || '').toLowerCase();
        const desc = (article.description || '').toLowerCase();
        if (title.includes(q) || desc.includes(q)) {
          results.push({ title: article.title, slug: article.slug, topic: topic.title });
        }
      }
    }

    return { success: true, results };
  } catch (err) {
    console.error('searchKB failed:', err.message);
    return { success: false, error: err.message };
  }
}
