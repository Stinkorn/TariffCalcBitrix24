import { useState } from 'react';
import type { CalculationQuote } from '../types';
import { calculateDiscount, formatRubles } from '../utils';

function displaySaleRate(value: string) {
  if (!value) return '';
  const numeric = Number(value.replace(/\s/g, ''));
  return Number.isFinite(numeric) ? new Intl.NumberFormat('ru-RU').format(numeric) : value;
}

export function CommercialRatePanel({ quote, saleRate, onSaleRateChange }: { quote: CalculationQuote; saleRate: string; onSaleRateChange: (value: string) => void }) {
  const discount = quote.baseDoorToDoor === null ? null : calculateDiscount(quote.baseDoorToDoor, saleRate);
  const metrics = [['Эксп. маржа', quote.commercial.forwardingMargin], ['Эксп. маржа, %', quote.commercial.forwardingMarginPercent], ['Маржа сервисов', quote.commercial.servicesMargin], ['Итого маржа', quote.commercial.totalMargin], ['Итого маржа, %', quote.commercial.totalMarginPercent]];
  const [editing, setEditing] = useState(false);
  return <section className="commercial-panel"><h2>Коммерческая ставка</h2><div className="commercial-grid"><div className="commercial-editor"><label>Ставка продажи менеджера, ₽<input type="text" inputMode="numeric" min="0" value={editing ? saleRate : displaySaleRate(saleRate)} onFocus={() => setEditing(true)} onBlur={() => { setEditing(false); onSaleRateChange(saleRate.replace(/\s/g, '')); }} onChange={(e) => onSaleRateChange(e.target.value.replace(/\D/g, ''))} placeholder="Введите ставку" /></label><div className="discount-line"><span>Скидка, %</span><strong>{discount === null ? '—' : `${discount.toFixed(1).replace('.', ',')} %`}</strong></div></div><div className="commercial-summary"><div className="base-rate"><span>Базовый тариф дверь/дверь</span><strong>{quote.baseDoorToDoor === null ? '—' : formatRubles(quote.baseDoorToDoor)}</strong></div><div className="commercial-metrics">{metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></div></div></section>;
}
