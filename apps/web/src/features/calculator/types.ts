export type CalculatorCategory = 'DRY' | 'REF';
export type ContainerOwner = 'COC' | 'SOC';

export type RouteStage = {
  number: number;
  mode: string;
  title: string;
  from: string;
  to: string;
  details: string;
  status: string;
  amount: string;
  amountValue?: number;
  source?: Record<string, unknown>;
};

export type BreakdownLine = { label: string; value: string; emphasis?: boolean };

export type CalculationQuote = {
  category: CalculatorCategory;
  baseDoorToDoor: number | null;
  routeStages: RouteStage[];
  additionalServices: Array<{ name: string; active: boolean; amountValue?: number; priced?: boolean }>;
  explanation: { distance: string[]; weight: string[]; base: string[] };
  commercial: {
    forwardingMargin: string;
    forwardingMarginPercent: string;
    servicesMargin: string;
    totalMargin: string;
    totalMarginPercent: string;
  };
  breakdown: BreakdownLine[];
  warnings?: string[];
  costs?: {
    firstMile: number | null;
    liLo: number | null;
    portHandlingOrigin: number | null;
    fios: number | null;
    portHandlingDestination: number | null;
    connectionOrigin: number | null;
    connectionDestination: number | null;
    containerUsage: number | null;
    containerStorage: number | null;
    additionalServices: number | null;
    lastMile: number | null;
    eaeuConfirmation: number | null;
    moneyCost: number | null;
    otherExpenses: number | null;
    paymentDelay: number | null;
    total: number | null;
  };
};

export type CalculatorFormState = {
  origin: string;
  originLocationId: string | null;
  destination: string;
  destinationLocationId: string | null;
  container: string;
  containerId: string | null;
  cargo: string;
  cargoId: string | null;
  weightKg: string;
  owner: ContainerOwner | '';
  identification: boolean;
  genset: boolean;
  dangerous: boolean;
  paymentDelay: string;
};
