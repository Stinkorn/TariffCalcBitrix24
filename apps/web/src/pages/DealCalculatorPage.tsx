import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getBitrixPlacementDealId, getBitrixPlacementDomain } from '../utils/bitrixAuth';
import { sendResizeToBitrix } from '../utils/bitrixResize';
import { ContainerModeSwitch } from '../features/calculator/components/ContainerModeSwitch';
import { CalculatorForm } from '../features/calculator/components/CalculatorForm';
import { CommercialRatePanel } from '../features/calculator/components/CommercialRatePanel';
import { AdditionalServices, CalculationBreakdown, CalculationExplanation, RouteStages } from '../features/calculator/components/ResultPanels';
import { calculatorFixtures } from '../features/calculator/fixtures/calculatorFixtures';
import { validateCalculatorForm } from '../features/calculator/utils';
import type { CalculationQuote, CalculatorCategory, CalculatorFormState } from '../features/calculator/types';

type Counterparty = { name?: string | null };
const initialForm: CalculatorFormState = { origin: '', originLocationId: null, destination: '', destinationLocationId: null, container: '', containerId: null, cargo: '', cargoId: null, weightKg: '', owner: 'COC', identification: false, genset: false, dangerous: false, paymentDelay: '0' };

export function DealCalculatorPage() {
  const { apiFetch } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [category, setCategory] = useState<CalculatorCategory>('DRY');
  const [form, setForm] = useState<CalculatorFormState>(initialForm);
  const [errors, setErrors] = useState<Partial<Record<keyof CalculatorFormState, string>>>({});
  const [quote, setQuote] = useState<CalculationQuote | null>(null);
  const [saleRate, setSaleRate] = useState('210000');
  const [counterparty, setCounterparty] = useState<Counterparty | null>(null);
  const savedCalculationRef = useRef<string | null>(null);
  const calculationVersionRef = useRef(0);
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
      if (response.ok) setCounterparty(await response.json() as Counterparty);
    }).catch(() => undefined);
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
      const [originResponse, destinationResponse, cargoResponse] = await Promise.all([
        origin ? apiFetch(`/dictionaries/locations?search=${encodeURIComponent(origin)}&limit=7`) : Promise.resolve(null),
        destination ? apiFetch(`/dictionaries/locations?search=${encodeURIComponent(destination)}&limit=7`) : Promise.resolve(null),
        cargo ? apiFetch(`/dictionaries/cargo?search=${encodeURIComponent(cargo)}`) : Promise.resolve(null)
      ]);
      type PrefillDirectoryItem = { id: string; label?: string; city?: string; name?: string; etsng?: string };
      const normalize = (value: string | undefined) => value?.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ') ?? '';
      const readExact = async (result: Response | null, value: string, fields: Array<keyof PrefillDirectoryItem>) => {
        if (!result?.ok) return null;
        const payload = await result.json() as { items?: PrefillDirectoryItem[] };
        const expected = normalize(value);
        const exact = (payload.items ?? []).filter((item) => fields.some((field) => normalize(String(item[field] ?? '')) === expected));
        return exact.length === 1 ? exact[0] : null;
      };
      const [originItem, destinationItem, cargoItem] = await Promise.all([
        readExact(originResponse, origin, ['city', 'label']),
        readExact(destinationResponse, destination, ['city', 'label']),
        readExact(cargoResponse, cargo, ['name', 'etsng', 'label'])
      ]);
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

  function updateForm(patch: Partial<CalculatorFormState>) { setForm((current) => ({ ...current, ...patch })); setQuote(null); savedCalculationRef.current = null; setErrors((current) => { const next = { ...current }; Object.keys(patch).forEach((key) => { delete next[key as keyof CalculatorFormState]; }); return next; }); }
  function changeCategory(next: CalculatorCategory) { setCategory(next); setQuote(null); setSaleRate(''); setErrors({}); setForm((current) => ({ ...current, container: '', containerId: null, genset: next === 'REF' ? current.genset : false })); }
  function calculate() { const nextErrors = validateCalculatorForm(form); setErrors(nextErrors); if (Object.keys(nextErrors).length) return; calculationVersionRef.current += 1; setQuote(calculatorFixtures[category]); savedCalculationRef.current = null; }
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
      marginType: 'fixed', marginValue: 0, totalCost: quote.baseDoorToDoor, margin: 0, clientPrice: quote.baseDoorToDoor,
      lines: quote.routeStages.map((stage) => ({ stage: stage.mode, name: stage.title, cost: parseAmount(stage.amount), currency: 'RUB', sortOrder: stage.number })),
      services: { identification: form.identification, genset: form.genset, dangerous: form.dangerous, paymentDelay: Number(form.paymentDelay) > 0 }
    }) });
    if (!response.ok) savedCalculationRef.current = null;
  }
  function newCalculation() { void saveCurrentCalculation().catch(() => { savedCalculationRef.current = null; }); setForm(initialForm); setCategory('DRY'); setQuote(null); setSaleRate(''); setErrors({}); }

  return <main className="calculator-page"><div className="calculator-shell">
    <header className="calculator-page-header"><div><h1>Расчёт тарифа</h1><p className="client-line">Клиент: <strong>{counterparty?.name || 'Не указан'}</strong><span>•</span><small>данные из Bitrix24</small></p></div><div className="header-actions"><button className="new-calculation" type="button" onClick={newCalculation}>Новый расчёт</button><span className="date-badge">Дата расчёта: {today}</span></div></header>
    <section className="calculator-card"><ContainerModeSwitch category={category} onChange={changeCategory} /><CalculatorForm category={category} form={form} errors={errors} onChange={updateForm} onSubmit={calculate} /></section>
    {quote && <><CommercialRatePanel quote={quote} saleRate={saleRate} onSaleRateChange={setSaleRate} /><div className="result-grid"><div><RouteStages quote={quote} /><AdditionalServices quote={quote} /><CalculationExplanation quote={quote} /></div><CalculationBreakdown quote={quote} /></div></>}
  </div></main>;
}
