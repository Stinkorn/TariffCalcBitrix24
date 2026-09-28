import type { CalculatorCategory, CalculationQuote } from '../types';

export type CalculationPdfData = {
  dealId: string;
  counterpartyName: string;
  category: CalculatorCategory;
  origin: string;
  destination: string;
  cargo: string;
  container: string;
  weightKg: string;
  owner: string;
  paymentDelayDays: number;
  tariffDate: string;
  saleRate: number;
  baseDoorToDoor: number | null;
  quote: CalculationQuote;
};
