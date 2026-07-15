// Base URL for the @opencollection/docs renderer bundle, loaded at runtime.
const CDN_BASE = 'https://staging.cdn.usebruno.com';

// The docs renderer JS + CSS, loaded at runtime (not bundled). Defaults to the
// CDN. In local dev, point these at a locally-served oc-docs standalone build
// via VITE_RENDERER_JS_URL / VITE_RENDERER_CSS_URL (see README "Local renderer").
export const RENDERER_JS_URL = import.meta.env.VITE_RENDERER_JS_URL || `${CDN_BASE}/docs/index.js`;
export const RENDERER_CSS_URL = import.meta.env.VITE_RENDERER_CSS_URL || `${CDN_BASE}/docs/index.css`;

// Base for the serverless API (postman-import, git-import). Empty = same origin
// (`/api/...`), which production and `netlify dev` use. For plain `npm run dev`
// (Vite only, no functions), set VITE_API_BASE_URL to a deployed instance so the
// API calls resolve, e.g. VITE_API_BASE_URL=https://bruno-docs-viewer.netlify.app
// (the functions send `Access-Control-Allow-Origin: *`, so cross-origin is fine).
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
export const apiUrl = (path: string): string => `${API_BASE_URL}${path}`;

export const LOGO_URL = 'https://raw.githubusercontent.com/usebruno/mintlify-docs/main/logo/light.png';
