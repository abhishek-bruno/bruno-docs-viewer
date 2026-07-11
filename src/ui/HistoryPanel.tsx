import type { StoredCollection } from '../storage/collectionStore';
import { RecentList } from './RecentList';

/**
 * The full history as a second column on the home page. Stateless: HomePage owns
 * the entries so the recents list and this panel stay in sync.
 */
export function HistoryPanel({
  entries,
  onClose,
  onRemove,
  onClearAll
}: {
  entries: StoredCollection[];
  onClose: () => void;
  onRemove: (key: string) => void;
  onClearAll: () => void;
}) {
  return (
    <aside className="home-history-panel">
      <div className="home-recents-header">
        <h3 className="home-recents-heading">History ({entries.length})</h3>
        <div className="home-history-panel-actions">
          <button type="button" className="home-clear-history" onClick={onClearAll}>
            Clear all
          </button>
          <button type="button" className="home-history-close" onClick={onClose} aria-label="Close history">
            ✕
          </button>
        </div>
      </div>
      <RecentList entries={entries} onRemove={onRemove} />
    </aside>
  );
}
