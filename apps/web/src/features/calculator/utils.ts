import type { CalculatorFormState } from './types';

export function validateCalculatorForm(form: CalculatorFormState) {
  const errors: Partial<Record<keyof CalculatorFormState, string>> = {};
  if (!form.origin.trim()) errors.origin = 'Укажите пункт отправления';
  if (!form.destination.trim()) errors.destination = 'Укажите пункт назначения';
  if (!form.container.trim()) errors.container = 'Укажите контейнер';
  if (!form.weightKg || Number(form.weightKg) <= 0) errors.weightKg = 'Введите вес больше 0';
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
