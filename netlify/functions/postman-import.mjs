import { importPostman } from '../../api/lib/import-core.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET') return new Response('Use GET.', { status: 405, headers: CORS });

  const url = new URL(req.url);
  const collectionUrl = url.searchParams.get('pm') || '';
  const environmentUrls = url.searchParams.getAll('pe');

  try {
    const { opencollection } = await importPostman({ collectionUrl, environmentUrls });
    return new Response(opencollection, {
      status: 200,
      headers: {
        'Content-Type': 'text/yaml; charset=utf-8',
        // Cache so repeated opens don't re-hit Postman.
        'Cache-Control': 'public, max-age=300',
        ...CORS
      }
    });
  } catch (err) {
    const status = err && err.status ? err.status : 400;
    return new Response((err && err.message) || 'Import failed.', { status, headers: CORS });
  }
};
