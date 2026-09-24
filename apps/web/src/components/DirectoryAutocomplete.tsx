import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useAuth } from '../context/AuthContext';

type DirectoryItem = { id: string; label: string };
type Props = {
  label: string;
  value: string;
  selectedId: string | null;
  endpoint: string;
  placeholder: string;
  required?: boolean;
  error?: string;
  onChange: (text: string, id: string | null) => void;
};

export function DirectoryAutocomplete({ label, value, selectedId, endpoint, placeholder, required, error, onChange }: Props) {
  const { apiFetch } = useAuth();
  const [items, setItems] = useState<DirectoryItem[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!value) {
      setOpen(false);
      setHighlight(-1);
    }
  }, [value]);

  useEffect(() => {
    const id = ++requestRef.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setLoadError(false);
      const query = value.trim() ? `?search=${encodeURIComponent(value.trim())}&limit=7` : '?limit=7';
      void (async () => {
        try {
          const response = await apiFetch(`${endpoint}${query}`);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json() as { items?: DirectoryItem[] };
          if (id !== requestRef.current) return;
          const nextItems = (data.items ?? []).slice(0, 7);
          setItems(nextItems);
          setHighlight(nextItems.length ? 0 : -1);
        } catch {
          if (id !== requestRef.current) return;
          setItems([]);
          setLoadError(true);
        } finally {
          if (id === requestRef.current) setLoading(false);
        }
      })();
    }, value.trim() ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [apiFetch, endpoint, value]);

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function choose(item: DirectoryItem) { onChange(item.label, item.id); setOpen(false); setHighlight(-1); }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') { setOpen(false); setHighlight(-1); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setHighlight((current) => items.length ? (current + 1) % items.length : -1); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setHighlight((current) => items.length ? (current <= 0 ? items.length - 1 : current - 1) : -1); }
    if (event.key === 'Enter' && open && highlight >= 0 && items[highlight]) { event.preventDefault(); choose(items[highlight]); }
  }

  return <label className="directory-autocomplete-label">{label}{required && <span className="required">*</span>}
    <div className="directory-autocomplete" ref={rootRef}>
      <input value={value} required={required} aria-invalid={Boolean(error || (value && !selectedId))} placeholder={placeholder} autoComplete="off" onFocus={() => setOpen(true)} onKeyDown={onKeyDown} onChange={(event) => onChange(event.target.value, null)} />
      {open && <div className="directory-autocomplete-dropdown" role="listbox">
        {loading && <div className="directory-autocomplete-state">Поиск...</div>}
        {!loading && !loadError && items.map((item, index) => <button type="button" role="option" aria-selected={index === highlight} className={index === highlight ? 'is-active' : ''} key={item.id} onMouseDown={(event) => { event.preventDefault(); choose(item); }}>{item.label}</button>)}
        {!loading && loadError && <div className="directory-autocomplete-state is-error">Не удалось загрузить справочник</div>}
        {!loading && !loadError && items.length === 0 && <div className="directory-autocomplete-state">Ничего не найдено</div>}
      </div>}
    </div>
    {error && <span className="calculator-error">{error}</span>}
  </label>;
}
