import { importPostman } from './_lib/import-core.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).send('Use GET.');

  const collectionUrl = (req.query.pm ?? '') + '';
  const pe = req.query.pe;
  const environmentUrls = Array.isArray(pe) ? pe : pe ? [pe] : [];

  try {
    const { opencollection } = await importPostman({ collectionUrl, environmentUrls });
    res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).send(opencollection);
  } catch (err) {
    const status = err && err.status ? err.status : 400;
    return res.status(status).send((err && err.message) || 'Import failed.');
  }
}
