import type { CalculatorCategory } from '../types';

export function ContainerModeSwitch({ category, onChange }: { category: CalculatorCategory; onChange: (category: CalculatorCategory) => void }) {
  return <div className="calculator-mode-switch" role="tablist" aria-label="Тип контейнера">
    <button className={category === 'DRY' ? 'is-active' : ''} type="button" onClick={() => onChange('DRY')}><span className="mode-icon" aria-hidden="true"><svg viewBox="0 0 24 18" role="img"><rect x="1" y="2" width="22" height="14" rx="1" /><path d="M5 2v14M9 2v14M13 2v14M17 2v14M21 2v14" /></svg></span>СУХОЙ КОНТЕЙНЕР</button>
    <button className={category === 'REF' ? 'is-active' : ''} type="button" onClick={() => onChange('REF')}><span className="mode-icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="img"><path d="M12 1v22M1 12h22M4.2 4.2l15.6 15.6M19.8 4.2 4.2 19.8M12 5l2 3.5L12 12 10 8.5 12 5Zm0 14-2-3.5 2-3.5 2 3.5-2 3.5Z" /></svg></span>РЕФРИЖЕРАТОРНЫЙ КОНТЕЙНЕР</button>
  </div>;
}
