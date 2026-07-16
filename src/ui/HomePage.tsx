import { useEffect, useState } from 'react';
import { buildShareViewerUrl } from '../sources/sourceParams';
import { classifySourceUrl } from '../sources/classifySource';
import { buildLocalUploadUrl, saveLocalUpload } from '../storage/localUpload';
import { listCollections, deleteCollection, clearCollections, type StoredCollection } from '../storage/collectionStore';
import { isPostmanCollectionUrl, isPostmanUrl, isPostmanWorkspaceUrl } from '../postman/postmanImport';
import { LOGO_URL } from '../config';
import { SAMPLES } from '../samples';
import { RecentList } from './RecentList';
import { HistoryPanel } from './HistoryPanel';
import { PostmanEnvModal } from './PostmanEnvModal';

const RECENTS_SHOWN = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function HomePage() {
  const [entries, setEntries] = useState<StoredCollection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [postmanUrl, setPostmanUrl] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const pathname = window.location.pathname || '/';

  const reload = () => void listCollections().then(setEntries);
  useEffect(() => {
    reload();
  }, []);

  const submitUrl = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get('yamlUrl') || '').trim();

    // Reject a Postman link that's neither a collection nor a workspace (e.g. an
    // environment link), before generic classification.
    if (isPostmanUrl(value) && !isPostmanCollectionUrl(value) && !isPostmanWorkspaceUrl(value)) {
      setError('That is a Postman link but not a collection or workspace. Paste a collection or workspace URL.');
      return;
    }
    const intent = classifySourceUrl(value);
    if (!intent) {
      setError('Enter a valid collection URL — OpenCollection, OpenAPI, a git repo, a gist, or Postman.');
      return;
    }
    setError(null);
    if (intent.kind === 'postman') {
      setPostmanUrl(value);
      return;
    }
    if (intent.kind === 'postman-workspace') {
      // Prefix route: /<workspace-url> -> PostmanWorkspaceView (the picker).
      window.location.assign(`/${value.replace(/^https?:\/\//i, '')}`);
      return;
    }
    window.location.assign(buildShareViewerUrl(intent.source));
  };

  const onFile = (file: File | undefined, input: HTMLInputElement) => {
    if (!file) return;
    if (!/\.(ya?ml|json)$/i.test(file.name)) {
      setError('Choose a .yml, .yaml, or .json file.');
      input.value = '';
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('File is too large (max 10 MB).');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const yaml = String(reader.result || '').trim();
      if (!yaml) {
        setError('The file is empty.');
        input.value = '';
        return;
      }
      setError(null);
      try {
        const { key } = await saveLocalUpload(yaml, file.name);
        window.location.assign(buildLocalUploadUrl(key, { pathname, hash: window.location.hash }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save the file in this browser.');
        input.value = '';
      }
    };
    reader.onerror = () => {
      setError('Could not read the file.');
      input.value = '';
    };
    reader.readAsText(file);
  };

  const removeEntry = async (key: string) => {
    await deleteCollection(key);
    reload();
  };

  const clearAll = async () => {
    await clearCollections();
    reload();
  };

  const recents = (entries ?? []).slice(0, RECENTS_SHOWN);
  const total = entries?.length ?? 0;
  const hasHistory = total > 0;
  const loaded = entries !== null;
  const historyOpen = showHistory && hasHistory;
  // Only offer "View all" once there's more than a page of recents to reveal.
  const showViewAll = total > RECENTS_SHOWN || historyOpen;

  return (
    <div className={`home${hasHistory ? ' home--with-history' : ''}${historyOpen ? ' home--history-open' : ''}`}>
      <div className="home-columns">
        <div className="home-shell">
          <header className="home-hero">
            <img className="state-logo" src={LOGO_URL} alt="Bruno" />
            <h1>Bruno Docs Viewer</h1>
            <p className="home-lead">Supports OpenCollection &amp; OpenAPI files, Bruno git repos, and public Postman collection or workspace links</p>
          </header>

          <section className="home-panel">
            <form className="home-form" onSubmit={submitUrl} noValidate>
              <div className="home-url-row">
                <input
                  type="url"
                  name="yamlUrl"
                  className="home-input"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="Paste an OpenCollection, OpenAPI, Bruno git repo, or Postman collection/workspace URL"
                />
                <button type="submit" className="btn btn-primary home-submit">
                  View docs
                </button>
              </div>

              <div className="home-or" aria-hidden="true">
                <span>or</span>
              </div>

              <label className="home-dropzone">
                <input
                  type="file"
                  className="home-file-input"
                  accept=".yml,.yaml,.json,application/x-yaml,text/yaml,text/x-yaml,application/json"
                  onChange={(e) => onFile(e.target.files?.[0], e.target)}
                />
                <svg
                  className="home-dropzone-icon"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                  <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
                  <path d="M12 17v-6" />
                  <path d="m9.5 13.5 2.5-2.5 2.5 2.5" />
                </svg>
                <span className="home-dropzone-text">
                  <span className="home-dropzone-title">Choose a file</span>
                  <span className="home-dropzone-hint">OpenCollection or OpenAPI, YAML or JSON, up to 10 MB</span>
                </span>
              </label>

              <p className="home-privacy">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Files stay in your browser. Nothing is uploaded to Bruno.
              </p>

              {error && <p className="home-error">{error}</p>}
            </form>
          </section>

          {hasHistory && (
            <section className="home-history">
              <div className="home-recents-header">
                <h3 className="home-recents-heading">Recents</h3>
                <div className="home-recents-actions">
                  {showViewAll && (
                    <button
                      type="button"
                      className="home-recents-link"
                      onClick={() => setShowHistory((open) => !open)}
                    >
                      {historyOpen ? 'Hide history' : `View all history (${total})`}
                    </button>
                  )}
                  <button type="button" className="home-clear-history" onClick={clearAll}>
                    Clear all
                  </button>
                </div>
              </div>
              <RecentList entries={recents} onRemove={removeEntry} />
            </section>
          )}

          {loaded && !hasHistory && (
            <section className="home-history">
              <div className="home-recents-header">
                <h3 className="home-recents-heading">Try a sample</h3>
              </div>
              <ul className="home-recent-list">
                {SAMPLES.map((sample) => {
                  const go = () => window.location.assign(sample.href(pathname));
                  return (
                    <li
                      key={sample.label}
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
                        <span className="home-recent-title">{sample.label}</span>
                        <span className="home-recent-subtitle">{sample.sublabel}</span>
                      </div>
                      <span className="home-sample-arrow" aria-hidden="true">
                        →
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        {historyOpen && (
          <HistoryPanel
            entries={entries!}
            onClose={() => setShowHistory(false)}
            onRemove={removeEntry}
            onClearAll={clearAll}
          />
        )}
      </div>

      {postmanUrl && (
        <PostmanEnvModal collectionUrl={postmanUrl} pathname={pathname} onClose={() => setPostmanUrl(null)} />
      )}
    </div>
  );
}
