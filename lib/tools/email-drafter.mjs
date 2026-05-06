const GRAPH_API = 'https://graph.microsoft.com/v1.0';

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry - 60_000) {
    return cachedToken;
  }

  const { MS365_CLIENT_ID, MS365_CLIENT_SECRET, MS365_REFRESH_TOKEN } = process.env;
  if (!MS365_CLIENT_ID || !MS365_REFRESH_TOKEN) {
    throw new Error('MS365 OAuth credentials not configured (MS365_CLIENT_ID, MS365_REFRESH_TOKEN)');
  }

  const params = {
    client_id: MS365_CLIENT_ID,
    refresh_token: MS365_REFRESH_TOKEN,
    grant_type: 'refresh_token',
    scope: 'https://graph.microsoft.com/Mail.ReadWrite offline_access',
  };
  if (MS365_CLIENT_SECRET) params.client_secret = MS365_CLIENT_SECRET;

  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);

  if (data.refresh_token) {
    process.env.MS365_REFRESH_TOKEN = data.refresh_token;
  }

  return cachedToken;
}

export async function createEmailDraft(to, subject, body) {
  try {
    const token = await getAccessToken();

    const res = await fetch(`${GRAPH_API}/me/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subject,
        body: { contentType: 'HTML', content: body },
        toRecipients: [{ emailAddress: { address: to } }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Graph API ${res.status}: ${text.slice(0, 200)}`);
    }

    const draft = await res.json();
    return { success: true, id: draft.id, subject: draft.subject, to };
  } catch (err) {
    console.error('createEmailDraft failed:', err.message);
    return { success: false, error: err.message };
  }
}
