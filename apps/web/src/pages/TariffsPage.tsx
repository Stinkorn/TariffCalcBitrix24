import { useEffect, useState } from 'react';
import { useDictionaries } from '../context/DictionariesContext';

type Tariff = {
  id: string; name: string; code: string; active: boolean; currency: string; description: string | null;
  tariffType: { code: string; name: string };
  rows?: TariffRow[];
};
type TariffRow = {
  id: string; minDistance: string | null; maxDistance: string | null; minWeight: string | null;
  maxWeight: string | null; price: string; currency: string; unit: string; description: string | null; priority: number;
};
type RowForm = { minDistance: string; maxDistance: string; minWeight: string; maxWeight: string; price: string; description: string; };
const emptyRow: RowForm = { minDistance: '', maxDistance: '', minWeight: '', maxWeight: '', price: '', description: '' };
function nullableNumber(value: string) { return value.trim() === '' ? undefined : Number(value); }

export function TariffsPage() {
  const { apiBaseUrl } = useDictionaries();
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [selected, setSelected] = useState<Tariff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowForm, setRowForm] = useState<RowForm>(emptyRow);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);

  async function loadTariffs(selectId?: string) {
    setLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/tariffs`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as Tariff[];
      setTariffs(data);
      const targetId = selectId ?? selected?.id;
      if (targetId) await loadTariff(targetId);
      else if (data[0]) await loadTariff(data[0].id);
      else setSelected(null);
      setError(null);
    } catch (requestError) { setError(`Не удалось загрузить тарифы: ${String(requestError)}`); }
    finally { setLoading(false); }
  }

  async function loadTariff(id: string) {
    const response = await fetch(`${apiBaseUrl}/tariffs/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    setSelected(await response.json() as Tariff);
  }

  useEffect(() => { void loadTariffs(); }, []);

  async function createTariff() {
    const name = window.prompt('Название тарифа');
    if (!name?.trim()) return;
    const code = window.prompt('Код тарифа, например AUTO_MSK');
    if (!code?.trim()) return;
    try {
      const response = await fetch(`${apiBaseUrl}/tariffs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, code, typeCode: 'AUTO_DISTANCE_WEIGHT', currency: 'RUB' }) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const tariff = await response.json() as Tariff;
      await loadTariffs(tariff.id);
    } catch (requestError) { setError(`Не удалось создать тариф: ${String(requestError)}`); }
  }

  async function saveRow() {
    if (!selected || !rowForm.price.trim()) { setError('Укажите цену строки тарифа.'); return; }
    const body = { minDistance: nullableNumber(rowForm.minDistance), maxDistance: nullableNumber(rowForm.maxDistance), minWeight: nullableNumber(rowForm.minWeight), maxWeight: nullableNumber(rowForm.maxWeight), price: Number(rowForm.price), description: rowForm.description || undefined, currency: selected.currency, stageType: 'AUTO', unit: 'KM', priority: editingRowId ? undefined : (selected.rows?.length ?? 0) + 1 };
    const url = editingRowId ? `${apiBaseUrl}/tariffs/rows/${editingRowId}` : `${apiBaseUrl}/tariffs/${selected.id}/rows`;
    try {
      const response = await fetch(url, { method: editingRowId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setRowForm(emptyRow); setEditingRowId(null); await loadTariff(selected.id); await loadTariffs(selected.id);
    } catch (requestError) { setError(`Не удалось сохранить строку: ${String(requestError)}`); }
  }

  function startEdit(row: TariffRow) {
    setEditingRowId(row.id);
    setRowForm({ minDistance: row.minDistance ?? '', maxDistance: row.maxDistance ?? '', minWeight: row.minWeight ?? '', maxWeight: row.maxWeight ?? '', price: row.price, description: row.description ?? '' });
  }

  async function deleteRow(rowId: string) {
    if (!selected || !window.confirm('Удалить строку тарифа?')) return;
    try {
      const response = await fetch(`${apiBaseUrl}/tariffs/rows/${rowId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await loadTariff(selected.id); await loadTariffs(selected.id);
    } catch (requestError) { setError(`Не удалось удалить строку: ${String(requestError)}`); }
  }

  return <main className="page"><section className="shell shell-compact">
    <div className="section-head"><div><h1>Тарифы</h1><p className="muted">MVP-справочник тарифов и ставок.</p></div><button onClick={createTariff}>+ Создать тариф</button></div>
    {error && <p className="error">{error}</p>}
    <section className="card"><table><thead><tr><th>Название</th><th>Тип</th><th>Валюта</th><th>Статус</th></tr></thead><tbody>
      {tariffs.map((tariff) => <tr key={tariff.id} className={selected?.id === tariff.id ? 'is-selected' : ''} onClick={() => void loadTariff(tariff.id)}><td>{tariff.name}</td><td>{tariff.tariffType.name}</td><td>{tariff.currency}</td><td>{tariff.active ? 'Активен' : 'Отключен'}</td></tr>)}
      {!loading && tariffs.length === 0 && <tr><td colSpan={4}>Тарифов пока нет.</td></tr>}
    </tbody></table></section>
    {selected && <section className="card tariff-editor"><div className="section-head"><div><h2>{selected.name}</h2><p className="muted">{selected.code} · {selected.tariffType.code} · {selected.currency}</p></div></div>
      <div className="tariff-row-form"><label>От км<input type="number" value={rowForm.minDistance} onChange={(event) => setRowForm({ ...rowForm, minDistance: event.target.value })} /></label><label>До км<input type="number" value={rowForm.maxDistance} onChange={(event) => setRowForm({ ...rowForm, maxDistance: event.target.value })} /></label><label>Мин. вес, кг<input type="number" value={rowForm.minWeight} onChange={(event) => setRowForm({ ...rowForm, minWeight: event.target.value })} /></label><label>Макс. вес, кг<input type="number" value={rowForm.maxWeight} onChange={(event) => setRowForm({ ...rowForm, maxWeight: event.target.value })} /></label><label>Цена<input type="number" min="0" value={rowForm.price} onChange={(event) => setRowForm({ ...rowForm, price: event.target.value })} /></label><label>Описание<input value={rowForm.description} onChange={(event) => setRowForm({ ...rowForm, description: event.target.value })} /></label></div>
      <div className="actions"><button className="secondary-button" onClick={() => { setRowForm(emptyRow); setEditingRowId(null); }}>Очистить</button><button onClick={saveRow}>{editingRowId ? 'Сохранить строку' : 'Добавить строку'}</button></div>
      <table><thead><tr><th>От км</th><th>До км</th><th>Мин. вес</th><th>Макс. вес</th><th>Цена</th><th>Единица</th><th></th></tr></thead><tbody>{selected.rows?.map((row) => <tr key={row.id}><td>{row.minDistance ?? '—'}</td><td>{row.maxDistance ?? '—'}</td><td>{row.minWeight ?? '—'}</td><td>{row.maxWeight ?? '—'}</td><td>{row.price} {row.currency}</td><td>{row.unit}</td><td className="table-actions"><button className="secondary-button" onClick={() => startEdit(row)}>Изменить</button><button className="danger-button" onClick={() => void deleteRow(row.id)}>Удалить</button></td></tr>)}</tbody></table>
    </section>}
  </section></main>;
}
