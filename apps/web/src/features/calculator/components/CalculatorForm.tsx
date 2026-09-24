import type { CalculatorCategory, CalculatorFormState } from '../types';

type Props = { category: CalculatorCategory; form: CalculatorFormState; errors: Partial<Record<keyof CalculatorFormState, string>>; onChange: (patch: Partial<CalculatorFormState>) => void; onSubmit: () => void };
const FieldError = ({ value }: { value?: string }) => value ? <span className="calculator-error">{value}</span> : null;

export function CalculatorForm({ category, form, errors, onChange, onSubmit }: Props) {
  return <form className="calculator-form" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
    <div className="form-row form-row-route">
      <label>Пункт отправления <span className="required">*</span><input value={form.origin} placeholder="Введите город" onChange={(e) => onChange({ origin: e.target.value })} /><FieldError value={errors.origin} /></label>
      <label>Пункт назначения <span className="required">*</span><input value={form.destination} placeholder="Введите город" onChange={(e) => onChange({ destination: e.target.value })} /><FieldError value={errors.destination} /></label>
    </div>
    <div className="form-row form-row-cargo">
      <label>Контейнер <span className="required">*</span><select value={form.container} onChange={(e) => onChange({ container: e.target.value })}><option value="">Выберите контейнер</option><option>{category === 'DRY' ? "40'HC" : "40'RCPW"}</option><option>{category === 'DRY' ? "20'DC" : "40'RH"}</option></select><FieldError value={errors.container} /></label>
      <label>Груз / ЕТСНГ<input value={form.cargo} placeholder="Введите груз или код ЕТСНГ" onChange={(e) => onChange({ cargo: e.target.value })} /></label>
      <label>Вес груза, кг <span className="required">*</span><input type="number" min="1" value={form.weightKg} onChange={(e) => onChange({ weightKg: e.target.value })} /><FieldError value={errors.weightKg} /></label>
    </div>
    <div className="form-row form-row-options">
      <fieldset className="owner-field"><legend>Собственник контейнера <span className="required">*</span></legend><label className="radio-option"><input type="radio" checked={form.owner === 'COC'} onChange={() => onChange({ owner: 'COC' })} /> <span><strong>НОВИК</strong><small>COC</small></span></label><label className="radio-option"><input type="radio" checked={form.owner === 'SOC'} onChange={() => onChange({ owner: 'SOC' })} /> <span><strong>Иной собственник</strong><small>SOC</small></span></label><FieldError value={errors.owner} /></fieldset>
      <fieldset className="service-field"><legend>Доп. услуги</legend><div className="service-options"><label><input type="checkbox" checked={form.identification} onChange={(e) => onChange({ identification: e.target.checked })} /><span>Идентификация</span></label>{category === 'REF' && <label><input type="checkbox" checked={form.genset} onChange={(e) => onChange({ genset: e.target.checked })} /><span>Дженсет</span></label>}<label><input type="checkbox" checked={form.dangerous} onChange={(e) => onChange({ dangerous: e.target.checked })} /><span>Опасный груз</span></label></div></fieldset>
      <label className="delay-field">Отсрочка <span className="required">*</span><span><input type="number" min="0" step="1" value={form.paymentDelay} onChange={(e) => onChange({ paymentDelay: e.target.value })} /> дней</span><FieldError value={errors.paymentDelay} /></label>
    </div>
    <button className="calculate-button" type="submit">Рассчитать</button>
  </form>;
}
