import { useEffect, useRef, useState } from 'react';
import { getRequestIdFromHash, hasAnySource, buildFetchDeeplinkUrl, type SourcePointers } from '../sources/sourceParams';
import { loadRendererAssets, waitForRenderer } from './rendererAssets';

type Phase = 'loading' | 'ready' | 'error';

/**
 * Mounts the CDN docs renderer into a container node. The renderer bundle is
 * downloaded lazily, so a spinner overlay stays up until it has mounted.
 */
export function DocsRenderer({ text, source }: { text: string; source: SourcePointers }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const [phase, setPhase] = useState<Phase>('loading');

  useEffect(() => {
    // The renderer has no unmount API and the node persists for the page's
    // life, so mount exactly once.
    if (started.current) return;
    started.current = true;
    (async () => {
      await loadRendererAssets();
      const Renderer = await waitForRenderer();
      if (!containerRef.current) return;
      new Renderer({
        target: containerRef.current,
        opencollection: text,
        gitCollectionUrl: source.gitUrl || undefined,
        // Let the renderer show "Open in Bruno" in its header for any shareable
        // source (OpenAPI, gist, raw, repo). Uploads have no source, so no CTA.
        openInBrunoHref: hasAnySource(source) ? buildFetchDeeplinkUrl(source) : undefined,
        // Renderer shows a home button at the far left of its header.
        backToHomeHref: window.location.pathname || '/',
        initialRequestId: getRequestIdFromHash()
      });
      setPhase('ready');
    })().catch(() => setPhase('error'));
  }, [text, source]);

  return (
    <div className="docs-root">
      <div id="opencollection-container" ref={containerRef} />

      {phase === 'loading' && (
        <div className="state state-overlay">
          <div className="state-spinner" role="status" aria-label="Preparing docs" />
          <p className="state-loading-message">Preparing docs…</p>
          <p className="state-loading-hint">Loading the viewer. Just a moment.</p>
        </div>
      )}

      {phase === 'error' && (
        <div className="state state-overlay">
          <p className="state-loading-message">Couldn't load the viewer</p>
          <p className="state-loading-hint">The docs renderer failed to load. Check your connection and try again.</p>
          <a className="btn btn-primary" href={window.location.pathname || '/'}>
            Go to Home
          </a>
        </div>
      )}

      {/* Floating fallback: the renderer also shows a header home button when the
          CDN oc-docs bundle supports `backToHomeHref`. Kept until that ships so
          there's always a way back. */}
      <div className="viewer-actions">
        <a className="btn btn-secondary" href={window.location.pathname || '/'}>
          Back to home
        </a>
      </div>
    </div>
  );
}
