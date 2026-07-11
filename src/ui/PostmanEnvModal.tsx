import { useEffect, useRef, useState } from 'react';
import { buildPostmanShareUrl, isPostmanEnvironmentUrl } from '../postman/postmanImport';

/**
 * Collects optional Postman environment links, then navigates to the shareable
 * ?pm=…&pe=… URL so the import reproduces when opened or shared.
 */
export function PostmanEnvModal({
  collectionUrl,
  pathname,
  onClose
}: {
  collectionUrl: string;
  pathname: string;
  onClose: () => void;
}) {
  const [envs, setEnvs] = useState<string[]>(['']);
  const [error, setError] = useState<string | null>(null);
  const firstInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstInput.current?.focus();
  }, []);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const setEnvAt = (index: number, value: string) =>
    setEnvs((prev) => prev.map((v, i) => (i === index ? value : v)));

  const removeEnvAt = (index: number) =>
    setEnvs((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const environmentUrls = envs.map((v) => v.trim()).filter(Boolean);
    if (environmentUrls.some((u) => !isPostmanEnvironmentUrl(u))) {
      setError('Environment links must be Postman environment URLs (…/environment/…).');
      return;
    }
    window.location.assign(buildPostmanShareUrl(pathname, collectionUrl, environmentUrls));
  };

  return (
    <div className="pm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pm-dialog" role="dialog" aria-modal="true" aria-label="Import from Postman">
        <h2>Import Postman Environments</h2>
        <p className="pm-lead">Add Postman environment links to resolve your collection variables (if any).</p>

        <form onSubmit={submit}>
          <label className="pm-label">Environment links (optional)</label>
          <div>
            {envs.map((value, index) => (
              <div className="pm-env-row" key={index}>
                <input
                  ref={index === 0 ? firstInput : undefined}
                  type="url"
                  className="pm-input pm-env-input"
                  placeholder="https://www.postman.com/.../environment/<id>"
                  autoComplete="off"
                  spellCheck={false}
                  value={value}
                  onChange={(e) => setEnvAt(index, e.target.value)}
                />
                <button type="button" className="pm-env-remove" title="Remove" onClick={() => removeEnvAt(index)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="pm-add-env" onClick={() => setEnvs((prev) => [...prev, ''])}>
            + Add another environment link
          </button>

          {error && <p className="pm-error">{error}</p>}

          <div className="pm-footer">
            <button type="button" className="pm-btn pm-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="pm-btn pm-btn-primary">
              Import and view
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
