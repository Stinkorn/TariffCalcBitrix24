import type { CalculatorCategory } from '../types';

export function ContainerModeSwitch({ category, onChange }: { category: CalculatorCategory; onChange: (category: CalculatorCategory) => void }) {
  return <div className="calculator-mode-switch" role="tablist" aria-label="Тип контейнера">
    <button className={category === 'DRY' ? 'is-active' : ''} type="button" onClick={() => onChange('DRY')}><span className="mode-icon">▥</span>СУХОЙ КОНТЕЙНЕР</button>
    <button className={category === 'REF' ? 'is-active' : ''} type="button" onClick={() => onChange('REF')}><span className="mode-icon">✳</span>РЕФРИЖЕРАТОРНЫЙ КОНТЕЙНЕР</button>
  </div>;
}
