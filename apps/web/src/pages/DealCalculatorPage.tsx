import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getBitrixPlacementDealId } from '../utils/bitrixAuth';
import { sendResizeToBitrix } from '../utils/bitrixResize';
import { ContainerModeSwitch } from '../features/calculator/components/ContainerModeSwitch';
import { CalculatorForm } from '../features/calculator/components/CalculatorForm';
import { CommercialRatePanel } from '../features/calculator/components/CommercialRatePanel';
import { AdditionalServices, CalculationBreakdown, CalculationExplanation, RouteStages } from '../features/calculator/components/ResultPanels';
import { calculatorFixtures } from '../features/calculator/fixtures/calculatorFixtures';
import { validateCalculatorForm } from '../features/calculator/utils';
import type { CalculationQuote, CalculatorCategory, CalculatorFormState } from '../features/calculator/types';

type Counterparty = { name?: string | null };
const initialForm: CalculatorFormState = { origin: '', destination: '', container: "40'HC", cargo: '', weightKg: '27200', owner: 'COC', identification: false, genset: false, dangerous: false, paymentDelay: '0' };

export function DealCalculatorPage() {
  const { apiFetch, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [category, setCategory] = useState<CalculatorCategory>('DRY');
  const [form, setForm] = useState<CalculatorFormState>(initialForm);
  const [errors, setErrors] = useState<Partial<Record<keyof CalculatorFormState, string>>>({});
  const [quote, setQuote] = useState<CalculationQuote | null>(null);
  const [saleRate, setSaleRate] = useState('210000');
  const [counterparty, setCounterparty] = useState<Counterparty | null>(null);
  const dealId = searchParams.get('dealId') ?? '';
  const portalDomain = searchParams.get('portal') ?? searchParams.get('domain') ?? '';
  const today = useMemo(() => new Intl.DateTimeFormat('ru-RU').format(new Date()), []);

  useEffect(() => {
    if (dealId || window.top === window.self) return;
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
      setForm((current) => ({ ...current, origin: current.origin || data.origin || '', destination: current.destination || data.destination || '', cargo: current.cargo || data.cargoName || '' }));
    }).catch(() => undefined);
  }, [apiFetch, dealId, portalDomain]);

  useEffect(() => { sendResizeToBitrix(); }, [quote, category, form, saleRate]);

  function updateForm(patch: Partial<CalculatorFormState>) { setForm((current) => ({ ...current, ...patch })); setErrors((current) => { const next = { ...current }; Object.keys(patch).forEach((key) => { delete next[key as keyof CalculatorFormState]; }); return next; }); }
  function changeCategory(next: CalculatorCategory) { setCategory(next); setQuote(null); setSaleRate(next === 'DRY' ? '210000' : ''); setErrors({}); setForm((current) => ({ ...current, container: next === 'DRY' ? "40'HC" : "40'RCPW", genset: next === 'REF' ? current.genset : false })); }
  function calculate() { const nextErrors = validateCalculatorForm(form); setErrors(nextErrors); if (Object.keys(nextErrors).length) return; setQuote(calculatorFixtures[category]); }
  function newCalculation() { setQuote(null); setSaleRate(''); setErrors({}); }

  return <main className="calculator-page"><div className="calculator-shell">
    <header className="calculator-page-header"><div><h1>Расчёт тарифа</h1><p className="client-line">Клиент: <strong>{counterparty?.name || 'не указан'}</strong><span>•</span><small>данные из Bitrix24</small></p></div><div className="header-actions"><button className="new-calculation" type="button" onClick={newCalculation}>Новый расчёт</button><span className="date-badge">Дата расчёта: {today}</span></div></header>
    <section className="calculator-card"><ContainerModeSwitch category={category} onChange={changeCategory} /><CalculatorForm category={category} form={form} errors={errors} onChange={updateForm} onSubmit={calculate} /></section>
    {quote && <><CommercialRatePanel quote={quote} saleRate={saleRate} onSaleRateChange={setSaleRate} /><div className="result-grid"><div><RouteStages quote={quote} /><AdditionalServices quote={quote} /><CalculationExplanation quote={quote} /></div><CalculationBreakdown quote={quote} /></div></>}
    <footer className="calculator-footer"><span>НОВИК / TARIFF CALC</span><span>{dealId ? `Сделка #${dealId}` : 'Режим калькулятора'} · {user?.role || 'USER'}</span></footer>
  </div></main>;
}
