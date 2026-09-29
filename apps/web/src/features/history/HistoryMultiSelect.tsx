import { useEffect, useMemo, useRef, useState } from 'react';

export type MultiSelectOption = { value: string; label: string; searchText?: string };

type Props = {
  label: string;
  placeholder: string;
  options: MultiSelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  searchable?: boolean;
};

export function HistoryMultiSelect({ label, placeholder, options, values, onChange, searchable = false }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [open]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? options.filter((option) => `${option.label} ${option.searchText ?? ''}`.toLowerCase().includes(query)) : options;
  }, [options, search]);
  const caption = values.length === 0 ? placeholder : values.length === 1 ? options.find((option) => option.value === values[0])?.label ?? values[0] : `Выбрано: ${values.length}`;
  function toggle(value: string) { onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]); }
  return <div className="history-multiselect" ref={rootRef}>
    <span className="history-filter-label">{label}</span>
    <button type="button" className={`history-multiselect-trigger ${open ? 'is-open' : ''}`} onClick={() => setOpen((current) => !current)} aria-expanded={open}>{caption}<span>⌄</span></button>
    {open && <div className="history-multiselect-menu">
      {searchable && <input autoFocus className="history-multiselect-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск" />}
      <div className="history-multiselect-options">{filtered.map((option) => <label key={option.value}><input type="checkbox" checked={values.includes(option.value)} onChange={() => toggle(option.value)} /><span>{option.label}</span></label>)}</div>
      <div className="history-multiselect-actions"><button type="button" onClick={() => onChange([])}>Очистить</button><button type="button" onClick={() => setOpen(false)}>Готово</button></div>
    </div>}
  </div>;
}
