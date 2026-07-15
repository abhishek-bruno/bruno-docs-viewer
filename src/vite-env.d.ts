/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Override the docs renderer JS URL (e.g. a locally-served oc-docs build). */
  readonly VITE_RENDERER_JS_URL?: string;
  /** Override the docs renderer CSS URL. */
  readonly VITE_RENDERER_CSS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
