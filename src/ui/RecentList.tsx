import { formatRelativeTime } from '../storage/localUpload';
import type { StoredCollection } from '../storage/collectionStore';

const navigate = (href: string) => window.location.assign(href);

const onKeyActivate = (href: string) => (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    navigate(href);
  }
};

/** A clickable list of stored collections, with a per-item Remove button. */
export function RecentList({
  entries,
  onRemove
}: {
  entries: StoredCollection[];
  onRemove: (key: string) => void;
}) {
  return (
    <ul className="home-recent-list">
      {entries.map((entry) => (
        <li
          key={entry.key}
          className="home-recent-item"
          role="link"
          tabIndex={0}
          onClick={() => navigate(entry.href)}
          onKeyDown={onKeyActivate(entry.href)}
        >
          <div className="home-recent-meta">
            <span className="home-recent-title">{entry.title}</span>
            <span className="home-recent-subtitle">
              <span className="home-recent-url" title={entry.subtitle}>
                {entry.subtitle}
              </span>
              <span className="home-recent-time">· {formatRelativeTime(entry.lastOpenedAt)}</span>
            </span>
          </div>
          <button
            type="button"
            className="home-recent-remove"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(entry.key);
            }}
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
