import { useEffect, useRef } from 'react';
import { getRequestIdFromHash, type SourcePointers } from '../sources/sourceParams';
import { loadRendererAssets, waitForRenderer } from './rendererAssets';

/**
 * Mounts the CDN docs renderer into a container node and shows a floating
 * "Back to home" action.
 */
export function DocsRenderer({ text, source }: { text: string; source: SourcePointers }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

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
        initialRequestId: getRequestIdFromHash()
      });
    })().catch(() => {
      // Surfaced by the caller's error states; nothing to do here.
    });
  }, [text, source]);

  return (
    <>
      <div id="opencollection-container" ref={containerRef} />
      <div className="viewer-actions">
        <a className="btn btn-secondary" href={window.location.pathname || '/'}>
          Back to home
        </a>
      </div>
    </>
  );
}
