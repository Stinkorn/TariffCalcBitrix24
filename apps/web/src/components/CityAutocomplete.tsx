import {
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from 'react';
import { useDictionaries } from '../context/DictionariesContext';
import type { LocationItem } from '../types/dictionaries';

export type SelectedLocation = {
  city: string;
  region: string;
  code: string;
  id: string;
} | null;

type CityAutocompleteProps = {
  label: string;
  name: string;
  metadataPrefix: string;
  required?: boolean;
  value?: string;
  defaultValue?: string;
  onTextChange?: (text: string) => void;
  onLocationChange?: (location: SelectedLocation, inputValue: string) => void;
};

function matchesLocation(location: LocationItem, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return (
    location.city.toLowerCase().includes(normalized) ||
    location.region.toLowerCase().includes(normalized)
  );
}

function sendParentResize() {
  window.parent?.postMessage(
    { type: 'tariffcalc:resize', height: document.documentElement.scrollHeight },
    '*'
  );
}

export function CityAutocomplete({
  label,
  name,
  metadataPrefix,
  required,
  value,
  defaultValue = '',
  onTextChange,
  onLocationChange
}: CityAutocompleteProps) {
  const {
    dictionaries,
    bootstrapLoaded,
    bootstrapError,
    locationsOfflineMode,
    searchLocations,
    createLocation,
    upsertLocation
  } = useDictionaries();
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const inputValue = isControlled ? value ?? '' : internalValue;
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation>(null);
  const [results, setResults] = useState<LocationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createRegion, setCreateRegion] = useState('');
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const debounceRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const autoMatchDoneRef = useRef(false);
  const listId = useId();

  const localMatches = useMemo(
    () => dictionaries.locations.filter((item) => matchesLocation(item, inputValue)),
    [dictionaries.locations, inputValue]
  );

  useEffect(() => {
    setResults(localMatches.slice(0, inputValue.trim().length < 2 ? 200 : 50));
  }, [localMatches, inputValue]);

  useEffect(() => {
    if (isControlled) {
      setInternalValue(value ?? '');
    }
  }, [isControlled, value]);

  useEffect(() => {
    if (!bootstrapLoaded || autoMatchDoneRef.current) {
      return;
    }

    const normalized = inputValue.trim().toLowerCase();
    if (!normalized) {
      autoMatchDoneRef.current = true;
      return;
    }

    const localMatch =
      dictionaries.locations.find((item) => item.city.trim().toLowerCase() === normalized) ?? null;

    if (localMatch) {
      const nextSelection = {
        city: localMatch.city,
        region: localMatch.region,
        code: localMatch.code,
        id: localMatch.id
      };
      setSelectedLocation(nextSelection);
      onLocationChange?.(nextSelection, localMatch.city);
      autoMatchDoneRef.current = true;
      return;
    }

    autoMatchDoneRef.current = true;
    void searchLocations(inputValue).then((items) => {
      const remoteMatch =
        items.find((item) => item.city.trim().toLowerCase() === normalized) ?? null;
      if (!remoteMatch) {
        return;
      }

      const nextSelection = {
        city: remoteMatch.city,
        region: remoteMatch.region,
        code: remoteMatch.code,
        id: remoteMatch.id
      };
      setSelectedLocation(nextSelection);
      onLocationChange?.(nextSelection, remoteMatch.city);
    }).catch(() => {
      // ignore auto-match errors
    });
  }, [bootstrapLoaded, dictionaries.locations, inputValue, onLocationChange, searchLocations]);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
        setShowCreateForm(false);
      }
    }

    document.addEventListener('mousedown', handleDocumentClick);
    return () => document.removeEventListener('mousedown', handleDocumentClick);
  }, []);

  useEffect(() => {
    if (highlightedIndex >= 0) {
      optionRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  useEffect(() => {
    if (isOpen) {
      sendParentResize();
    }
  }, [isOpen]);

  useEffect(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    const query = inputValue.trim();
    const nextRequestId = ++requestIdRef.current;

    if (!query) {
      setLoading(false);
      setResults(dictionaries.locations.slice(0, 200));
      return;
    }

    if (query.length < 2) {
      setLoading(false);
      setResults(dictionaries.locations.filter((item) => matchesLocation(item, query)).slice(0, 200));
      return;
    }

    setLoading(true);
    debounceRef.current = window.setTimeout(() => {
      void searchLocations(query)
        .then((items) => {
          if (requestIdRef.current !== nextRequestId) {
            return;
          }
          setResults(items);
          setHighlightedIndex(items.length > 0 ? 0 : -1);
        })
        .catch(() => {
          if (requestIdRef.current !== nextRequestId) {
            return;
          }
          setResults(dictionaries.locations.filter((item) => matchesLocation(item, query)).slice(0, 50));
        })
        .finally(() => {
          if (requestIdRef.current === nextRequestId) {
            setLoading(false);
          }
        });
    }, 280);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [dictionaries.locations, inputValue, searchLocations]);

  const hasExactMatch = results.some(
    (item) => item.city.trim().toLowerCase() === inputValue.trim().toLowerCase()
  );
  const showAddAction =
    inputValue.trim().length > 0 && !loading && results.length === 0 && !hasExactMatch;

  function setTextValue(nextValue: string) {
    if (!isControlled) {
      setInternalValue(nextValue);
    }
    onTextChange?.(nextValue);
  }

  function handleSelect(location: LocationItem) {
    const nextSelection = {
      city: location.city,
      region: location.region,
      code: location.code,
      id: location.id
    };
    setSelectedLocation(nextSelection);
    setTextValue(location.city);
    setResults([location, ...results.filter((item) => item.code !== location.code)]);
    setIsOpen(false);
    setHighlightedIndex(-1);
    setInlineError(null);
    setShowCreateForm(false);
    upsertLocation(location);
    onLocationChange?.(nextSelection, location.city);
    sendParentResize();
  }

  function handleInputChange(nextValue: string) {
    setTextValue(nextValue);
    setIsOpen(true);
    setHighlightedIndex(0);
    setInlineError(null);

    if (
      selectedLocation &&
      nextValue.trim().toLowerCase() !== selectedLocation.city.trim().toLowerCase()
    ) {
      setSelectedLocation(null);
      onLocationChange?.(null, nextValue);
      return;
    }

    onLocationChange?.(selectedLocation, nextValue);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setIsOpen(true);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((current) => {
        const next = current + 1;
        return next >= results.length ? 0 : next;
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((current) => {
        if (results.length === 0) {
          return -1;
        }
        return current <= 0 ? results.length - 1 : current - 1;
      });
      return;
    }

    if (event.key === 'Enter' && isOpen && highlightedIndex >= 0 && results[highlightedIndex]) {
      event.preventDefault();
      handleSelect(results[highlightedIndex]);
      return;
    }

    if (event.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
      setShowCreateForm(false);
      sendParentResize();
    }
  }

  async function handleCreateLocation() {
    const city = inputValue.trim();
    const region = createRegion.trim();

    if (!city || !region) {
      setInlineError('Укажите город и субъект РФ.');
      return;
    }

    setCreating(true);
    setInlineError(null);

    try {
      const location = await createLocation({ city, region });
      handleSelect(location);
    } catch (error) {
      setInlineError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  }

  return (
    <label className="city-autocomplete-label">
      {label}
      <div className="city-autocomplete" ref={rootRef}>
        <input
          name={name}
          value={inputValue}
          required={required}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listId}
          placeholder="Начните вводить город"
          onChange={(event) => handleInputChange(event.target.value)}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
        />
        <input type="hidden" name={`${metadataPrefix}LocationId`} value={selectedLocation?.id ?? ''} />
        <input type="hidden" name={`${metadataPrefix}LocationCode`} value={selectedLocation?.code ?? ''} />
        <input type="hidden" name={`${metadataPrefix}Region`} value={selectedLocation?.region ?? ''} />
        <input type="hidden" name={`${metadataPrefix}City`} value={selectedLocation?.city ?? inputValue} />

        <div
          className={`city-autocomplete-dropdown${isOpen ? ' is-open' : ''}`}
          role="listbox"
          id={listId}
          aria-hidden={!isOpen}
        >
          {!bootstrapLoaded && !bootstrapError && <div className="city-autocomplete-state">Загрузка...</div>}
          {loading && <div className="city-autocomplete-state">Поиск...</div>}
          {!loading &&
            results.map((item, index) => (
              <button
                key={item.code}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                type="button"
                className={`city-autocomplete-option${index === highlightedIndex ? ' is-active' : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleSelect(item);
                }}
              >
                <span className="city-autocomplete-primary">
                  {item.city} — {item.region}
                </span>
              </button>
            ))}

          {!loading && results.length === 0 && (
            <div className="city-autocomplete-state">Ничего не найдено</div>
          )}

          {!loading && showAddAction && (
            <div className="city-autocomplete-create">
              <button
                type="button"
                className="city-autocomplete-add"
                onMouseDown={(event) => {
                  event.preventDefault();
                  setShowCreateForm((current) => !current);
                  setCreateRegion('');
                  setInlineError(null);
                  sendParentResize();
                }}
              >
                + Добавить в справочник
              </button>

              {showCreateForm && (
                <div className="city-autocomplete-create-form">
                  <input value={inputValue} disabled />
                  <input
                    value={createRegion}
                    placeholder="Субъект РФ"
                    onChange={(event) => setCreateRegion(event.target.value)}
                  />
                  <div className="city-autocomplete-create-actions">
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={handleCreateLocation}
                      disabled={creating}
                    >
                      {creating ? 'Сохранение...' : 'Сохранить'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {locationsOfflineMode && <span className="muted">Офлайн режим справочника</span>}
      {!selectedLocation && inputValue.trim().length > 0 && (
        <span className="muted">Выберите город из справочника для точного подбора тарифа.</span>
      )}
      {inlineError && <span className="error">{inlineError}</span>}
    </label>
  );
}
