// Ambient types for @usebruno/converters, which ships no declarations. Only the
// functions the viewer calls client-side are declared; the internal Bruno and
// OpenCollection shapes are opaque here (we hand them straight to the renderer).
declare module '@usebruno/converters' {
  /** OpenAPI 3.x / Swagger 2.0 spec (string or parsed) -> Bruno collection. */
  export const openApiToBruno: (spec: string | object, options?: Record<string, unknown>) => unknown;
  /** Bruno collection -> OpenCollection document. */
  export const brunoToOpenCollection: (collection: unknown) => unknown;
}
