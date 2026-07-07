import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CityAutocomplete } from '../components/CityAutocomplete';
import { useDictionaries } from '../context/DictionariesContext';
import type { BitrixLocationSyncResponse } from '../types/dictionaries';

type Services = {
  portHandling: boolean;
  storage: boolean;
  reeferConnection: boolean;
  containerRent: boolean;
};

type CalculationLine = {
  stage: string;
  name: string;
  cost: number;
  currency: string;
  sortOrder?: number;
};

type CalculateResponse = {
  totalCost: number;
  margin: number;
  clientPrice: number;
  currency: string;
  lines: CalculationLine[];
  warnings?: string[];
};

type SavedCalculation = {
  id: string;
  dealId: string | null;
  counterpartyId: string | null;
  counterpartyType: string | null;
  counterpartyName: string | null;
  routeType: string | null;
  origin: string;
  destination: string;
  totalCost: string;
  margin: string;
  clientPrice: string;
  currency: string;
  status: string;
  createdAt: string;
};

type TimelineCommentResponse = {
  success: boolean;
  portalDomain: string;
  dealId: string;
};

type CounterpartyResponse = {
  dealId: string;
  type: 'company' | 'contact' | 'unknown';
  id: string | null;
  name: string | null;
};

type FormState = {
  dealId: string;
  portalDomain: string;
  routeType: string;
  origin: string;
  destination: string;
  transportType: string;
  containerType: string;
  containerStatus: string;
  weightKg: number;
  volumeM3: number;
  currency: string;
  marginType: string;
  marginValue: number;
  services: Services;
};

function formatMoney(value: number | string, currency: string) {
  return `${Number(value).toFixed(2)} ${currency}`;
}

export function DealCalculatorPage() {
  const { apiBaseUrl, dictionaries, bootstrapError, refreshBootstrap } = useDictionaries();
  const pageRef = useRef<HTMLElement | null>(null);
  const [searchParams] = useSearchParams();
  const initialDealId = searchParams.get('dealId') ?? '';
  const initialDomain = searchParams.get('portal') ?? searchParams.get('domain') ?? '';

  const initialFormState = useMemo<FormState>(
    () => ({
      dealId: initialDealId,
      portalDomain: initialDomain,
      routeType: 'KLD_OUT',
      origin: '',
      destination: '',
      transportType: 'AUTO',
      containerType: '40REF',
      containerStatus: 'LOADED',
      weightKg: 1000,
      volumeM3: 10,
      currency: 'EUR',
      marginType: 'percent',
      marginValue: 20,
      services: {
        portHandling: true,
        storage: false,
        reeferConnection: true,
        containerRent: true
      }
    }),
    [initialDealId, initialDomain]
  );

  const [result, setResult] = useState<CalculateResponse | null>(null);
  const [history, setHistory] = useState<SavedCalculation[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [lastPayload, setLastPayload] = useState<FormState>(initialFormState);
  const [calculatedAt, setCalculatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [writingTimeline, setWritingTimeline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timelineMessage, setTimelineMessage] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<BitrixLocationSyncResponse | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncingLocations, setSyncingLocations] = useState(false);
  const [counterparty, setCounterparty] = useState<CounterpartyResponse | null>(null);
  const [counterpartyError, setCounterpartyError] = useState<string | null>(null);
  const [counterpartyLoading, setCounterpartyLoading] = useState(false);

  useEffect(() => {
    function sendResize() {
      const root = document.documentElement;
      const body = document.body;
      const pageHeight = pageRef.current?.scrollHeight ?? 0;
      const height = Math.max(
        root?.scrollHeight ?? 0,
        root?.offsetHeight ?? 0,
        body?.scrollHeight ?? 0,
        body?.offsetHeight ?? 0,
        pageHeight,
        window.innerHeight
      );

      window.parent?.postMessage(
        {
          type: 'tariffcalc:resize',
          height
        },
        '*'
      );
    }

    const delayed = [0, 100, 300, 1000, 2000].map((delay) => window.setTimeout(sendResize, delay));
    const handleResize = () => sendResize();
    const handleChange = () => sendResize();

    window.addEventListener('resize', handleResize);
    document.addEventListener('input', handleChange, true);
    document.addEventListener('change', handleChange, true);

    const observerTarget = pageRef.current ?? document.body;
    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(sendResize);
    });
    observer.observe(observerTarget, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });

    return () => {
      for (const timeoutId of delayed) {
        window.clearTimeout(timeoutId);
      }
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('input', handleChange, true);
      document.removeEventListener('change', handleChange, true);
    };
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const root = document.documentElement;
      const body = document.body;
      const height = Math.max(
        root?.scrollHeight ?? 0,
        root?.offsetHeight ?? 0,
        body?.scrollHeight ?? 0,
        body?.offsetHeight ?? 0,
        pageRef.current?.scrollHeight ?? 0,
        window.innerHeight
      );

      window.parent?.postMessage(
        {
          type: 'tariffcalc:resize',
          height
        },
        '*'
      );
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [
    dictionaries.locations.length,
    bootstrapError,
    result,
    history.length,
    error,
    timelineMessage,
    syncResult,
    syncError,
    syncingLocations,
    counterparty,
    counterpartyError,
    counterpartyLoading,
    loading,
    saving,
    writingTimeline
  ]);

  useEffect(() => {
    void loadHistory(initialDealId);
  }, [initialDealId]);

  useEffect(() => {
    if (!initialDealId.trim()) {
      setCounterparty(null);
      setCounterpartyError(null);
      return;
    }

    void loadCounterparty(initialDealId, initialDomain);
  }, [initialDealId, initialDomain]);

  async function loadHistory(dealId: string) {
    const byDeal = dealId.trim();
    const url = byDeal
      ? `${apiBaseUrl}/calculations/by-deal/${encodeURIComponent(byDeal)}`
      : `${apiBaseUrl}/calculations/recent`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`History HTTP ${response.status}`);
    }

    const data = (await response.json()) as SavedCalculation[];
    setHistory(data);
  }

  async function loadCounterparty(dealId: string, portalDomain: string) {
    setCounterpartyLoading(true);
    setCounterpartyError(null);

    try {
      const search = new URLSearchParams();
      if (portalDomain.trim()) {
        search.set('portalDomain', portalDomain.trim());
      }

      const query = search.toString();
      const response = await fetch(
        `${apiBaseUrl}/bitrix/deals/${encodeURIComponent(dealId)}/counterparty${query ? `?${query}` : ''}`
      );

      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const payload = (await response.json()) as { message?: string | string[] };
          if (Array.isArray(payload.message)) {
            message = payload.message.join('; ');
          } else if (typeof payload.message === 'string' && payload.message.trim()) {
            message = payload.message;
          }
        } catch {
          // ignore non-json response body
        }
        throw new Error(message);
      }

      const data = (await response.json()) as CounterpartyResponse;
      setCounterparty(data);
    } catch (loadError) {
      setCounterparty(null);
      setCounterpartyError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setCounterpartyLoading(false);
    }
  }

  function readBoolean(formData: FormData, field: string) {
    return formData.get(field) === 'on';
  }

  function validate(state: FormState) {
    if (!state.origin.trim()) {
      return 'Поле "Откуда" обязательно.';
    }
    if (!state.destination.trim()) {
      return 'Поле "Куда" обязательно.';
    }
    if (state.weightKg <= 0) {
      return 'Вес должен быть больше 0.';
    }
    if (state.volumeM3 < 0) {
      return 'Объем не может быть меньше 0.';
    }
    if (!state.currency) {
      return 'Валюта обязательна.';
    }
    if (state.marginValue < 0) {
      return 'Значение маржи не может быть меньше 0.';
    }

    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSavedId(null);
    setTimelineMessage(null);

    const formData = new FormData(event.currentTarget);
    const state: FormState = {
      dealId: String(formData.get('dealId') ?? ''),
      portalDomain: String(formData.get('portalDomain') ?? ''),
      routeType: String(formData.get('routeType') ?? 'KLD_OUT'),
      origin: String(formData.get('origin') ?? ''),
      destination: String(formData.get('destination') ?? ''),
      transportType: String(formData.get('transportType') ?? 'AUTO'),
      containerType: String(formData.get('containerType') ?? '40REF'),
      containerStatus: String(formData.get('containerStatus') ?? 'LOADED'),
      weightKg: Number(formData.get('weightKg') ?? 0),
      volumeM3: Number(formData.get('volumeM3') ?? 0),
      currency: String(formData.get('currency') ?? 'EUR'),
      marginType: String(formData.get('marginType') ?? 'percent'),
      marginValue: Number(formData.get('marginValue') ?? 0),
      services: {
        portHandling: readBoolean(formData, 'portHandling'),
        storage: readBoolean(formData, 'storage'),
        reeferConnection: readBoolean(formData, 'reeferConnection'),
        containerRent: readBoolean(formData, 'containerRent')
      }
    };

    const validationError = validate(state);
    if (validationError) {
      setError(validationError);
      setLoading(false);
      return;
    }

    setLastPayload(state);

    try {
      const response = await fetch(`${apiBaseUrl}/calculator/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as CalculateResponse;
      setResult(data);
      setCalculatedAt(new Date().toISOString());
      await loadHistory(state.dealId);
    } catch (submitError) {
      setResult(null);
      setCalculatedAt(null);
      setError(
        `Ошибка расчета: ${submitError instanceof Error ? submitError.message : String(submitError)}`
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveCalculation() {
    if (!result) {
      return;
    }

    setSaving(true);
    setError(null);
    setSavedId(null);
    setTimelineMessage(null);

    try {
      const response = await fetch(`${apiBaseUrl}/calculations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portalDomain: lastPayload.portalDomain || undefined,
          dealId: lastPayload.dealId || undefined,
          counterpartyId: counterparty?.id || undefined,
          counterpartyType:
            counterparty && counterparty.type !== 'unknown' ? counterparty.type : undefined,
          counterpartyName: counterparty?.name || undefined,
          routeType: lastPayload.routeType,
          origin: lastPayload.origin,
          destination: lastPayload.destination,
          weightKg: lastPayload.weightKg,
          volumeM3: lastPayload.volumeM3,
          transportType: lastPayload.transportType,
          containerType: lastPayload.containerType,
          containerStatus: lastPayload.containerStatus,
          currency: lastPayload.currency,
          marginType: lastPayload.marginType,
          marginValue: lastPayload.marginValue,
          services: lastPayload.services,
          totalCost: result.totalCost,
          margin: result.margin,
          clientPrice: result.clientPrice,
          lines: result.lines,
          warnings: result.warnings ?? []
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const saved = (await response.json()) as SavedCalculation;
      setSavedId(saved.id);
      await loadHistory(lastPayload.dealId);
    } catch (saveError) {
      setError(
        `Ошибка сохранения: ${saveError instanceof Error ? saveError.message : String(saveError)}`
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncLocationsFromBitrix() {
    setSyncingLocations(true);
    setSyncError(null);
    setSyncResult(null);

    try {
      const response = await fetch(`${apiBaseUrl}/dictionaries/locations/sync/bitrix`, {
        method: 'POST'
      });

      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const payload = (await response.json()) as { message?: string | string[] };
          if (Array.isArray(payload.message)) {
            message = payload.message.join('; ');
          } else if (typeof payload.message === 'string' && payload.message.trim()) {
            message = payload.message;
          }
        } catch {
          // ignore non-json response
        }
        throw new Error(message);
      }

      const data = (await response.json()) as BitrixLocationSyncResponse;
      setSyncResult(data);
      await refreshBootstrap();
    } catch (syncLocationsError) {
      setSyncError(
        syncLocationsError instanceof Error ? syncLocationsError.message : String(syncLocationsError)
      );
    } finally {
      setSyncingLocations(false);
    }
  }

  async function handleWriteToBitrixDeal() {
    if (!result || !lastPayload.dealId.trim()) {
      return;
    }

    setWritingTimeline(true);
    setError(null);
    setTimelineMessage(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/bitrix/deals/${encodeURIComponent(lastPayload.dealId.trim())}/timeline-comment`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            portalDomain: lastPayload.portalDomain || undefined,
            route: `${lastPayload.origin} -> ${lastPayload.destination}`,
            cargoType: `${lastPayload.containerType} / ${lastPayload.containerStatus}`,
            weightKg: lastPayload.weightKg,
            volumeM3: lastPayload.volumeM3,
            selectedTariff: `${lastPayload.routeType} / ${lastPayload.transportType}`,
            finalPrice: result.clientPrice,
            currency: result.currency,
            calculationDateTime: calculatedAt ?? undefined
          })
        }
      );

      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const payload = (await response.json()) as { message?: string | string[] };
          if (Array.isArray(payload.message)) {
            message = payload.message.join('; ');
          } else if (typeof payload.message === 'string' && payload.message.trim()) {
            message = payload.message;
          }
        } catch {
          // ignore non-json error body
        }
        throw new Error(message);
      }

      await (response.json() as Promise<TimelineCommentResponse>);
      setTimelineMessage('Расчет записан в сделку Bitrix24');
    } catch (timelineError) {
      setError(
        `Ошибка записи в сделку: ${timelineError instanceof Error ? timelineError.message : String(timelineError)}`
      );
    } finally {
      setWritingTimeline(false);
    }
  }

  return (
    <main ref={pageRef} className="page">
      <section className="shell">
        <header className="page-header">
          <h1>Калькулятор перевозки</h1>
        </header>

        <section className="card compact-card">
          <div className="counterparty-panel">
            <span className="counterparty-label">Контрагент</span>
            <div className="counterparty-value">
              {counterpartyLoading && <span>Загрузка...</span>}
              {!counterpartyLoading && counterparty?.name && <b>{counterparty.name}</b>}
              {!counterpartyLoading && !counterparty?.name && !counterpartyError && <span>Не указан</span>}
              {!counterpartyLoading && counterpartyError && <span>Контрагент не загружен</span>}
            </div>
            {!counterpartyLoading && counterparty?.type && counterparty.type !== 'unknown' && (
              <span className="counterparty-meta">
                {counterparty.type === 'company' ? 'Компания' : 'Контакт'}
                {counterparty.id ? ` #${counterparty.id}` : ''}
              </span>
            )}
          </div>
        </section>

        <form className="grid" onSubmit={handleSubmit}>
          <section className="card">
            <h2>Параметры маршрута</h2>
            <div className="fields two-cols">
              <label>
                Тип маршрута
                <select name="routeType" defaultValue={initialFormState.routeType}>
                  {dictionaries.routeTypes.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Тип транспорта
                <select name="transportType" defaultValue={initialFormState.transportType}>
                  {dictionaries.transportTypes.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </label>
              <CityAutocomplete
                label="Откуда"
                name="origin"
                metadataPrefix="origin"
                defaultValue={initialFormState.origin}
                required
              />
              <CityAutocomplete
                label="Куда"
                name="destination"
                metadataPrefix="destination"
                defaultValue={initialFormState.destination}
                required
              />
              <label>
                ID сделки
                <input name="dealId" defaultValue={initialFormState.dealId} />
              </label>
              <label>
                Домен портала
                <input
                  name="portalDomain"
                  defaultValue={initialFormState.portalDomain}
                  placeholder="example.bitrix24.ru"
                />
              </label>
            </div>
          </section>

          <section className="card">
            <h2>Груз</h2>
            <div className="fields two-cols">
              <label>
                Тип контейнера
                <select name="containerType" defaultValue={initialFormState.containerType}>
                  {dictionaries.containerTypes.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Статус контейнера
                <select name="containerStatus" defaultValue={initialFormState.containerStatus}>
                  {dictionaries.containerStatuses.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Вес, кг
                <input
                  name="weightKg"
                  type="number"
                  min="0.001"
                  step="0.001"
                  defaultValue={initialFormState.weightKg}
                  required
                />
              </label>
              <label>
                Объем, м3
                <input
                  name="volumeM3"
                  type="number"
                  min="0"
                  step="0.001"
                  defaultValue={initialFormState.volumeM3}
                  required
                />
              </label>
              <label>
                Валюта
                <select name="currency" defaultValue={initialFormState.currency}>
                  {dictionaries.currencies.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Маржа - тип
                <select name="marginType" defaultValue={initialFormState.marginType}>
                  {dictionaries.marginTypes.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Маржа - значение
                <input
                  name="marginValue"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={initialFormState.marginValue}
                  required
                />
              </label>
            </div>
          </section>

          <section className="card">
            <h2>Дополнительные услуги</h2>
            <div className="checkboxes">
              <label>
                <input
                  name="portHandling"
                  type="checkbox"
                  defaultChecked={initialFormState.services.portHandling}
                />{' '}
                ПРР
              </label>
              <label>
                <input
                  name="storage"
                  type="checkbox"
                  defaultChecked={initialFormState.services.storage}
                />{' '}
                хранение
              </label>
              <label>
                <input
                  name="reeferConnection"
                  type="checkbox"
                  defaultChecked={initialFormState.services.reeferConnection}
                />{' '}
                реф-подключение
              </label>
              <label>
                <input
                  name="containerRent"
                  type="checkbox"
                  defaultChecked={initialFormState.services.containerRent}
                />{' '}
                аренда контейнера
              </label>
            </div>
          </section>

          <div className="actions">
            <button type="submit" disabled={loading}>
              {loading ? 'Расчет...' : 'Рассчитать'}
            </button>
          </div>
        </form>

        {error && <p className="error">{error}</p>}
        {savedId && <p className="success">Расчет сохранен. ID: {savedId}</p>}
        {timelineMessage && <p className="success">{timelineMessage}</p>}
        {bootstrapError && <p className="muted">Bootstrap словарей недоступен: {bootstrapError}</p>}

        <section className="card">
          <div className="section-head">
            <h2>Справочник локаций</h2>
            <button
              type="button"
              onClick={handleSyncLocationsFromBitrix}
              disabled={syncingLocations}
            >
              {syncingLocations ? 'Синхронизация...' : 'Синхронизировать из Bitrix24'}
            </button>
          </div>
          <p className="muted">
            Активных локаций: <b>{dictionaries.locations.length}</b>
          </p>
          {syncError && <p className="error">{syncError}</p>}
          {syncResult && (
            <div className="sync-result">
              <p className="success">
                Создано: <b>{syncResult.created}</b>, обновлено: <b>{syncResult.updated}</b>,
                пропущено: <b>{syncResult.skipped}</b>
              </p>
              {syncResult.warnings.map((warning) => (
                <p key={warning} className="warning">
                  {warning}
                </p>
              ))}
            </div>
          )}
        </section>

        <section className="card highlight">
          <h2>Результат расчета</h2>
          {!result && <p>Выполните расчет, чтобы увидеть результат.</p>}
          {result && (
            <>
              <div className="result-metrics">
                <p>
                  Себестоимость: <b>{formatMoney(result.totalCost, result.currency)}</b>
                </p>
                <p>
                  Маржа: <b>{formatMoney(result.margin, result.currency)}</b>
                </p>
                <p>
                  Цена клиенту: <b>{formatMoney(result.clientPrice, result.currency)}</b>
                </p>
                <p>
                  Валюта: <b>{result.currency}</b>
                </p>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Этап</th>
                    <th>Строка расчета</th>
                    <th>Стоимость</th>
                  </tr>
                </thead>
                <tbody>
                  {result.lines.map((line, idx) => (
                    <tr key={`${line.stage}-${idx}`}>
                      <td>{line.stage}</td>
                      <td>{line.name}</td>
                      <td>{formatMoney(line.cost, line.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {(result.warnings ?? []).map((warning) => (
                <p key={warning} className="warning">
                  {warning}
                </p>
              ))}

              <div className="actions result-actions">
                <button type="button" onClick={handleSaveCalculation} disabled={saving}>
                  {saving ? 'Сохранение...' : 'Сохранить расчет'}
                </button>
                <button
                  type="button"
                  onClick={handleWriteToBitrixDeal}
                  disabled={writingTimeline || !result || !lastPayload.dealId.trim()}
                >
                  {writingTimeline ? 'Запись...' : 'Записать расчет в сделку'}
                </button>
              </div>
            </>
          )}
        </section>

        <section className="card">
          <h2>История расчетов</h2>
          {history.length === 0 && <p>Пока нет сохраненных расчетов.</p>}
          {history.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Маршрут</th>
                  <th>Контрагент</th>
                  <th>Себестоимость</th>
                  <th>Цена клиенту</th>
                  <th>Маржа</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id}>
                    <td>{new Date(item.createdAt).toLocaleString()}</td>
                    <td>
                      {item.routeType || '-'}: {item.origin} -&gt; {item.destination}
                    </td>
                    <td>{item.counterpartyName || 'Не указан'}</td>
                    <td>{formatMoney(item.totalCost, item.currency)}</td>
                    <td>{formatMoney(item.clientPrice, item.currency)}</td>
                    <td>{formatMoney(item.margin, item.currency)}</td>
                    <td>{item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </section>
    </main>
  );
}
