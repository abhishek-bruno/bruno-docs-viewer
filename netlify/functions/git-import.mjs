import { importGitRepo } from '../../api/_lib/git-core.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const json = (obj, status) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Use POST.' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const result = await importGitRepo(body);
    return json({ ok: true, ...result }, 200);
  } catch (err) {
    const status = err && err.status ? err.status : 400;
    return json({ ok: false, error: (err && err.message) || 'Import failed.' }, status);
  }
};
