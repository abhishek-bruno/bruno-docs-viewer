const UA = 'Mozilla/5.0 (compatible; bruno-docs-viewer)';
const CRAWLER_UA = 'Googlebot/2.1 (+http://www.google.com/bot.html)';
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

const assertPostmanHost = (url) => {
  let host;
  try { host = new URL(url).hostname; } catch { throw new Error('Invalid Postman URL.'); }
  if (!/(^|\.)postman\.com$/i.test(host)) throw new Error('Only postman.com URLs are supported.');
};

const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const collectionNameOf = (body) => {
  const data = (body && body.data) || body || {};
  const c = data.collection || {};
  return (c.info && c.info.name) || data.name || c.name || '';
};

/**
 * Newer Postman pages embed the collection uid only as tree-node ids (no
 * run-collection / ?collection= marker), mixed with folder/request ids and
 * possibly several collections. Collect the uid candidates, keep the ones that
 * `_api/collection` accepts as real collections (item ids 404), and pick the one
 * whose name matches the URL's collection slug.
 */
const resolveUidFromCandidates = async (html, url) => {
  const candidates = [...new Set(html.match(new RegExp(UID_RE.source, 'gi')) || [])].slice(0, 20);
  if (!candidates.length) return null;
  const urlSlug = slugify(url.split('?')[0].split('/').filter(Boolean).pop());

  const found = (
    await Promise.all(
      candidates.map(async (uid) => {
        try {
          const name = collectionNameOf(await fetchJson(`https://www.postman.com/_api/collection/${encodeURIComponent(uid)}?populate=false`));
          return name ? { uid, slug: slugify(name) } : null;
        } catch {
          return null;
        }
      })
    )
  ).filter(Boolean);

  if (!found.length) return null;
  return (found.find((c) => c.slug === urlSlug) || found[0]).uid;
};

export const resolveCollectionUid = async (collectionUrl) => {
  const url = String(collectionUrl || '').trim();
  if (!url) throw new Error('A Postman collection URL is required.');
  assertPostmanHost(url);

  const direct = url.match(new RegExp(`/collection/(${UID_RE.source})`, 'i'));
  if (direct) return direct[1];

  // Short-id workspace URL: the uid is embedded only in the crawler-served page.
  let html;
  try {
    html = await fetchText(url, CRAWLER_UA);
  } catch {
    throw new Error('Could not open the Postman collection page. Check the link.');
  }
  // Fast path: older pages carry the uid in a run/link marker.
  const fromRun = html.match(new RegExp(`run-collection/(${UID_RE.source})`, 'i'));
  const fromParam = html.match(new RegExp(`[?&]collection=(${UID_RE.source})`, 'i'));
  const marked = (fromRun && fromRun[1]) || (fromParam && fromParam[1]);
  if (marked) return marked;

  // Newer pages: derive the uid from the embedded candidates.
  const uid = await resolveUidFromCandidates(html, url);
  if (uid) return uid;

  throw new Error('Could not find the collection id on that Postman page.');
};

export const resolveEnvironmentUid = (environmentUrl) => {
  const url = String(environmentUrl || '').trim();
  const match = url.match(new RegExp(`/environment/(${UID_RE.source})`, 'i')) || url.match(UID_RE);
  if (!match) throw new Error(`Could not find an environment id in: ${url}`);
  return match[1] || match[0];
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
