import { LOGO_URL } from '../config';
import type { GitCollectionRef } from '../git/gitImport';

/** Monorepo collection chooser: lists collections, each a shareable link. */
export function CollectionPicker({
  collections,
  hrefFor
}: {
  collections: GitCollectionRef[];
  hrefFor: (c: GitCollectionRef) => string;
}) {
  return (
    <div className="home">
      <div className="home-columns">
        <div className="home-shell">
          <header className="home-hero">
            <img className="state-logo" src={LOGO_URL} alt="Bruno" />
            <h1>Choose a collection</h1>
            <p className="home-lead">This repository contains several Bruno collections.</p>
          </header>
          <section className="home-history">
            <ul className="home-recent-list">
              {collections.map((c) => {
                const go = () => window.location.assign(hrefFor(c));
                return (
                  <li
                    key={c.path || '.'}
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
                      <span className="home-recent-subtitle">{c.path || '(repository root)'}</span>
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
