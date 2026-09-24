import type { CalculatorCategory, CalculatorFormState } from '../types';
import { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { DirectoryAutocomplete } from '../../../components/DirectoryAutocomplete';

type Props = { category: CalculatorCategory; form: CalculatorFormState; errors: Partial<Record<keyof CalculatorFormState, string>>; onChange: (patch: Partial<CalculatorFormState>) => void; onSubmit: () => void };
const FieldError = ({ value }: { value?: string }) => value ? <span className="calculator-error">{value}</span> : null;

export function CalculatorForm({ category, form, errors, onChange, onSubmit }: Props) {
  const { apiFetch } = useAuth();
  const [containers, setContainers] = useState<Array<{ id: string; type: string }>>([]);
  useEffect(() => {
    void apiFetch(`/dictionaries/containers?category=${category}`).then(async (response) => {
      if (response.ok) setContainers((await response.json() as { items?: Array<{ id: string; type: string }> }).items ?? []);
    }).catch(() => setContainers([]));
  }, [apiFetch, category]);
  const weightValue = form.weightKg;
  return <form className="calculator-form" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
    <div className="form-row form-row-route">
      <DirectoryAutocomplete label="Пункт отправления" value={form.origin} selectedId={form.originLocationId} endpoint="/dictionaries/locations" placeholder="Выберите пункт отправления" required error={errors.origin} onChange={(text, id) => onChange({ origin: text, originLocationId: id })} />
      <DirectoryAutocomplete label="Пункт назначения" value={form.destination} selectedId={form.destinationLocationId} endpoint="/dictionaries/locations" placeholder="Выберите пункт назначения" required error={errors.destination} onChange={(text, id) => onChange({ destination: text, destinationLocationId: id })} />
    </div>
    <div className="form-row form-row-cargo">
      <label>Контейнер <span className="required">*</span><select className="container-select" value={form.containerId ?? ''} onChange={(e) => { const item = containers.find((candidate) => candidate.id === e.target.value); onChange({ containerId: e.target.value || null, container: item?.type ?? '' }); }}><option value="">Выберите контейнер</option>{containers.map((item) => <option value={item.id} key={item.id}>{item.type}</option>)}</select><FieldError value={errors.container} /></label>
      <DirectoryAutocomplete label="Груз / ЕТСНГ" value={form.cargo} selectedId={form.cargoId} endpoint="/dictionaries/cargo" placeholder="Введите груз или код ЕТСНГ" error={errors.cargo} onChange={(text, id) => onChange({ cargo: text, cargoId: id })} />
      <label>Вес груза, кг <span className="required">*</span><input type="text" inputMode="numeric" minLength={1} value={weightValue} placeholder="Введите вес" onChange={(e) => onChange({ weightKg: e.target.value.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ') })} /><FieldError value={errors.weightKg} /></label>
    </div>
    <div className="form-row form-row-options">
      <fieldset className="owner-field"><legend>Собственник контейнера <span className="required">*</span></legend><label className="radio-option"><input type="radio" checked={form.owner === 'COC'} onChange={() => onChange({ owner: 'COC' })} /> <span><strong>НОВИК</strong><small>COC</small></span></label><label className="radio-option"><input type="radio" checked={form.owner === 'SOC'} onChange={() => onChange({ owner: 'SOC' })} /> <span><strong>Иной собственник</strong><small>SOC</small></span></label><FieldError value={errors.owner} /></fieldset>
      <fieldset className="service-field"><legend>Доп. услуги</legend><div className="service-options"><label><input type="checkbox" checked={form.identification} onChange={(e) => onChange({ identification: e.target.checked })} /><span>Идентификация</span></label>{category === 'REF' && <label><input type="checkbox" checked={form.genset} onChange={(e) => onChange({ genset: e.target.checked })} /><span>Дженсет</span></label>}<label><input type="checkbox" checked={form.dangerous} onChange={(e) => onChange({ dangerous: e.target.checked })} /><span>Опасный груз</span></label></div></fieldset>
      <label className="delay-field">Отсрочка <span className="required">*</span><span><input type="number" min="0" step="1" value={form.paymentDelay} onChange={(e) => onChange({ paymentDelay: e.target.value })} /> дней</span><FieldError value={errors.paymentDelay} /></label>
    </div>
    <button className="calculate-button" type="submit">Рассчитать</button>
  </form>;
}
