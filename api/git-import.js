import { importGitRepo } from './_lib/git-core.js';

const readBody = async (req) => {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST.' });

  try {
    const result = await importGitRepo(await readBody(req));
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    const status = err && err.status ? err.status : 400;
    return res.status(status).json({ ok: false, error: (err && err.message) || 'Import failed.' });
  }
}
