import type { CalculationQuote } from '../types';
import { calculateDiscount, formatRubles } from '../utils';

export function CommercialRatePanel({ quote, saleRate, onSaleRateChange }: { quote: CalculationQuote; saleRate: string; onSaleRateChange: (value: string) => void }) {
  const discount = calculateDiscount(quote.baseDoorToDoor, saleRate);
  const metrics = [['Экспедиторская маржа', quote.commercial.forwardingMargin], ['Эксп. маржа, %', quote.commercial.forwardingMarginPercent], ['Маржа сервисов', quote.commercial.servicesMargin], ['Итого маржа', quote.commercial.totalMargin], ['Итого маржа, %', quote.commercial.totalMarginPercent]];
  return <section className="commercial-panel"><h2>Коммерческая ставка</h2><div className="commercial-grid"><div className="commercial-editor"><label>Ставка продажи менеджера, ₽<input type="number" min="0" value={saleRate} onChange={(e) => onSaleRateChange(e.target.value)} placeholder="Введите ставку" /></label><div className="discount-line"><span>Скидка, %</span><strong>{discount === null ? '—' : `${discount.toFixed(1).replace('.', ',')} %`}</strong></div></div><div className="commercial-summary"><div className="base-rate"><span>Базовый тариф дверь/дверь</span><strong>{formatRubles(quote.baseDoorToDoor)}</strong></div><div className="commercial-metrics">{metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></div></div></section>;
}
