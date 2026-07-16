import { listPostmanWorkspace } from './_lib/import-core.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Use GET.' });

  const workspaceUrl = (req.query.url ?? '') + '';
  try {
    const result = await listPostmanWorkspace(workspaceUrl);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    const status = err && err.status ? err.status : 400;
    return res.status(status).json({ ok: false, error: (err && err.message) || 'Failed to list the workspace.' });
  }
}
