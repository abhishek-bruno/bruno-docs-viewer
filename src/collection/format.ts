import yaml from 'js-yaml';

/**
 * Formats the viewer can turn into OpenCollection for the renderer. Only
 * formats with an implemented converter branch are classified; anything else
 * (including real OpenCollection) is left as 'opencollection' and passed
 * through unchanged.
 */
export type CollectionFormat = 'opencollection' | 'openapi';

/** Classify a fetched/uploaded document by inspecting its top-level shape. */
export function sniffFormat(text: string): CollectionFormat {
  let doc: unknown;
  try {
    doc = yaml.load(text);
  } catch {
    return 'opencollection';
  }
  if (doc && typeof doc === 'object') {
    const d = doc as Record<string, unknown>;
    // OpenAPI 3.x uses `openapi`, Swagger 2.0 uses `swagger`. openApiToBruno
    // handles both, so both map to the same branch.
    if (d.openapi || d.swagger) return 'openapi';
  }
  return 'opencollection';
}

/**
 * True when the text is an UNBUNDLED OpenCollection root (`bundled: false`) —
 * a collection whose requests live in sibling files, not a self-contained
 * single-file document. Such a repo must be cloned + assembled (git-import),
 * not rendered directly.
 */
export function isUnbundledOpenCollection(text: string): boolean {
  try {
    const doc = yaml.load(text) as Record<string, unknown> | null;
    return !!doc && typeof doc === 'object' && doc.bundled === false;
  } catch {
    return false;
  }
}
