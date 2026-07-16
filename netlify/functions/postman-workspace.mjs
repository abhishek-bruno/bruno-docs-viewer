import { listPostmanWorkspace } from '../../api/lib/import-core.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const json = (obj, status) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET') return json({ ok: false, error: 'Use GET.' }, 405);

  const workspaceUrl = new URL(req.url).searchParams.get('url') || '';
  try {
    const result = await listPostmanWorkspace(workspaceUrl);
    return json({ ok: true, ...result }, 200);
  } catch (err) {
    const status = err && err.status ? err.status : 400;
    return json({ ok: false, error: (err && err.message) || 'Failed to list the workspace.' }, status);
  }
};
