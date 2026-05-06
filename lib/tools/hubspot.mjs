const HUBSPOT_API = 'https://api.hubapi.com';
const CLOSED_STAGES = ['closedwon', 'closedlost'];

async function hubspotFetch(method, path, body) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}`,
    },
  };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(`${HUBSPOT_API}${path}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function fetchActiveDeals() {
  try {
    const data = await hubspotFetch('POST', '/crm/v3/objects/deals/search', {
      filterGroups: [{
        filters: [
          { propertyName: 'dealstage', operator: 'NOT_IN', values: CLOSED_STAGES },
        ],
      }],
      properties: ['dealname', 'dealstage', 'amount', 'pipeline', 'hs_last_activity_date', 'notes_last_updated', 'closedate', 'hubspot_owner_id'],
      sorts: [{ propertyName: 'amount', direction: 'DESCENDING' }],
      limit: 100,
    });

    return (data.results || []).map(r => ({
      id: String(r.id),
      dealname: r.properties?.dealname || 'Unknown Deal',
      dealstage: r.properties?.dealstage || '',
      amount: Number(r.properties?.amount) || 0,
      hs_last_activity_date: r.properties?.hs_last_activity_date || null,
      notes_last_updated: r.properties?.notes_last_updated || null,
      contact_ids: (r.associations?.contacts?.results || []).map(a => String(a.id)),
      company_ids: (r.associations?.companies?.results || []).map(a => String(a.id)),
    }));
  } catch (err) {
    console.error('fetchActiveDeals failed:', err.message);
    return [];
  }
}

export async function fetchContactDetails(contactIds) {
  if (!contactIds.length) return [];
  try {
    const data = await hubspotFetch('POST', '/crm/v3/objects/contacts/batch/read', {
      inputs: contactIds.slice(0, 10).map(id => ({ id })),
      properties: ['firstname', 'lastname', 'email', 'jobtitle', 'phone'],
    });

    return (data.results || []).map(r => ({
      id: String(r.id),
      firstname: r.properties?.firstname || '',
      lastname: r.properties?.lastname || '',
      email: r.properties?.email || '',
      jobtitle: r.properties?.jobtitle || '',
    }));
  } catch (err) {
    console.error('fetchContactDetails failed:', err.message);
    return [];
  }
}

export function filterStuckDeals(deals, stuckDays = 7) {
  const cutoff = new Date(Date.now() - stuckDays * 86400_000);

  return deals.filter(deal => {
    if (CLOSED_STAGES.includes(deal.dealstage)) return false;

    const lastActivity = deal.hs_last_activity_date
      ? new Date(deal.hs_last_activity_date)
      : null;
    const lastNote = deal.notes_last_updated
      ? new Date(deal.notes_last_updated)
      : null;

    const mostRecent = lastActivity && lastNote
      ? new Date(Math.max(lastActivity, lastNote))
      : lastActivity || lastNote;

    if (!mostRecent) return true;
    return mostRecent < cutoff;
  });
}

export async function searchDeals(query) {
  try {
    const data = await hubspotFetch('POST', '/crm/v3/objects/deals/search', {
      filterGroups: [{
        filters: [
          { propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: query },
        ],
      }],
      properties: ['dealname', 'dealstage', 'amount', 'pipeline'],
      limit: 20,
    });

    return (data.results || []).map(r => ({
      id: String(r.id),
      dealname: r.properties?.dealname || '',
      dealstage: r.properties?.dealstage || '',
      amount: Number(r.properties?.amount) || 0,
      pipeline: r.properties?.pipeline || '',
    }));
  } catch (err) {
    console.error('searchDeals failed:', err.message);
    return [];
  }
}

export async function getDealCount() {
  try {
    const data = await hubspotFetch('POST', '/crm/v3/objects/deals/search', {
      filterGroups: [],
      limit: 1,
    });
    return data.total;
  } catch (err) {
    console.error('getDealCount failed:', err.message);
    return 0;
  }
}

export async function searchContacts(query) {
  try {
    const data = await hubspotFetch('POST', '/crm/v3/objects/contacts/search', {
      filterGroups: [{
        filters: [
          { propertyName: 'email', operator: 'CONTAINS_TOKEN', value: query },
        ],
      }],
      properties: ['firstname', 'lastname', 'email', 'jobtitle'],
      limit: 20,
    });

    return (data.results || []).map(r => ({
      id: String(r.id),
      firstname: r.properties?.firstname || '',
      lastname: r.properties?.lastname || '',
      email: r.properties?.email || '',
      jobtitle: r.properties?.jobtitle || '',
    }));
  } catch (err) {
    console.error('searchContacts failed:', err.message);
    return [];
  }
}
