type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

export type LocationDirectoryItem = {
  id: string;
  label: string;
  city?: string;
  region?: string;
  country?: string;
};

export type CargoDirectoryItem = {
  id: string;
  label: string;
  name?: string;
  etsng?: string;
};

const cache = new Map<string, Promise<unknown[]>>();

function load<T>(apiFetch: ApiFetch, endpoint: string) {
  const existing = cache.get(endpoint);
  if (existing) return existing as Promise<T[]>;
  const request = apiFetch(endpoint).then(async (response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json() as { items?: T[] };
    return data.items ?? [];
  });
  cache.set(endpoint, request as Promise<unknown[]>);
  return request;
}

export function loadLocations(apiFetch: ApiFetch) {
  return load<LocationDirectoryItem>(apiFetch, '/dictionaries/locations');
}

export function loadCargo(apiFetch: ApiFetch) {
  return load<CargoDirectoryItem>(apiFetch, '/dictionaries/cargo');
}

export function normalizeDirectoryValue(value: unknown) {
  return String(value ?? '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

export function filterLocations(items: LocationDirectoryItem[], query: string) {
  const needle = normalizeDirectoryValue(query);
  if (!needle) return items;
  return items.filter((item) => [item.city, item.region, item.country, item.label].some((value) => normalizeDirectoryValue(value).includes(needle)));
}

export function rankCargo(items: CargoDirectoryItem[], query: string) {
  const needle = normalizeDirectoryValue(query);
  if (!needle) return items;
  const scored = items.filter((item) => [item.etsng, item.name, item.label].some((value) => normalizeDirectoryValue(value).includes(needle))).map((item) => {
    const etsng = normalizeDirectoryValue(item.etsng);
    const name = normalizeDirectoryValue(item.name);
    const score = etsng === needle ? 0 : etsng.startsWith(needle) ? 1 : name === needle ? 2 : name.startsWith(needle) ? 3 : name.includes(needle) ? 4 : 5;
    return { item, score };
  });
  return scored.sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label, 'ru')).map(({ item }) => item);
}

export function findExact<T extends { id: string; label: string }>(items: T[], value: string, fields: Array<keyof T | string>) {
  const expected = normalizeDirectoryValue(value);
  const exact = items.filter((item) => fields.some((field) => normalizeDirectoryValue((item as Record<string, unknown>)[String(field)]) === expected));
  return exact.length === 1 ? exact[0] : null;
}
