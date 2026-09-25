import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getBitrixPlacementDealId, getBitrixPlacementDomain } from '../utils/bitrixAuth';
import { sendResizeToBitrix } from '../utils/bitrixResize';
import { ContainerModeSwitch } from '../features/calculator/components/ContainerModeSwitch';
import { CalculatorForm } from '../features/calculator/components/CalculatorForm';
import { CommercialRatePanel } from '../features/calculator/components/CommercialRatePanel';
import { AdditionalServices, CalculationBreakdown, CalculationExplanation, RouteStages } from '../features/calculator/components/ResultPanels';
import { validateCalculatorForm } from '../features/calculator/utils';
import { findExact, loadCargo, loadLocations } from '../features/calculator/directoryData';
import type { CalculationQuote, CalculatorCategory, CalculatorFormState } from '../features/calculator/types';

type Counterparty = { name?: string | null };
const initialForm: CalculatorFormState = { origin: '', originLocationId: null, destination: '', destinationLocationId: null, container: '', containerId: null, cargo: '', cargoId: null, weightKg: '', owner: 'COC', identification: false, genset: false, dangerous: false, paymentDelay: '0' };

export function DealCalculatorPage() {
  const { apiFetch } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [category, setCategory] = useState<CalculatorCategory>('DRY');
  const [form, setForm] = useState<CalculatorFormState>(initialForm);
  const [errors, setErrors] = useState<Partial<Record<keyof CalculatorFormState, string>>>({});
  const [calculationError, setCalculationError] = useState('');
  const [quote, setQuote] = useState<CalculationQuote | null>(null);
  const [saleRate, setSaleRate] = useState('');
  const [counterparty, setCounterparty] = useState<Counterparty | null>(null);
  const savedCalculationRef = useRef<string | null>(null);
  const calculationVersionRef = useRef(0);
  const saleRateRecalcRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dealId = searchParams.get('dealId') ?? '';
  const portalDomain = searchParams.get('portal') ?? searchParams.get('domain') ?? getBitrixPlacementDomain() ?? '';
  const today = useMemo(() => new Intl.DateTimeFormat('ru-RU').format(new Date()), []);

  useEffect(() => {
    if (dealId) return;
    void getBitrixPlacementDealId().then((placementDealId) => {
      if (!placementDealId || searchParams.get('dealId')) return;
      const next = new URLSearchParams(searchParams);
      next.set('dealId', placementDealId);
      setSearchParams(next, { replace: true });
    }).catch(() => undefined);
  }, [dealId, searchParams, setSearchParams]);

  useEffect(() => {
    if (!dealId) return;
    const query = portalDomain ? `?portalDomain=${encodeURIComponent(portalDomain)}` : '';
    void apiFetch(`/bitrix/deals/${encodeURIComponent(dealId)}/counterparty${query}`).then(async (response) => {
      if (!response.ok) {
        const safeMessage = await response.clone().json().then((body: unknown) => body && typeof body === 'object' && 'message' in body && typeof body.message === 'string' ? body.message : response.statusText).catch(() => response.statusText);
        console.warn(`[counterparty] HTTP ${response.status} for deal ${dealId}: ${safeMessage || 'request failed'}`);
        return;
      }
      const data = await response.json() as Counterparty;
      if (!data.name) console.warn(`[counterparty] Bitrix returned no name for deal ${dealId}`);
      setCounterparty(data);
    }).catch((error) => console.warn('[counterparty] request failed', error instanceof Error ? error.message : 'unknown error'));
  }, [apiFetch, dealId, portalDomain]);

  useEffect(() => {
    if (!dealId) return;
    const query = portalDomain ? `?portalDomain=${encodeURIComponent(portalDomain)}` : '';
    void apiFetch(`/bitrix/deals/${encodeURIComponent(dealId)}/prefill${query}`).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as { origin?: string; destination?: string; cargoName?: string };
      const origin = data.origin?.trim() || '';
      const destination = data.destination?.trim() || '';
      const cargo = data.cargoName?.trim() || '';
      const [locations, cargoItems] = await Promise.all([loadLocations(apiFetch), loadCargo(apiFetch)]);
      const originItem = origin ? findExact(locations, origin, ['city', 'label']) : null;
      const destinationItem = destination ? findExact(locations, destination, ['city', 'label']) : null;
      const cargoItem = cargo ? findExact(cargoItems, cargo, ['name', 'etsng', 'label']) : null;
      setForm((current) => ({
        ...current,
        origin: current.origin || origin,
        originLocationId: current.originLocationId || originItem?.id || null,
        destination: current.destination || destination,
        destinationLocationId: current.destinationLocationId || destinationItem?.id || null,
        cargo: current.cargo || cargo,
        cargoId: current.cargoId || cargoItem?.id || null
      }));
    }).catch(() => undefined);
  }, [apiFetch, dealId, portalDomain]);

  useEffect(() => { sendResizeToBitrix(); }, [quote, category, form, saleRate]);

  function updateForm(patch: Partial<CalculatorFormState>) { setForm((current) => ({ ...current, ...patch })); setQuote(null); setCalculationError(''); savedCalculationRef.current = null; setErrors((current) => { const next = { ...current }; Object.keys(patch).forEach((key) => { delete next[key as keyof CalculatorFormState]; }); return next; }); }
  function changeCategory(next: CalculatorCategory) { setCategory(next); setQuote(null); setSaleRate(''); setErrors({}); setForm((current) => ({ ...current, container: '', containerId: null, genset: next === 'REF' ? current.genset : false })); }
  async function requestQuote(nextSaleRate: string) {
    const response = await apiFetch('/calculator/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, originLocationId: form.originLocationId, destinationLocationId: form.destinationLocationId, containerId: Number(form.containerId), cargoId: form.cargoId ? Number(form.cargoId) : null, weightKg: Number(form.weightKg.replace(/\s/g, '')), owner: form.owner, services: { identification: form.identification, genset: form.genset, dangerous: form.dangerous }, paymentDelayDays: Number(form.paymentDelay), saleRate: nextSaleRate ? Number(nextSaleRate) : null }) });
    if (!response.ok) { const data = await response.json().catch(() => null) as { message?: string } | null; throw new Error(data?.message || `Не удалось рассчитать маршрут (HTTP ${response.status})`); }
    calculationVersionRef.current += 1;
    setQuote(await response.json() as CalculationQuote);
    savedCalculationRef.current = null;
  }
  async function calculate() {
    const nextErrors = validateCalculatorForm(form); setErrors(nextErrors); setCalculationError('');
    if (Object.keys(nextErrors).length || !form.originLocationId || !form.destinationLocationId || !form.containerId || !form.weightKg) return;
    try {
      await requestQuote(saleRate);
    } catch (error) {
      setCalculationError(error instanceof Error ? error.message : 'Не удалось рассчитать маршрут');
    }
  }
  function changeSaleRate(nextValue: string) {
    setSaleRate(nextValue);
    if (!quote || !form.originLocationId || !form.destinationLocationId || !form.containerId || !form.weightKg) return;
    if (saleRateRecalcRef.current) clearTimeout(saleRateRecalcRef.current);
    saleRateRecalcRef.current = setTimeout(() => { void requestQuote(nextValue).catch((error) => setCalculationError(error instanceof Error ? error.message : 'Не удалось пересчитать коммерческую ставку')); }, 300);
  }
  async function saveCurrentCalculation() {
    if (!quote || !form.originLocationId || !form.destinationLocationId) return;
    const fingerprint = `${calculationVersionRef.current}:${category}:${form.originLocationId}:${form.destinationLocationId}:${form.containerId}:${form.cargoId}:${form.weightKg}:${form.owner}:${form.paymentDelay}:${form.identification}:${form.genset}:${form.dangerous}`;
    if (savedCalculationRef.current === fingerprint) return;
    const weightKg = Number(form.weightKg.replace(/\s/g, ''));
    if (!Number.isFinite(weightKg)) return;
    const parseAmount = (value: string) => Number(value.replace(/[^\d,.-]/g, '').replace(/\s/g, '').replace(',', '.')) || 0;
    savedCalculationRef.current = fingerprint;
    const response = await apiFetch('/calculations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      dealId: dealId || undefined,
      portalDomain: portalDomain || undefined,
      counterpartyName: counterparty?.name || undefined,
      routeType: 'KLD_OUT', origin: form.origin, destination: form.destination, weightKg, volumeM3: 0,
      transportType: 'MULTIMODAL', containerType: form.container || undefined, containerStatus: 'LOADED', currency: 'RUB',
      marginType: 'fixed', marginValue: 0, totalCost: quote.baseDoorToDoor ?? 0, margin: 0, clientPrice: quote.baseDoorToDoor ?? 0,
      lines: quote.routeStages.map((stage) => ({ stage: stage.mode, name: stage.title, cost: parseAmount(stage.amount), currency: 'RUB', sortOrder: stage.number })),
      services: { identification: form.identification, genset: form.genset, dangerous: form.dangerous, paymentDelay: Number(form.paymentDelay) > 0 }
    }) });
    if (!response.ok) savedCalculationRef.current = null;
  }
  function newCalculation() { void saveCurrentCalculation().catch(() => { savedCalculationRef.current = null; }); setForm(initialForm); setCategory('DRY'); setQuote(null); setCalculationError(''); setSaleRate(''); setErrors({}); }

  return <main className="calculator-page"><div className="calculator-shell">
    <header className="calculator-page-header"><div><h1>Расчёт тарифа</h1><p className="client-line">Клиент: <strong>{counterparty?.name || 'Не указан'}</strong></p></div><div className="header-actions"><button className="new-calculation" type="button" onClick={newCalculation}>Новый расчёт</button><span className="date-badge">Дата расчёта: {today}</span></div></header>
    <section className="calculator-card"><ContainerModeSwitch category={category} onChange={changeCategory} /><CalculatorForm category={category} form={form} errors={errors} onChange={updateForm} onSubmit={() => void calculate()} />{calculationError && <p className="calculator-error">{calculationError}</p>}</section>
    {quote && <><CommercialRatePanel quote={quote} saleRate={saleRate} onSaleRateChange={changeSaleRate} /><div className="result-grid"><div><RouteStages quote={quote} /><AdditionalServices quote={quote} /><CalculationExplanation quote={quote} /></div><CalculationBreakdown quote={quote} /></div></>}
  </div></main>;
}
