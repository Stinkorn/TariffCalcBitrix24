import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { HistoryMultiSelect, type MultiSelectOption } from '../features/history/HistoryMultiSelect';
import { generateCalculationsPdf } from '../features/calculator/pdf/calculationPdf';
import type { CalculationPdfData } from '../features/calculator/pdf/types';

type HistoryItem = { id: string; counterparty?: string | null; origin: string; destination: string; category?: string | null; container?: string | null; weightKg: number; createdAt: string; clientPrice: number; currency: string; isCurrent: boolean; requestFingerprint?: string | null; pdfAvailable: boolean; deltaPercent: number | null };
type HistoryResponse = { items: HistoryItem[]; pagination: { page: number; pageSize: number; total: number }; summary: { filteredCount: number; currentCount: number; lastIssuedAt: string | null; averageDeltaPercent: number | null } };
type HistoryPdfResponse = { items: Array<{ id: string; data: CalculationPdfData }> };
type FilterOptions = { counterparties: Array<{ id?: string; name: string; type?: string; value: string }>; containerTypes: string[]; locations: Array<{ id: string; city: string; region: string; country: string; legacyText?: string }> };
type Filters = { counterpartaries: string[]; containerTypes: string[]; origins: string[]; destinations: string[]; statuses: string[]; page: number };
const EMPTY: HistoryResponse = { items: [], pagination: { page: 1, pageSize: 20, total: 0 }, summary: { filteredCount: 0, currentCount: 0, lastIssuedAt: null, averageDeltaPercent: null } };
const EMPTY_OPTIONS: FilterOptions = { counterparties: [], containerTypes: [], locations: [] };
const money = (value: number, currency = 'RUB') => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.ceil(value))} ${currency === 'RUB' ? '₽' : currency}`;
const date = (value: string) => new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(value));
const time = (value: string) => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const deltaTone = (value: number | null) => value === null || value === 0 ? 'neutral' : value > 0 ? 'up' : 'down';
const deltaText = (value: number | null) => value === null ? '—' : `${value > 0 ? '↑ +' : value < 0 ? '↓ −' : ''}${Math.abs(value).toFixed(1).replace('.', ',')} %`;
const shortLocationLabel = (value: string) => value.split(',')[0].trim() || value;
const countLabel = (value: number) => { const mod = value % 100; const last = value % 10; if (mod >= 11 && mod <= 14) return 'расчётов'; if (last === 1) return 'расчёт'; if (last >= 2 && last <= 4) return 'расчёта'; return 'расчётов'; };

export function HistoryPage() {
  const { apiFetch, user } = useAuth();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<HistoryResponse>(EMPTY);
  const [options, setOptions] = useState<FilterOptions>(EMPTY_OPTIONS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPdfIds, setSelectedPdfIds] = useState<string[]>([]);
  const [versions, setVersions] = useState<HistoryItem[]>([]);
  const [dealCounterparty, setDealCounterparty] = useState<{ id?: string; type?: string; name?: string } | null>(null);
  const [dealLoaded, setDealLoaded] = useState(false);
  const [filters, setFilters] = useState<Filters>({ counterpartaries: [], containerTypes: [], origins: [], destinations: [], statuses: [], page: 1 });
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const dealId = searchParams.get('dealId');
  const portal = searchParams.get('portal') ?? searchParams.get('domain') ?? '';
  useEffect(() => { void apiFetch('/calculations/history/filter-options').then((response) => response.ok ? response.json() as Promise<FilterOptions> : EMPTY_OPTIONS).then(setOptions).catch(() => setOptions(EMPTY_OPTIONS)); }, [apiFetch]);
  useEffect(() => { if (!dealId || dealLoaded) return; const query = portal ? `?portalDomain=${encodeURIComponent(portal)}` : ''; void apiFetch(`/bitrix/deals/${encodeURIComponent(dealId)}/counterparty${query}`).then((response) => response.ok ? response.json() : null).then((value) => { setDealLoaded(true); if (value?.name) { setDealCounterparty(value); setFilters((current) => ({ ...current, counterpartaries: [value.id ? `id:${value.id}` : `legacy:${value.name}`,], page: 1 })); } }).catch(() => setDealLoaded(true)); }, [apiFetch, dealId, dealLoaded, portal]);
  useEffect(() => {
    const query = new URLSearchParams({ page: String(filters.page), pageSize: '20' });
    filters.counterpartaries.forEach((value) => query.append(value.startsWith('id:') ? 'counterpartyId' : 'counterpartyName', value.slice(value.indexOf(':') + 1)));
    filters.containerTypes.forEach((value) => query.append('containerType', value));
    filters.origins.forEach((value) => query.append(value.startsWith('id:') ? 'originLocationId' : 'originLegacy', value.slice(value.indexOf(':') + 1)));
    filters.destinations.forEach((value) => query.append(value.startsWith('id:') ? 'destinationLocationId' : 'destinationLegacy', value.slice(value.indexOf(':') + 1)));
    filters.statuses.forEach((value) => query.append('status', value));
    setError(''); void apiFetch(`/calculations/history?${query}`).then(async (response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json() as Promise<HistoryResponse>; }).then((next) => { setData(next); setSelectedId((current) => current && next.items.some((item) => item.id === current) ? current : next.items[0]?.id ?? null); }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Не удалось загрузить историю'));
  }, [apiFetch, filters]);
  useEffect(() => { if (!selectedId) { setVersions([]); return; } void apiFetch(`/calculations/history/${encodeURIComponent(selectedId)}/versions`).then((response) => response.ok ? response.json() : { items: [] }).then((value: { items?: HistoryItem[] }) => setVersions(value.items ?? [])).catch(() => setVersions([])); }, [apiFetch, selectedId]);
  const selected = useMemo(() => data.items.find((item) => item.id === selectedId) ?? null, [data.items, selectedId]);
  const locationOptions: MultiSelectOption[] = options.locations.map((location) => ({ value: location.id.startsWith('legacy:') ? location.id : `id:${location.id}`, label: location.legacyText ?? `${location.city}, ${location.region}, ${location.country}`, searchText: `${location.city} ${location.region} ${location.country}` }));
  const counterpartyOptions: MultiSelectOption[] = options.counterparties.map((option) => ({ value: option.value, label: option.name, searchText: option.type }));
  const containerOptions: MultiSelectOption[] = options.containerTypes.map((value) => ({ value, label: value }));
  const statusOptions: MultiSelectOption[] = [{ value: 'CURRENT', label: 'Актуальные' }, { value: 'ARCHIVED', label: 'Неактуальные' }];
  const setFilter = (key: Exclude<keyof Filters, 'page'>, values: string[]) => { setSelectedPdfIds([]); setFilters((current) => ({ ...current, [key]: values, page: 1 })); };
  function resetFilters() { setSelectedPdfIds([]); setFilters({ counterpartaries: dealCounterparty ? [dealCounterparty.id ? `id:${dealCounterparty.id}` : `legacy:${dealCounterparty.name}`] : [], containerTypes: [], origins: [], destinations: [], statuses: [], page: 1 }); }
  async function setCurrent(id: string) { setSavingId(id); try { const response = await apiFetch(`/calculations/${encodeURIComponent(id)}/set-current`, { method: 'POST' }); if (!response.ok) throw new Error('Не удалось назначить тариф актуальным'); setFilters((current) => ({ ...current })); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось назначить тариф актуальным'); } finally { setSavingId(null); } }
  const pages = Math.max(1, Math.ceil(data.pagination.total / data.pagination.pageSize));
  const route = (item: HistoryItem) => `${shortLocationLabel(item.origin)} → ${shortLocationLabel(item.destination)}`;
  const availableOnPage = data.items.filter((item) => item.pdfAvailable);
  const allPageSelected = availableOnPage.length > 0 && availableOnPage.every((item) => selectedPdfIds.includes(item.id));
  const somePageSelected = availableOnPage.some((item) => selectedPdfIds.includes(item.id));
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = somePageSelected && !allPageSelected; }, [somePageSelected, allPageSelected]);
  function togglePdf(id: string) { setSelectedPdfIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length >= 20 ? current : [...current, id]); }
  function togglePageSelection() { setSelectedPdfIds((current) => allPageSelected ? current.filter((id) => !availableOnPage.some((item) => item.id === id)) : Array.from(new Set([...current, ...availableOnPage.map((item) => item.id)])).slice(0, 20)); }
  async function downloadSelectedPdf() {
    if (selectedPdfIds.length === 0 || pdfLoading) return;
    setPdfLoading(true); setPdfError('');
    try {
      const response = await apiFetch('/calculations/history/pdf-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selectedPdfIds }) });
      if (!response.ok) throw new Error('PDF data request failed');
      const payload = await response.json() as HistoryPdfResponse;
      await generateCalculationsPdf(payload.items.map((item) => item.data));
      setSelectedPdfIds([]);
    } catch { setPdfError('Не удалось сформировать PDF выбранных тарифов.'); } finally { setPdfLoading(false); }
  }
  async function deleteCalculation(item: HistoryItem) {
    const currentNote = item.isCurrent ? '\nЭтот тариф отмечен как актуальный.' : '';
    if (!window.confirm(`Удалить расчёт?\n\n${item.counterparty || 'Контрагент не указан'}\n${route(item)}\n${money(item.clientPrice, item.currency)}${currentNote}\n\nЭто действие нельзя отменить.`)) return;
    setDeletingId(item.id); setError('');
    try {
      const response = await apiFetch(`/calculations/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Не удалось удалить расчёт');
      setSelectedPdfIds((current) => current.filter((id) => id !== item.id));
      if (selectedId === item.id) { setSelectedId(null); setVersions([]); }
      void apiFetch('/calculations/history/filter-options').then((result) => result.ok ? result.json() as Promise<FilterOptions> : null).then((next) => { if (next) setOptions(next); });
      setFilters((current) => ({ ...current, page: data.items.length === 1 && current.page > 1 ? current.page - 1 : current.page }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось удалить расчёт'); } finally { setDeletingId(null); }
  }
  const activeChip = (label: string, values: string[], key: Exclude<keyof Filters, 'page'>) => values.length ? <button type="button" className="history-filter-chip" onClick={() => setFilter(key, [])}>{label}: {values.length > 1 ? values.length : '1'} ×</button> : null;
  return <main className="history-page"><div className="history-shell">
    <header className="history-header"><div><h1>История тарифов</h1><p>База выданных коммерческих ставок с историей изменений по одинаковым запросам</p></div><div className="history-header-actions"><span className="history-count">{data.summary.filteredCount} {countLabel(data.summary.filteredCount)}</span><button type="button" onClick={resetFilters}>Сбросить фильтры</button></div></header>
    {dealCounterparty && <section className="history-deal-strip"><span>Автофильтр из сделки</span><label>Контрагент: <strong>{dealCounterparty.name}</strong></label><button type="button" onClick={() => setFilter('counterpartaries', [])}>Показать всех контрагентов</button></section>}
    {error && <p className="history-error">{error}</p>}
    <section className="history-filter-card"><div className="history-section-title"><h2>Фильтры</h2><span>Все поля работают совместно</span></div><div className="history-filters">
      <HistoryMultiSelect label="Контрагент" placeholder="Все контрагенты" options={counterpartyOptions} values={filters.counterpartaries} onChange={(values) => setFilter('counterpartaries', values)} searchable />
      <HistoryMultiSelect label="Тип контейнера" placeholder="Все типы" options={containerOptions} values={filters.containerTypes} onChange={(values) => setFilter('containerTypes', values)} />
      <HistoryMultiSelect label="Пункт отправления" placeholder="Все направления" options={locationOptions} values={filters.origins} onChange={(values) => setFilter('origins', values)} searchable />
      <HistoryMultiSelect label="Пункт прибытия" placeholder="Все направления" options={locationOptions} values={filters.destinations} onChange={(values) => setFilter('destinations', values)} searchable />
      <HistoryMultiSelect label="Статус тарифа" placeholder="Все" options={statusOptions} values={filters.statuses} onChange={(values) => setFilter('statuses', values)} />
    </div><div className="history-filter-summary"><div className="history-filter-chips">{activeChip('Контрагенты', filters.counterpartaries, 'counterpartaries')}{activeChip('Контейнеры', filters.containerTypes, 'containerTypes')}{activeChip('Отправление', filters.origins, 'origins')}{activeChip('Прибытие', filters.destinations, 'destinations')}{activeChip(filters.statuses[0] === 'CURRENT' ? 'Актуальные' : 'Неактуальные', filters.statuses, 'statuses')}</div><span>Найдено {data.summary.filteredCount} тарифов</span></div></section>
    <section className="history-metrics"><Metric label="Найдено тарифов" value={data.summary.filteredCount} hint="по текущим фильтрам" /><Metric label="Актуальных" value={data.summary.currentCount} hint="для уникальных запросов" /><Metric label="Последняя выдача" value={data.summary.lastIssuedAt ? date(data.summary.lastIssuedAt) : '—'} hint={data.summary.lastIssuedAt ? time(data.summary.lastIssuedAt) : ''} /><Metric label="Среднее изменение" value={data.summary.averageDeltaPercent === null ? '—' : `${data.summary.averageDeltaPercent.toFixed(1).replace('.', ',')} %`} tone={deltaTone(data.summary.averageDeltaPercent)} hint="по совпадающим запросам" /></section>
    <section className="history-main-card"><div className="history-section-title"><div><h2>Выданные тарифы</h2><p>Изменение рассчитывается относительно предыдущего тарифа с теми же параметрами запроса</p></div><div className="history-toolbar"><span className="history-sort">Сначала актуальные</span><button type="button" className="history-pdf-button" disabled={!selectedPdfIds.length || pdfLoading} onClick={() => void downloadSelectedPdf()}>{pdfLoading ? 'Формирование PDF…' : `Скачать PDF${selectedPdfIds.length ? ` (${selectedPdfIds.length})` : ''}`}</button>{pdfError && <span className="history-pdf-error">{pdfError}</span>}</div></div><div className="history-split"><div className="history-table-wrap"><table className="history-table"><thead><tr><th><input ref={selectAllRef} className="history-pdf-checkbox" type="checkbox" checked={allPageSelected} disabled={!availableOnPage.length} onChange={togglePageSelection} aria-label="Выбрать доступные расчёты на странице" /></th><th>Контрагент</th><th>Маршрут</th><th>Контейнер</th><th>Дата</th><th>Ставка</th><th>Изм.</th><th>Статус</th>{(user?.role === 'ADMIN' || user?.role === 'LEAD') && <th>Действия</th>}</tr></thead><tbody>{data.items.map((item) => <tr key={item.id} className={item.id === selectedId ? 'is-selected' : ''} onClick={() => setSelectedId(item.id)}><td><input className="history-pdf-checkbox" type="checkbox" checked={selectedPdfIds.includes(item.id)} disabled={!item.pdfAvailable || (!selectedPdfIds.includes(item.id) && selectedPdfIds.length >= 20)} title={!item.pdfAvailable ? 'PDF недоступен: старый расчёт не содержит полного снимка тарифа' : selectedPdfIds.length >= 20 && !selectedPdfIds.includes(item.id) ? 'Можно скачать не более 20 расчётов за один раз' : undefined} onClick={(event) => event.stopPropagation()} onChange={() => togglePdf(item.id)} aria-label={`Выбрать расчёт ${item.id}`} /></td><td><span className="history-cell-clamp">{item.counterparty || '—'}</span></td><td title={`${item.origin} → ${item.destination}`}><span className="history-cell-clamp">{route(item)}</span></td><td>{item.container || '—'}{[item.category, item.weightKg ? `${item.weightKg.toLocaleString('ru-RU')} кг` : null].filter(Boolean).length > 0 && <small>{[item.category, item.weightKg ? `${item.weightKg.toLocaleString('ru-RU')} кг` : null].filter(Boolean).join(' • ')}</small>}</td><td>{date(item.createdAt)}<small>{time(item.createdAt)}</small></td><td><strong>{money(item.clientPrice, item.currency)}</strong></td><td><span className={`history-delta ${deltaTone(item.deltaPercent)}`}>{deltaText(item.deltaPercent)}</span></td><td>{item.isCurrent ? <span className="history-status current">Актуальный</span> : <button className="history-current-button" disabled={!item.requestFingerprint || savingId === item.id} title={!item.requestFingerprint ? 'Недостаточно данных старого расчёта для определения одинакового запроса' : undefined} onClick={(event) => { event.stopPropagation(); void setCurrent(item.id); }}>{savingId === item.id ? 'Сохранение…' : 'Сделать актуальным'}</button>}</td>{(user?.role === 'ADMIN' || user?.role === 'LEAD') && <td><button type="button" className="history-delete-button" title="Удалить расчёт" aria-label="Удалить расчёт" disabled={deletingId === item.id} onClick={(event) => { event.stopPropagation(); void deleteCalculation(item); }}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5h10m-8 0v8h6V5M6 5V3h4v2m-6 0h8" /></svg></button></td>}</tr>)}</tbody></table>{data.items.length === 0 && <div className="history-empty">По выбранным фильтрам тарифы не найдены.</div>}<div className="history-pagination"><span>{data.pagination.total ? `${(filters.page - 1) * data.pagination.pageSize + 1}–${Math.min(filters.page * data.pagination.pageSize, data.pagination.total)} из ${data.pagination.total}` : '0 из 0'}</span><div><button disabled={filters.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>‹</button><span>{filters.page} / {pages}</span><button disabled={filters.page >= pages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>›</button></div></div></div>
      <aside className="history-side-panel"><h3>История одинакового запроса</h3><p>Сравниваются только записи с совпадающими ключевыми параметрами.</p>{selected ? <><div className="history-signature"><strong>{selected.counterparty || 'Контрагент не указан'}</strong><b title={`${selected.origin} → ${selected.destination}`}>{route(selected)}</b><small>{[selected.container, selected.category, selected.weightKg ? `${selected.weightKg.toLocaleString('ru-RU')} кг` : null].filter(Boolean).join(' • ')}</small></div><div className="history-current-rate"><span>Текущая ставка</span><strong>{money(selected.clientPrice, selected.currency)}</strong><span className={`history-delta ${deltaTone(selected.deltaPercent)}`}>{deltaText(selected.deltaPercent)}</span></div><div className="history-versions"><span>Версии тарифа</span>{versions.length ? versions.map((version) => <div key={version.id}><small>{date(version.createdAt)} • {time(version.createdAt)}</small><b>{money(version.clientPrice, version.currency)}</b><span className={`history-delta ${deltaTone(version.deltaPercent)}`}>{deltaText(version.deltaPercent)}</span>{version.isCurrent && <em>Актуальный</em>}</div>) : <p className="history-legacy-note">Для этого старого расчёта сравнение версий недоступно.</p>}</div><div className="history-explanation"><strong>Актуальный тариф</strong><p>Один тариф может быть отмечен актуальным для каждой уникальной комбинации параметров запроса.</p></div></> : <div className="history-empty">Выберите тариф в таблице.</div>}</aside></div></section>
  </div></main>;
}
function Metric({ label, value, hint, tone = 'neutral' }: { label: string; value: string | number; hint: string; tone?: string }) { return <article><span>{label}</span><strong className={`history-metric-value ${tone}`}>{value}</strong><small>{hint}</small></article>; }
