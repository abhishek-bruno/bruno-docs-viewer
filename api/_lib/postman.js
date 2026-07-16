const UA = 'Mozilla/5.0 (compatible; bruno-docs-viewer)';
const UID_RE = /[0-9]{5,}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const fetchText = async (url, ua = UA) => {
  const res = await fetch(url, { headers: { 'User-Agent': ua, Accept: 'text/html,application/json' } });
  if (!res.ok) {
    const err = new Error(`Postman request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.text();
};

const fetchJson = async (url) => JSON.parse(await fetchText(url));

const postJson = async (url, body) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = new Error(`Postman request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
};

export const assertPostmanHost = (url) => {
  let host;
  try { host = new URL(url).hostname; } catch { throw new Error('Invalid Postman URL.'); }
  if (!/(^|\.)postman\.com$/i.test(host)) throw new Error('Only postman.com URLs are supported.');
};

// Pull { urlId, profileSlug } from a postman.com entity URL shaped like
// /<profileSlug>/<workspace>/<entityType>/<urlId>/<name>.
const parseShortRef = (url, entityType) => {
  const segs = new URL(url).pathname.split('/').filter(Boolean);
  const i = segs.indexOf(entityType);
  return { urlId: i !== -1 ? segs[i + 1] || '' : '', profileSlug: segs[0] || '' };
};

// Resolve a Postman public short id (e.g. y28pjg6) to its full uid via the
// anonymous urlId service. One deterministic call; the primary resolution path.
const resolveEntityIdViaUrlId = async ({ urlId, entityType, profileSlug }) => {
  const qs = new URLSearchParams({ urlId, entityType });
  if (profileSlug) qs.set('profileSlug', profileSlug);
  const body = await postJson('https://www.postman.com/_api/ws/proxy', {
    service: 'urlId',
    method: 'GET',
    path: `/entity/entity-id?${qs.toString()}`
  });
  return (body && body.data && body.data.entityId) || null;
};

export const resolveCollectionUid = async (collectionUrl) => {
  const url = String(collectionUrl || '').trim();
  if (!url) throw new Error('A Postman collection URL is required.');
  assertPostmanHost(url);

  // Full uid already in the path.
  const direct = url.match(new RegExp(`/collection/(${UID_RE.source})`, 'i'));
  if (direct) return direct[1];

  // Short id (e.g. y28pjg6) -> full uid via the urlId service.
  const { urlId, profileSlug } = parseShortRef(url, 'collection');
  if (urlId) {
    const id = await resolveEntityIdViaUrlId({ urlId, entityType: 'collection', profileSlug });
    if (id) return id;
  }
  throw new Error('Could not resolve the Postman collection from that URL.');
};

export const resolveEnvironmentUid = async (environmentUrl) => {
  const url = String(environmentUrl || '').trim();
  const match = url.match(new RegExp(`/environment/(${UID_RE.source})`, 'i')) || url.match(UID_RE);
  if (match) return match[1] || match[0];

  // Short id -> full uid via the urlId service.
  assertPostmanHost(url);
  const { urlId, profileSlug } = parseShortRef(url, 'environment');
  if (urlId) {
    const id = await resolveEntityIdViaUrlId({ urlId, entityType: 'environment', profileSlug });
    if (id) return id;
  }
  throw new Error(`Could not find an environment id in: ${url}`);
};

export const fetchCollection = async (uid) => {
  const body = await fetchJson(`https://www.postman.com/_api/collection/${encodeURIComponent(uid)}?populate=true`);
  const data = body && body.data ? body.data : body;
  if (!data || !data.name) throw new Error('Postman returned an unexpected collection shape.');
  return data;
};

export const fetchEnvironment = async (uid) => {
  const body = await fetchJson(`https://www.postman.com/_api/environment/${encodeURIComponent(uid)}`);
  const find = (o) => {
    if (o && typeof o === 'object') {
      if (Array.isArray(o.values) && (o.name || o.id)) return o;
      for (const v of Object.values(o)) {
        const r = find(v);
        if (r) return r;
      }
    }
    return null;
  };
  const env = find(body);
  if (!env) throw new Error('Postman returned an unexpected environment shape.');
  return env;
};

// { handle, slug } from a workspace URL like /<handle>/<slug>[/overview|/…].
// Supports the /<handle>/workspace/<slug> variant too.
export const parseWorkspaceRef = (url) => {
  const segs = new URL(url).pathname.split('/').filter(Boolean);
  if (segs[1] === 'workspace' && segs[2]) return { handle: segs[0], slug: segs[2] };
  return { handle: segs[0] || '', slug: segs[1] || '' };
};

// handle + slug -> { id, name } via the (non-gated) ws/proxy workspaces service.
export const resolveWorkspace = async (handle, slug) => {
  const body = await postJson('https://www.postman.com/_api/ws/proxy', {
    service: 'workspaces',
    method: 'GET',
    path: `/workspaces?handle=${encodeURIComponent(handle)}&slug=${encodeURIComponent(slug)}`
  });
  const ws = body && Array.isArray(body.data) && body.data[0];
  if (!ws || !ws.id) throw new Error('Could not find that Postman workspace.');
  return { id: ws.id, name: ws.name || 'Postman Workspace' };
};

// Public collection uids in a workspace, via the (non-gated) publishing service.
export const listWorkspaceCollectionUids = async (workspaceId, limit = 50) => {
  const body = await postJson('https://www.postman.com/_api/ws/proxy', {
    service: 'publishing',
    method: 'get',
    path: `/v1/api/networkentity/collection?workspaceId=${encodeURIComponent(workspaceId)}&sortBy=forkCount&order=desc&limit=${limit}`
  });
  const rows = (body && Array.isArray(body.data) && body.data) || [];
  return rows.map((r) => r && r.entityId).filter(Boolean);
};

// Light get-by-id (populate=false) for a collection's display name. Null if unreadable.
export const fetchCollectionName = async (uid) => {
  try {
    const body = await fetchJson(`https://www.postman.com/_api/collection/${encodeURIComponent(uid)}?populate=false`);
    const data = (body && body.data) || body || {};
    const c = data.collection || {};
    return (c.info && c.info.name) || data.name || c.name || null;
  } catch {
    return null;
  }
};
