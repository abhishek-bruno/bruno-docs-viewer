import { useEffect, useState } from 'react';
import { LOGO_URL } from '../config';
import { fetchPostmanWorkspace, buildPostmanShareUrl, type PostmanWorkspaceCollection } from '../postman/postmanImport';
import { Loading, Message } from './States';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; name: string; collections: PostmanWorkspaceCollection[] };

/**
 * Postman workspace picker: lists the workspace's public collections; selecting
 * one opens it in the Postman import view (`?pm=…`).
 */
export function PostmanWorkspaceView({ workspaceUrl }: { workspaceUrl: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { name, collections } = await fetchPostmanWorkspace(workspaceUrl);
        if (!collections.length) throw new Error('This Postman workspace has no public collections.');
        if (active) setState({ status: 'ready', name, collections });
      } catch (err) {
        if (active) {
          setState({ status: 'error', message: err instanceof Error ? err.message : 'Could not open this Postman workspace.' });
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [workspaceUrl]);

  if (state.status === 'loading') {
    return <Loading message="Loading workspace…" hint="Fetching the workspace's collections." />;
  }
  if (state.status === 'error') {
    return <Message title="Couldn't open this workspace" body={state.message} action={{ type: 'go-home' }} />;
  }

  const { collections } = state;
  return (
    <div className="home">
      <div className="home-columns">
        <div className="home-shell">
          <header className="home-hero">
            <img className="state-logo" src={LOGO_URL} alt="Bruno" />
            <h1>Choose a collection</h1>
            <p className="home-lead">
              {state.name} has {collections.length} public collection{collections.length === 1 ? '' : 's'}.
            </p>
          </header>
          <section className="home-history">
            <ul className="home-recent-list">
              {collections.map((c) => {
                const href = buildPostmanShareUrl('/', c.url, []);
                const go = () => window.location.assign(href);
                return (
                  <li
                    key={c.url}
                    className="home-recent-item"
                    role="link"
                    tabIndex={0}
                    onClick={go}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        go();
                      }
                    }}
                  >
                    <div className="home-recent-meta">
                      <span className="home-recent-title">{c.name}</span>
                    </div>
                    <span className="home-sample-arrow" aria-hidden="true">
                      →
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
