const V21_SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

const mapHeaders = (r) => {
  if (Array.isArray(r.headerData)) {
    return r.headerData.map((h) => ({ key: h.key, value: h.value, disabled: h.enabled === false }));
  }
  if (typeof r.headers === 'string' && r.headers.trim()) {
    return r.headers
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const i = line.indexOf(':');
        if (i === -1) return null;
        return { key: line.slice(0, i).trim(), value: line.slice(i + 1).trim() };
      })
      .filter(Boolean);
  }
  return [];
};

const mapBody = (r) => {
  switch (r.dataMode) {
    case 'raw':
      return { mode: 'raw', raw: r.rawModeData || '', options: { raw: { language: (r.dataOptions && r.dataOptions.raw && r.dataOptions.raw.language) || 'json' } } };
    case 'urlencoded':
      return { mode: 'urlencoded', urlencoded: (r.data || []).map((x) => ({ key: x.key, value: x.value, disabled: x.enabled === false })) };
    case 'params':
    case 'formdata':
      return {
        mode: 'formdata',
        formdata: (r.data || []).map((x) => ({ key: x.key, value: x.type === 'file' ? undefined : x.value, src: x.type === 'file' ? x.value : undefined, type: x.type === 'file' ? 'file' : 'text', disabled: x.enabled === false }))
      };
    default:
      return undefined;
  }
};

const mapEvents = (r) => {
  const ev = [];
  if (r.preRequestScript) ev.push({ listen: 'prerequest', script: { exec: String(r.preRequestScript).split('\n') } });
  if (r.tests) ev.push({ listen: 'test', script: { exec: String(r.tests).split('\n') } });
  return ev;
};

const mapRequest = (r) => {
  const request = { method: r.method || 'GET', header: mapHeaders(r), url: r.url || '' };
  const body = mapBody(r);
  if (body) request.body = body;
  if (r.auth && r.auth.type && r.auth.type !== 'noauth') request.auth = r.auth;
  if (r.description) request.description = r.description;

  const item = { name: r.name || 'Request', request };
  const ev = mapEvents(r);
  if (ev.length) item.event = ev;
  return item;
};

export const internalCollectionToV21 = (data) => {
  const fById = Object.fromEntries((data.folders || []).map((f) => [f.id, f]));
  const rById = Object.fromEntries((data.requests || []).map((r) => [r.id, r]));

  const buildItems = (folderIds, reqIds) => {
    const items = [];
    for (const fid of folderIds || []) {
      const f = fById[fid];
      if (!f) continue;
      const folderItem = { name: f.name, item: buildItems(f.folders_order, f.order) };
      if (f.description) folderItem.description = f.description;
      if (f.auth && f.auth.type && f.auth.type !== 'noauth') folderItem.auth = f.auth;
      items.push(folderItem);
    }
    for (const rid of reqIds || []) {
      const r = rById[rid];
      if (r) items.push(mapRequest(r));
    }
    return items;
  };

  const collection = {
    info: { _postman_id: data.id, name: data.name || 'Imported Collection', schema: V21_SCHEMA },
    item: buildItems(data.folders_order, data.order),
    variable: (data.variables || []).map((v) => ({ key: v.key, value: v.value, disabled: v.enabled === false }))
  };
  if (data.description) collection.info.description = data.description;
  if (data.auth && data.auth.type && data.auth.type !== 'noauth') collection.auth = data.auth;
  return collection;
};

export const internalEnvironmentToPostman = (env) => ({
  id: env.id,
  name: env.name || 'Environment',
  values: (env.values || []).map((v) => ({
    key: v.key,
    value: v.value,
    enabled: v.enabled !== false,
    type: v.type === 'secret' ? 'secret' : 'default'
  }))
});
