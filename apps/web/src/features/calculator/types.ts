export type CalculatorCategory = 'DRY' | 'REF';
export type ContainerOwner = 'COC' | 'SOC';

export type RouteStage = {
  number: number;
  mode: string;
  title: string;
  from: string;
  to: string;
  details: string;
};

export type BreakdownLine = { label: string; value: string; emphasis?: boolean };

export type CalculationQuote = {
  category: CalculatorCategory;
  baseDoorToDoor: number;
  routeStages: RouteStage[];
  additionalServices: Array<{ name: string; active: boolean }>;
  explanation: { distance: string[]; weight: string[]; base: string[] };
  commercial: {
    forwardingMargin: string;
    forwardingMarginPercent: string;
    servicesMargin: string;
    totalMargin: string;
    totalMarginPercent: string;
  };
  breakdown: BreakdownLine[];
};

export type CalculatorFormState = {
  origin: string;
  destination: string;
  container: string;
  cargo: string;
  weightKg: string;
  owner: ContainerOwner | '';
  identification: boolean;
  genset: boolean;
  dangerous: boolean;
  paymentDelay: string;
};
