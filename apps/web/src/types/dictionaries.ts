export type LocationItem = {
  id: string;
  code: string;
  city: string;
  region: string;
  country: string;
  label: string;
};

export type CargoItem = { id: string; name: string; etsng: string | null; label: string };
export type ContainerItem = { id: string; type: string; category: 'DRY' | 'REF' };

export type DictionaryBootstrap = {
  routeTypes: string[];
  transportTypes: string[];
  containerTypes: string[];
  containerStatuses: string[];
  currencies: string[];
  marginTypes: string[];
  locations: LocationItem[];
};

export type BitrixLocationSyncResponse = {
  success: boolean;
  created: number;
  updated: number;
  skipped: number;
  warnings: string[];
};
