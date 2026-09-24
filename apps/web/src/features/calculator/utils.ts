import type { CalculatorFormState } from './types';

export function validateCalculatorForm(form: CalculatorFormState) {
  const errors: Partial<Record<keyof CalculatorFormState, string>> = {};
  if (!form.originLocationId) errors.origin = 'Выберите пункт отправления из справочника';
  if (!form.destinationLocationId) errors.destination = 'Выберите пункт назначения из справочника';
  if (!form.containerId) errors.container = 'Укажите контейнер';
  const weight = Number(form.weightKg.replace(/\s/g, ''));
  if (!form.weightKg || !Number.isInteger(weight) || weight <= 0) errors.weightKg = 'Введите вес больше 0';
  if (!form.owner) errors.owner = 'Выберите собственника';
  if (!Number.isInteger(Number(form.paymentDelay)) || Number(form.paymentDelay) < 0) errors.paymentDelay = 'Укажите целое число от 0';
  return errors;
}

export function formatRubles(value: number) {
  return new Intl.NumberFormat('ru-RU').format(value) + ' ₽';
}

export function calculateDiscount(base: number, saleRate: string) {
  const sale = Number(saleRate);
  if (!saleRate || !Number.isFinite(sale) || base <= 0) return null;
  return ((base - sale) / base) * 100;
}
