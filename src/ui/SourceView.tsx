import { useEffect, useState } from 'react';
import { decideSource, buildShareViewerUrl, type SourcePointers } from '../sources/sourceParams';
import { loadCollectionText, CollectionFetchError } from '../sources/loader';
import { resolveToOpenCollection } from '../collection/resolve';
import { isUnbundledOpenCollection } from '../collection/format';
import { runGitImport, type GitCollectionRef } from '../git/gitImport';
import { recordRecentLink, buildRecentLinkHref } from '../storage/recentLinks';
import { gitCacheKey, getCachedImport, touchCachedImport, cacheGitImport } from '../storage/importCache';
import { parseCollectionTitle } from '../storage/localUpload';
import { DocsRenderer } from './DocsRenderer';
import { CollectionPicker } from './CollectionPicker';
import { Loading, Message } from './States';

type ErrorKind = 'not-found' | 'cors' | 'unknown';
type State =
  | { status: 'loading' }
  | { status: 'error'; kind: ErrorKind }
  | { status: 'ready'; text: string }
  | { status: 'picker'; collections: GitCollectionRef[] };

export function SourceView({ source }: { source: SourcePointers }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const raw = await loadCollectionText(source);
        // A repo's opencollection.yml may be an unbundled root (bundled: false)
        // whose requests live in sibling files. Don't render it directly — divert
        // to git-import (clone + assemble the tree) via the catch below.
        if (decideSource(source) === 'repo' && isUnbundledOpenCollection(raw)) {
          throw new CollectionFetchError('not-found', 'Unbundled repo collection.');
        }
        const text = await resolveToOpenCollection(raw);
        void recordRecentLink(source, parseCollectionTitle(text));
        if (active) setState({ status: 'ready', text });
      } catch (err) {
        // A repo whose fast opencollection.yml path yields nothing is either a
        // native .bru/.yml collection (GitHub: 'not-found') or a non-GitHub repo
        // with no fast candidate ('unknown'). Both fall back to the server-side
        // git-import (clone + convert). Don't fall back on 'cors' (private repo).
        const fetchKind: ErrorKind = err instanceof CollectionFetchError ? (err.kind as ErrorKind) : 'unknown';
        const shouldGitImport =
          decideSource(source) === 'repo' && (fetchKind === 'not-found' || fetchKind === 'unknown');
        if (shouldGitImport) {
          const cacheKey = gitCacheKey(source.gitUrl, source.path);
          try {
            const cached = await getCachedImport(cacheKey);
            if (cached) {
              void touchCachedImport(cacheKey);
              if (active) setState({ status: 'ready', text: cached });
              return;
            }
            const result = await runGitImport({ gitUrl: source.gitUrl, path: source.path });
            if (!active) return;
            if (result.kind === 'list') {
              setState({ status: 'picker', collections: result.collections });
            } else {
              // The git cache row doubles as the history entry (like Postman).
              void cacheGitImport(cacheKey, {
                title: result.name,
                subtitle: source.gitUrl,
                href: buildRecentLinkHref(source),
                yaml: result.opencollection
              });
              setState({ status: 'ready', text: result.opencollection });
            }
            return;
          } catch (gitErr) {
            const kind: ErrorKind =
              gitErr instanceof Error && /not found|no bruno collection/i.test(gitErr.message) ? 'not-found' : 'unknown';
            if (active) setState({ status: 'error', kind });
            return;
          }
        }
        if (active) setState({ status: 'error', kind: fetchKind });
      }
    })();
    return () => {
      active = false;
    };
    // A source object is stable for the page's life; key on its pointers.
  }, [source.gitUrl, source.rawUrl, source.openapiUrl, source.gist, source.path]);

  if (state.status === 'loading') return <Loading message="Loading collection…" hint="Fetching the collection source." />;

  if (state.status === 'ready') {
    return <DocsRenderer text={state.text} source={source} />;
  }

  if (state.status === 'picker') {
    return (
      <CollectionPicker
        collections={state.collections}
        hrefFor={(c) =>
          buildShareViewerUrl({ gitUrl: source.gitUrl, rawUrl: '', openapiUrl: '', gist: '', path: c.path })
        }
      />
    );
  }

  const isRepoOnly = decideSource(source) === 'repo' && !source.rawUrl && !source.openapiUrl && !source.gist;
  if (state.kind === 'not-found') {
    return <Message title="Collection not found" body="This shared collection no longer exists." action={{ type: 'go-home' }} />;
  }
  if (state.kind === 'cors') {
    return (
      <Message
        title={isRepoOnly ? 'Private collection' : "Couldn't load this collection"}
        body={
          isRepoOnly
            ? "This collection is private and can't be viewed in the browser. Open it in Bruno to view and sync it."
            : 'The collection source could not be reached in the browser. You can still open it in Bruno.'
        }
        action={{ type: 'open-in-bruno', source }}
      />
    );
  }
  return <Message title="Couldn't load this collection" body="Something went wrong loading this collection." action={{ type: 'go-home' }} />;
}
