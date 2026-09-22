import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

type Calculation = { id: string; origin: string; destination: string; clientPrice: string; currency: string; createdAt: string; tariffSnapshot?: { tariff?: string } | null };

export function HistoryPage() {
  const { apiFetch } = useAuth();
  const [items, setItems] = useState<Calculation[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void (async () => { try { const response = await apiFetch('/calculations/recent'); if (!response.ok) throw new Error(`HTTP ${response.status}`); setItems(await response.json() as Calculation[]); } catch (reason) { setError(String(reason)); } })(); }, [apiFetch]);
  return <main className="page"><section className="shell shell-compact"><h1>История расчётов</h1>{error && <p className="error">Не удалось загрузить историю: {error}</p>}<section className="card"><table><thead><tr><th>Маршрут</th><th>Цена клиенту</th><th>Тариф</th><th>Дата</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.origin} → {item.destination}</td><td>{item.clientPrice} {item.currency}</td><td>{item.tariffSnapshot?.tariff ?? 'Временная формула'}</td><td>{new Date(item.createdAt).toLocaleString()}</td></tr>)}{items.length === 0 && <tr><td colSpan={4}>Сохранённых расчётов нет.</td></tr>}</tbody></table></section></section></main>;
}
