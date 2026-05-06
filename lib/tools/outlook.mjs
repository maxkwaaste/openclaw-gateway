const GRAPH_API = 'https://graph.microsoft.com/v1.0';

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry - 60_000) {
    return cachedToken;
  }

  const { MS365_CLIENT_ID, MS365_CLIENT_SECRET, MS365_REFRESH_TOKEN } = process.env;
  if (!MS365_CLIENT_ID || !MS365_REFRESH_TOKEN) {
    throw new Error('MS365 OAuth credentials not configured');
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

async function graphGet(path) {
  const token = await getAccessToken();
  const res = await fetch(`${GRAPH_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function formatMessage(m) {
  return {
    id: m.id,
    subject: m.subject,
    from: m.from?.emailAddress?.address,
    received: m.receivedDateTime,
    preview: m.bodyPreview,
  };
}

export async function searchInbox(query, top = 10) {
  try {
    const data = await graphGet(
      `/me/messages?$search="${encodeURIComponent(query)}"&$top=${top}&$select=id,subject,from,receivedDateTime,bodyPreview`
    );
    return { success: true, messages: (data.value || []).map(formatMessage) };
  } catch (err) {
    console.error('searchInbox failed:', err.message);
    return { success: false, error: err.message };
  }
}

export async function searchSent(query, top = 10) {
  try {
    const data = await graphGet(
      `/me/mailFolders/sentitems/messages?$search="${encodeURIComponent(query)}"&$top=${top}&$select=id,subject,from,receivedDateTime,bodyPreview`
    );
    return { success: true, messages: (data.value || []).map(formatMessage) };
  } catch (err) {
    console.error('searchSent failed:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getRecent(top = 20) {
  try {
    const data = await graphGet(
      `/me/messages?$top=${top}&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,bodyPreview`
    );
    return { success: true, messages: (data.value || []).map(formatMessage) };
  } catch (err) {
    console.error('getRecent failed:', err.message);
    return { success: false, error: err.message };
  }
}

export async function readEmail(messageId) {
  try {
    const m = await graphGet(
      `/me/messages/${messageId}?$select=id,subject,body,from,toRecipients,receivedDateTime`
    );
    return {
      success: true,
      id: m.id,
      subject: m.subject,
      from: m.from?.emailAddress?.address,
      to: (m.toRecipients || []).map(r => r.emailAddress?.address),
      received: m.receivedDateTime,
      body: m.body?.content,
    };
  } catch (err) {
    console.error('readEmail failed:', err.message);
    return { success: false, error: err.message };
  }
}
