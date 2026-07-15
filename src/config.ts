// Base URL for the @opencollection/docs renderer bundle, loaded at runtime.
const CDN_BASE = 'https://staging.cdn.usebruno.com';

// The docs renderer JS + CSS, loaded at runtime (not bundled). Defaults to the
// CDN. In local dev, point these at a locally-served oc-docs standalone build
// via VITE_RENDERER_JS_URL / VITE_RENDERER_CSS_URL (see README "Local renderer").
export const RENDERER_JS_URL = import.meta.env.VITE_RENDERER_JS_URL || `${CDN_BASE}/docs/index.js`;
export const RENDERER_CSS_URL = import.meta.env.VITE_RENDERER_CSS_URL || `${CDN_BASE}/docs/index.css`;

export const LOGO_URL = 'https://raw.githubusercontent.com/usebruno/mintlify-docs/main/logo/light.png';
