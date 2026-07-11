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
  const fromRun = html.match(new RegExp(`run-collection/(${UID_RE.source})`, 'i'));
  const fromParam = html.match(new RegExp(`[?&]collection=(${UID_RE.source})`, 'i'));
  const uid = (fromRun && fromRun[1]) || (fromParam && fromParam[1]);
  if (!uid) throw new Error('Could not find the collection id on that Postman page.');
  return uid;
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
