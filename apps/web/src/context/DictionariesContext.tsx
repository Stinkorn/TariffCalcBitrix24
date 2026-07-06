import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react';
import type { DictionaryBootstrap, LocationItem } from '../types/dictionaries';

const API_BASE_URL =
  import.meta.env.VITE_API_URL ??
  import.meta.env.VITE_API_BASE_URL ??
  'http://localhost:9099';

const EMPTY_DICTIONARIES: DictionaryBootstrap = {
  routeTypes: ['KLD_OUT', 'KLD_IN'],
  transportTypes: ['AUTO', 'RAIL', 'SEA', 'MULTIMODAL'],
  containerTypes: ['20DC', '40DC', '40HC', '20REF', '40REF'],
  containerStatuses: ['EMPTY', 'LOADED'],
  currencies: ['EUR', 'USD', 'RUB'],
  marginTypes: ['percent', 'fixed'],
  locations: []
};

type DictionariesContextValue = {
  apiBaseUrl: string;
  dictionaries: DictionaryBootstrap;
  bootstrapLoaded: boolean;
  bootstrapError: string | null;
  locationsOfflineMode: boolean;
  refreshBootstrap: () => Promise<void>;
  searchLocations: (query: string) => Promise<LocationItem[]>;
  createLocation: (input: { city: string; region: string }) => Promise<LocationItem>;
  upsertLocation: (location: LocationItem) => void;
};

const DictionariesContext = createContext<DictionariesContextValue | null>(null);

function filterLocalLocations(items: LocationItem[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return items.slice(0, 200);
  }

  return items
    .filter((item) => {
      const city = item.city.toLowerCase();
      const region = item.region.toLowerCase();
      return city.includes(normalized) || region.includes(normalized);
    })
    .slice(0, 50);
}

function dedupeLocations(items: LocationItem[]) {
  const map = new Map<string, LocationItem>();
  for (const item of items) {
    map.set(item.code, item);
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'ru'));
}

export function DictionariesProvider({ children }: PropsWithChildren) {
  const [dictionaries, setDictionaries] = useState<DictionaryBootstrap>(EMPTY_DICTIONARIES);
  const [bootstrapLoaded, setBootstrapLoaded] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [locationsOfflineMode, setLocationsOfflineMode] = useState(false);
  const locationsByCodeRef = useRef<Map<string, LocationItem>>(new Map());
  const queryCacheRef = useRef<Map<string, LocationItem[]>>(new Map());
  const pendingQueryRef = useRef<Map<string, Promise<LocationItem[]>>>(new Map());
  const bootstrapRequestRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    void refreshBootstrap();
  }, []);

  function mergeLocations(items: LocationItem[]) {
    if (items.length === 0) {
      return;
    }

    for (const item of items) {
      locationsByCodeRef.current.set(item.code, item);
    }

    const merged = dedupeLocations(Array.from(locationsByCodeRef.current.values()));
    setDictionaries((current) => ({
      ...current,
      locations: merged
    }));
  }

  async function refreshBootstrap() {
    if (bootstrapRequestRef.current) {
      return bootstrapRequestRef.current;
    }

    const request = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/dictionaries/bootstrap`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as DictionaryBootstrap;
        locationsByCodeRef.current = new Map(data.locations.map((item) => [item.code, item]));
        queryCacheRef.current.clear();
        setDictionaries({
          ...data,
          locations: dedupeLocations(data.locations)
        });
        setBootstrapError(null);
        setLocationsOfflineMode(false);
      } catch (error) {
        setBootstrapError(error instanceof Error ? error.message : String(error));
        setLocationsOfflineMode(true);
        setDictionaries((current) => ({
          ...current,
          locations: dedupeLocations(Array.from(locationsByCodeRef.current.values()))
        }));
      } finally {
        setBootstrapLoaded(true);
        bootstrapRequestRef.current = null;
      }
    })();

    bootstrapRequestRef.current = request;
    return request;
  }

  async function searchLocations(query: string) {
    const trimmedQuery = query.trim();
    const cacheKey = trimmedQuery.toLowerCase();
    const localItems = dedupeLocations(Array.from(locationsByCodeRef.current.values()));

    if (trimmedQuery.length < 2) {
      return filterLocalLocations(localItems, trimmedQuery);
    }

    if (queryCacheRef.current.has(cacheKey)) {
      return queryCacheRef.current.get(cacheKey) ?? [];
    }

    if (pendingQueryRef.current.has(cacheKey)) {
      return pendingQueryRef.current.get(cacheKey) ?? [];
    }

    const request = (async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/dictionaries/locations?search=${encodeURIComponent(trimmedQuery)}`
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as { items: LocationItem[] };
        const merged = dedupeLocations([...filterLocalLocations(localItems, trimmedQuery), ...data.items]);
        queryCacheRef.current.set(cacheKey, merged);
        mergeLocations(data.items);
        setLocationsOfflineMode(false);
        return merged;
      } catch {
        setLocationsOfflineMode(true);
        const fallback = filterLocalLocations(localItems, trimmedQuery);
        queryCacheRef.current.set(cacheKey, fallback);
        return fallback;
      } finally {
        pendingQueryRef.current.delete(cacheKey);
      }
    })();

    pendingQueryRef.current.set(cacheKey, request);
    return request;
  }

  async function createLocation(input: { city: string; region: string }) {
    const response = await fetch(`${API_BASE_URL}/dictionaries/locations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const payload = (await response.json()) as { message?: string | string[] };
        if (Array.isArray(payload.message)) {
          message = payload.message.join('; ');
        } else if (typeof payload.message === 'string' && payload.message.trim()) {
          message = payload.message;
        }
      } catch {
        // ignore non-json response
      }
      throw new Error(message);
    }

    const location = (await response.json()) as LocationItem;
    mergeLocations([location]);
    queryCacheRef.current.clear();
    setLocationsOfflineMode(false);
    return location;
  }

  function upsertLocation(location: LocationItem) {
    mergeLocations([location]);
    queryCacheRef.current.clear();
  }

  return (
    <DictionariesContext.Provider
      value={{
        apiBaseUrl: API_BASE_URL,
        dictionaries,
        bootstrapLoaded,
        bootstrapError,
        locationsOfflineMode,
        refreshBootstrap,
        searchLocations,
        createLocation,
        upsertLocation
      }}
    >
      {children}
    </DictionariesContext.Provider>
  );
}

export function useDictionaries() {
  const context = useContext(DictionariesContext);
  if (!context) {
    throw new Error('useDictionaries must be used within DictionariesProvider');
  }
  return context;
}
