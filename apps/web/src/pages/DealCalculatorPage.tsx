import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CityAutocomplete,
  type SelectedLocation
} from '../components/CityAutocomplete';
import { useDictionaries } from '../context/DictionariesContext';
import type { BitrixLocationSyncResponse } from '../types/dictionaries';

type Services = {
  portHandling: boolean;
  storage: boolean;
  reeferConnection: boolean;
  containerRent: boolean;
};

type StageType = 'AUTO' | 'SEA' | 'RAIL' | 'TERMINAL' | 'CUSTOM';
type RouteTemplateType = 'AUTO_ONLY' | 'AUTO_SEA_AUTO' | 'AUTO_SEA_RAIL_AUTO' | 'CUSTOM';
type ServiceName = 'ПРР' | 'Хранение' | 'Реф-подключение' | 'Аренда контейнера';

type StageItem = {
  id: string;
  sortOrder: number;
  type: StageType;
  title: string;
  fromLocation: string;
  fromAddress: string;
  toLocation: string;
  toAddress: string;
  vehicleType: string;
  containerType: string;
  comment: string;
  costAmount: number;
  costCurrency: string;
};

type AdditionalService = {
  id: string;
  enabled: boolean;
  serviceName: ServiceName;
  stageId: string;
  quantity: number;
  costAmount: number;
};

type CalculationLine = {
  stage: string;
  name: string;
  cost: number;
  currency: string;
  sortOrder?: number;
};

type CalculateResponse = {
  totalCost: number;
  margin: number;
  clientPrice: number;
  currency: string;
  lines: CalculationLine[];
  warnings?: string[];
};

type SavedCalculation = {
  id: string;
  dealId: string | null;
  counterpartyId: string | null;
  counterpartyType: string | null;
  counterpartyName: string | null;
  routeType: string | null;
  origin: string;
  destination: string;
  totalCost: string;
  margin: string;
  clientPrice: string;
  currency: string;
  status: string;
  createdAt: string;
};

type TimelineCommentResponse = {
  success: boolean;
  portalDomain: string;
  dealId: string;
};

type CounterpartyResponse = {
  dealId: string;
  type: 'company' | 'contact' | 'unknown';
  id: string | null;
  name: string | null;
};

type DealPrefillResponse = {
  dealId: string;
  cargoName: string;
  cargoNameRaw?: string;
  cargoNameResolved?: boolean;
  vehicleType: string;
  vehicleTypeRaw?: string;
  vehicleTypeResolved?: boolean;
  origin: string;
  originRaw: string;
  originResolved: boolean;
  destination: string;
  destinationRaw: string;
  destinationResolved: boolean;
};

type FormState = {
  dealId: string;
  portalDomain: string;
  routeType: string;
  origin: string;
  destination: string;
  cargoName: string;
  vehicleType: string;
  transportType: string;
  containerType: string;
  containerStatus: string;
  weightKg: number;
  volumeM3: number;
  currency: string;
  marginType: string;
  marginValue: number;
  services: Services;
};

type AccordionKey = 'request' | 'stages' | 'services' | 'summary' | 'admin';
type AccordionState = Record<AccordionKey, boolean>;

const STAGE_TYPE_LABELS: Record<StageType, string> = {
  AUTO: 'Авто',
  SEA: 'Море',
  RAIL: 'ЖД',
  TERMINAL: 'Терминал',
  CUSTOM: 'Свой этап'
};

const STAGE_BASE_COSTS: Record<StageType, number> = {
  AUTO: 18000,
  SEA: 52000,
  RAIL: 41000,
  TERMINAL: 9000,
  CUSTOM: 15000
};

const SERVICE_BASE_COSTS: Record<ServiceName, number> = {
  'ПРР': 6000,
  'Хранение': 3500,
  'Реф-подключение': 4200,
  'Аренда контейнера': 12000
};

function formatMoney(value: number | string, currency: string) {
  return `${Number(value).toFixed(2)} ${currency}`;
}

function createStageId() {
  return `stage-${Math.random().toString(36).slice(2, 10)}`;
}

function createServiceId() {
  return `service-${Math.random().toString(36).slice(2, 10)}`;
}

function clampNumber(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function buildStageTitle(type: StageType, index: number) {
  return `Этап ${index + 1} — ${STAGE_TYPE_LABELS[type]}`;
}

function isPrefillDirtyKey(
  key: keyof FormState
): key is 'cargoName' | 'vehicleType' | 'origin' | 'destination' {
  return key === 'cargoName' || key === 'vehicleType' || key === 'origin' || key === 'destination';
}

function sendParentResize() {
  window.parent?.postMessage(
    { type: 'tariffcalc:resize', height: document.documentElement.scrollHeight },
    '*'
  );
}

function normalizeStages(stages: StageItem[]) {
  return stages.map((stage, index) => ({
    ...stage,
    sortOrder: index + 1,
    title: buildStageTitle(stage.type, index),
    costAmount: STAGE_BASE_COSTS[stage.type] ?? STAGE_BASE_COSTS.CUSTOM
  }));
}

function createStage(
  type: StageType,
  index: number,
  currency: string,
  defaults?: Partial<Pick<StageItem, 'fromLocation' | 'toLocation' | 'containerType' | 'vehicleType'>>
): StageItem {
  return {
    id: createStageId(),
    sortOrder: index + 1,
    type,
    title: buildStageTitle(type, index),
    fromLocation: defaults?.fromLocation ?? '',
    fromAddress: '',
    toLocation: defaults?.toLocation ?? '',
    toAddress: '',
    vehicleType: defaults?.vehicleType ?? '',
    containerType: defaults?.containerType ?? '',
    comment: '',
    costAmount: STAGE_BASE_COSTS[type],
    costCurrency: currency
  };
}

function buildStagesFromTemplate(
  template: RouteTemplateType,
  currency: string,
  defaults: Pick<FormState, 'origin' | 'destination' | 'containerType' | 'vehicleType'>
) {
  const stageTypes: StageType[] =
    template === 'AUTO_ONLY'
      ? ['AUTO']
      : template === 'AUTO_SEA_AUTO'
        ? ['AUTO', 'SEA', 'AUTO']
        : template === 'AUTO_SEA_RAIL_AUTO'
          ? ['AUTO', 'SEA', 'RAIL', 'AUTO']
          : [];

  return normalizeStages(
    stageTypes.map((type, index) =>
      createStage(type, index, currency, {
        fromLocation: index === 0 ? defaults.origin : '',
        toLocation: index === stageTypes.length - 1 ? defaults.destination : '',
        containerType: defaults.containerType,
        vehicleType: defaults.vehicleType
      })
    )
  );
}

function buildDefaultServices(): AdditionalService[] {
  return (Object.keys(SERVICE_BASE_COSTS) as ServiceName[]).map((serviceName) => ({
    id: createServiceId(),
    enabled: false,
    serviceName,
    stageId: '',
    quantity: 1,
    costAmount: SERVICE_BASE_COSTS[serviceName]
  }));
}

function buildCalculationSnapshot(
  formState: FormState,
  stages: StageItem[],
  services: AdditionalService[]
) {
  const normalizedStages = normalizeStages(stages).map((stage) => ({
    ...stage,
    vehicleType: stage.vehicleType || formState.vehicleType,
    containerType: stage.containerType || formState.containerType,
    costCurrency: formState.currency
  }));
  const normalizedServices = services.map((service) => ({
    ...service,
    costAmount: SERVICE_BASE_COSTS[service.serviceName] * Math.max(service.quantity, 1)
  }));
  const totalStages = normalizedStages.reduce((sum, stage) => sum + stage.costAmount, 0);
  const totalServices = normalizedServices.reduce(
    (sum, service) => sum + (service.enabled ? service.costAmount : 0),
    0
  );
  const totalCost = totalStages + totalServices;
  const marginPercent = formState.marginType === 'fixed'
    ? formState.marginValue > 0 && totalCost > 0
      ? (formState.marginValue / totalCost) * 100
      : 0
    : formState.marginValue;
  const marginAmount = formState.marginType === 'fixed'
    ? formState.marginValue
    : totalCost * (marginPercent / 100);
  const clientPrice = totalCost + marginAmount;

  const lines: CalculationLine[] = [
    ...normalizedStages.map((stage) => ({
      stage: stage.title,
      name: `${STAGE_TYPE_LABELS[stage.type]}: ${stage.fromLocation || '—'} -> ${stage.toLocation || '—'}`,
      cost: stage.costAmount,
      currency: stage.costCurrency,
      sortOrder: stage.sortOrder
    })),
    ...normalizedServices
      .filter((service) => service.enabled)
      .map((service, index) => ({
        stage: 'Доп. услуги',
        name: service.stageId
          ? `${service.serviceName} (этап ${normalizedStages.find((stage) => stage.id === service.stageId)?.sortOrder ?? '?'})`
          : service.serviceName,
        cost: service.costAmount,
        currency: formState.currency,
        sortOrder: normalizedStages.length + index + 1
      }))
  ];

  const warnings: string[] = [];
  if (normalizedStages.length === 0) {
    warnings.push('Добавьте хотя бы один этап перевозки.');
  }
  if (!formState.origin.trim() || !formState.destination.trim()) {
    warnings.push('Заполните пункты погрузки и выгрузки.');
  }

  return {
    result: {
      totalCost,
      margin: marginAmount,
      clientPrice,
      currency: formState.currency,
      lines,
      warnings
    },
    normalizedStages,
    normalizedServices,
    totalStages,
    totalServices,
    totalCost,
    marginPercent,
    clientPrice
  };
}

export function DealCalculatorPage() {
  const { apiBaseUrl, dictionaries, bootstrapError, refreshBootstrap } = useDictionaries();
  const pageRef = useRef<HTMLElement | null>(null);
  const [searchParams] = useSearchParams();
  const initialDealId = searchParams.get('dealId') ?? '';
  const initialDomain = searchParams.get('portal') ?? searchParams.get('domain') ?? '';

  const initialFormState = useMemo<FormState>(
    () => ({
      dealId: initialDealId,
      portalDomain: initialDomain,
      routeType: 'KLD_OUT',
      origin: '',
      destination: '',
      cargoName: '',
      vehicleType: '',
      transportType: 'AUTO',
      containerType: '40REF',
      containerStatus: 'SOC',
      weightKg: 1000,
      volumeM3: 10,
      currency: 'EUR',
      marginType: 'percent',
      marginValue: 20,
      services: {
        portHandling: false,
        storage: false,
        reeferConnection: false,
        containerRent: false
      }
    }),
    [initialDealId, initialDomain]
  );

  const fieldDirtyRef = useRef({
    cargoName: false,
    vehicleType: false,
    origin: false,
    destination: false
  });
  const stagesDirtyRef = useRef(false);
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [stages, setStages] = useState<StageItem[]>(() =>
    buildStagesFromTemplate('AUTO_ONLY', initialFormState.currency, initialFormState)
  );
  const [routeTemplate, setRouteTemplate] = useState<RouteTemplateType>('AUTO_ONLY');
  const [services, setServices] = useState<AdditionalService[]>(buildDefaultServices);
  const [openSections, setOpenSections] = useState<AccordionState>({
    request: true,
    stages: true,
    services: false,
    summary: true,
    admin: false
  });
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillWarning, setPrefillWarning] = useState<string | null>(null);
  const [result, setResult] = useState<CalculateResponse | null>(null);
  const [history, setHistory] = useState<SavedCalculation[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [lastPayload, setLastPayload] = useState<FormState>(initialFormState);
  const [calculatedAt, setCalculatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [writingTimeline, setWritingTimeline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timelineMessage, setTimelineMessage] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<BitrixLocationSyncResponse | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncingLocations, setSyncingLocations] = useState(false);
  const [counterparty, setCounterparty] = useState<CounterpartyResponse | null>(null);
  const [counterpartyError, setCounterpartyError] = useState<string | null>(null);
  const [counterpartyLoading, setCounterpartyLoading] = useState(false);

  const summary = useMemo(
    () => buildCalculationSnapshot(formState, stages, services),
    [formState, stages, services]
  );

  useEffect(() => {
    void loadHistory(initialDealId);
  }, [initialDealId]);

  useEffect(() => {
    if (!initialDealId.trim()) {
      setCounterparty(null);
      setCounterpartyError(null);
      return;
    }

    void loadCounterparty(initialDealId, initialDomain);
    void loadPrefill(initialDealId, initialDomain);
  }, [initialDealId, initialDomain]);

  useEffect(() => {
    setStages((current) =>
      current.map((stage) => ({
        ...stage,
        costCurrency: formState.currency,
        vehicleType: stage.vehicleType || formState.vehicleType,
        containerType: stage.containerType || formState.containerType
      }))
    );
  }, [formState.containerType, formState.currency, formState.vehicleType]);

  useEffect(() => {
    function sendResize() {
      const root = document.documentElement;
      const body = document.body;
      const height = Math.max(
        root.scrollHeight,
        root.offsetHeight,
        body.scrollHeight,
        body.offsetHeight,
        pageRef.current?.scrollHeight ?? 0,
        window.innerHeight
      );

      window.parent?.postMessage({ type: 'tariffcalc:resize', height }, '*');
    }

    const delayed = [0, 100, 300, 1000, 2000].map((delay) => window.setTimeout(sendResize, delay));
    window.addEventListener('resize', sendResize);

    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(sendResize);
    });
    observer.observe(pageRef.current ?? document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });

    return () => {
      for (const timeoutId of delayed) {
        window.clearTimeout(timeoutId);
      }
      observer.disconnect();
      window.removeEventListener('resize', sendResize);
    };
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => sendParentResize(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [
    openSections,
    formState,
    stages,
    services,
    result,
    history.length,
    error,
    timelineMessage,
    syncResult,
    syncError,
    syncingLocations,
    counterparty,
    counterpartyError,
    counterpartyLoading,
    prefillLoading,
    prefillWarning,
    loading,
    saving,
    writingTimeline,
    bootstrapError
  ]);

  async function loadHistory(dealId: string) {
    const byDeal = dealId.trim();
    const url = byDeal
      ? `${apiBaseUrl}/calculations/by-deal/${encodeURIComponent(byDeal)}`
      : `${apiBaseUrl}/calculations/recent`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`History HTTP ${response.status}`);
    }

    const data = (await response.json()) as SavedCalculation[];
    setHistory(data);
  }

  async function loadCounterparty(dealId: string, portalDomain: string) {
    setCounterpartyLoading(true);
    setCounterpartyError(null);

    try {
      const search = new URLSearchParams();
      if (portalDomain.trim()) {
        search.set('portalDomain', portalDomain.trim());
      }

      const query = search.toString();
      const response = await fetch(
        `${apiBaseUrl}/bitrix/deals/${encodeURIComponent(dealId)}/counterparty${query ? `?${query}` : ''}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as CounterpartyResponse;
      setCounterparty(data);
    } catch (loadError) {
      setCounterparty(null);
      setCounterpartyError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setCounterpartyLoading(false);
    }
  }

  async function loadPrefill(dealId: string, portalDomain: string) {
    setPrefillLoading(true);
    setPrefillWarning(null);

    try {
      const search = new URLSearchParams();
      if (portalDomain.trim()) {
        search.set('portalDomain', portalDomain.trim());
      }

      const query = search.toString();
      const response = await fetch(
        `${apiBaseUrl}/bitrix/deals/${encodeURIComponent(dealId)}/prefill${query ? `?${query}` : ''}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as DealPrefillResponse;
      const hasUnresolvedCity =
        (data.originRaw && !data.originResolved) || (data.destinationRaw && !data.destinationResolved);

      setFormState((current) => ({
        ...current,
        cargoName: fieldDirtyRef.current.cargoName ? current.cargoName : data.cargoName || current.cargoName,
        vehicleType: fieldDirtyRef.current.vehicleType ? current.vehicleType : data.vehicleType || current.vehicleType,
        origin: fieldDirtyRef.current.origin
          ? current.origin
          : data.originResolved
            ? data.origin || current.origin
            : current.origin,
        destination: fieldDirtyRef.current.destination
          ? current.destination
          : data.destinationResolved
            ? data.destination || current.destination
            : current.destination
      }));

      if (!stagesDirtyRef.current) {
        setStages((current) => {
          if (current.length === 0) {
            return current;
          }

          const next = [...current];
          if (data.originResolved && data.origin) {
            next[0] = { ...next[0], fromLocation: data.origin };
          }
          if (data.destinationResolved && data.destination) {
            next[next.length - 1] = { ...next[next.length - 1], toLocation: data.destination };
          }
          if (data.vehicleType) {
            for (let index = 0; index < next.length; index += 1) {
              next[index] = { ...next[index], vehicleType: data.vehicleType };
            }
          }
          return normalizeStages(next);
        });
      }

      if (hasUnresolvedCity) {
        setPrefillWarning('Не удалось определить город из поля сделки. Проверьте настройку поля Bitrix24.');
      }
    } catch {
      // ignore prefill errors, form remains editable
    } finally {
      setPrefillLoading(false);
      sendParentResize();
    }
  }

  function updateFormState<K extends keyof FormState>(
    key: K,
    value: FormState[K],
    markDirty = true
  ) {
    if (markDirty && isPrefillDirtyKey(key)) {
      fieldDirtyRef.current[key] = true;
    }
    setFormState((current) => ({ ...current, [key]: value }));
  }

  function updateStage(stageId: string, patch: Partial<StageItem>) {
    stagesDirtyRef.current = true;
    setStages((current) =>
      normalizeStages(current.map((stage) => (stage.id === stageId ? { ...stage, ...patch } : stage)))
    );
  }

  function toggleAccordion(section: AccordionKey) {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
    sendParentResize();
  }

  function handleTemplateSelect(template: RouteTemplateType) {
    stagesDirtyRef.current = true;
    setRouteTemplate(template);
    const nextStages =
      template === 'CUSTOM'
        ? []
        : buildStagesFromTemplate(template, formState.currency, {
            origin: formState.origin,
            destination: formState.destination,
            containerType: formState.containerType,
            vehicleType: formState.vehicleType
          });
    setStages(nextStages);
  }

  function handleAddStage() {
    stagesDirtyRef.current = true;
    setStages((current) =>
      normalizeStages([
        ...current,
        createStage('CUSTOM', current.length, formState.currency, {
          containerType: formState.containerType,
          vehicleType: formState.vehicleType
        })
      ])
    );
    setOpenSections((current) => ({ ...current, stages: true }));
    sendParentResize();
  }

  function handleDeleteStage(stageId: string) {
    stagesDirtyRef.current = true;
    setStages((current) => normalizeStages(current.filter((stage) => stage.id !== stageId)));
    setServices((current) =>
      current.map((service) => (service.stageId === stageId ? { ...service, stageId: '' } : service))
    );
    sendParentResize();
  }

  function handleMoveStage(stageId: string, direction: -1 | 1) {
    stagesDirtyRef.current = true;
    setStages((current) => {
      const index = current.findIndex((stage) => stage.id === stageId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [stage] = next.splice(index, 1);
      next.splice(nextIndex, 0, stage);
      return normalizeStages(next);
    });
  }

  function handleServiceToggle(serviceId: string, enabled: boolean) {
    setServices((current) =>
      current.map((service) => {
        if (service.id !== serviceId) {
          return service;
        }

        const serviceFlags: Partial<Services> =
          service.serviceName === 'ПРР'
            ? { portHandling: enabled }
            : service.serviceName === 'Хранение'
              ? { storage: enabled }
              : service.serviceName === 'Реф-подключение'
                ? { reeferConnection: enabled }
                : { containerRent: enabled };

        setFormState((previous) => ({
          ...previous,
          services: {
            ...previous.services,
            ...serviceFlags
          }
        }));

        return { ...service, enabled };
      })
    );
  }

  function handleServiceChange(serviceId: string, patch: Partial<AdditionalService>) {
    setServices((current) =>
      current.map((service) => {
        if (service.id !== serviceId) {
          return service;
        }

        const next = { ...service, ...patch };
        return {
          ...next,
          quantity: Math.max(1, clampNumber(next.quantity, 1)),
          costAmount: SERVICE_BASE_COSTS[next.serviceName] * Math.max(1, clampNumber(next.quantity, 1))
        };
      })
    );
  }

  function validate() {
    if (!formState.origin.trim()) {
      return 'Поле "Пункт погрузки" обязательно.';
    }
    if (!formState.destination.trim()) {
      return 'Поле "Пункт выгрузки" обязательно.';
    }
    if (stages.length === 0) {
      return 'Добавьте хотя бы один этап перевозки.';
    }
    if (formState.weightKg <= 0) {
      return 'Вес должен быть больше 0.';
    }
    if (formState.volumeM3 < 0) {
      return 'Объем не может быть меньше 0.';
    }
    return null;
  }

  function handleCalculate() {
    setLoading(true);
    setError(null);
    setSavedId(null);
    setTimelineMessage(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setLoading(false);
      return;
    }

    const snapshot = buildCalculationSnapshot(formState, stages, services);
    setStages(snapshot.normalizedStages);
    setServices(snapshot.normalizedServices);
    setResult(snapshot.result);
    setLastPayload(formState);
    setCalculatedAt(new Date().toISOString());
    setLoading(false);
  }

  async function handleSaveCalculation() {
    setSaving(true);
    setError(null);
    setSavedId(null);
    setTimelineMessage(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setSaving(false);
      return;
    }

    const snapshot = buildCalculationSnapshot(formState, stages, services);

    try {
      const response = await fetch(`${apiBaseUrl}/calculations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portalDomain: formState.portalDomain || undefined,
          dealId: formState.dealId || undefined,
          counterpartyId: counterparty?.id || undefined,
          counterpartyType:
            counterparty && counterparty.type !== 'unknown' ? counterparty.type : undefined,
          counterpartyName: counterparty?.name || undefined,
          routeType: formState.routeType,
          origin: formState.origin,
          destination: formState.destination,
          cargoName: formState.cargoName,
          vehicleType: formState.vehicleType,
          weightKg: formState.weightKg,
          volumeM3: formState.volumeM3,
          transportType: formState.transportType,
          containerType: formState.containerType,
          containerStatus: formState.containerStatus,
          currency: formState.currency,
          marginType: formState.marginType,
          marginValue: formState.marginValue,
          services: formState.services,
          totalCost: snapshot.result.totalCost,
          margin: snapshot.result.margin,
          clientPrice: snapshot.result.clientPrice,
          lines: snapshot.result.lines,
          warnings: snapshot.result.warnings ?? []
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const saved = (await response.json()) as SavedCalculation;
      setSavedId(saved.id);
      setResult(snapshot.result);
      setLastPayload(formState);
      setCalculatedAt(new Date().toISOString());
      await loadHistory(formState.dealId);
    } catch (saveError) {
      setError(`Ошибка сохранения: ${saveError instanceof Error ? saveError.message : String(saveError)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncLocationsFromBitrix() {
    setSyncingLocations(true);
    setSyncError(null);
    setSyncResult(null);

    try {
      const response = await fetch(`${apiBaseUrl}/dictionaries/locations/sync/bitrix`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as BitrixLocationSyncResponse;
      setSyncResult(data);
      await refreshBootstrap();
    } catch (syncLocationsError) {
      setSyncError(syncLocationsError instanceof Error ? syncLocationsError.message : String(syncLocationsError));
    } finally {
      setSyncingLocations(false);
    }
  }

  async function handleWriteToBitrixDeal() {
    if (!formState.dealId.trim()) {
      setError('Сделка не определена в placement context.');
      return;
    }

    setWritingTimeline(true);
    setError(null);
    setTimelineMessage(null);

    const snapshot = buildCalculationSnapshot(formState, stages, services);

    try {
      const response = await fetch(
        `${apiBaseUrl}/bitrix/deals/${encodeURIComponent(formState.dealId.trim())}/timeline-comment`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            portalDomain: formState.portalDomain || undefined,
            route: `${formState.origin} -> ${formState.destination}`,
            from: formState.origin,
            to: formState.destination,
            cargoType: formState.cargoName || `${formState.containerType} / ${formState.containerStatus}`,
            cargoParams: formState.vehicleType || undefined,
            weightKg: formState.weightKg,
            volumeM3: formState.volumeM3,
            selectedTariff: stages.map((stage) => STAGE_TYPE_LABELS[stage.type]).join(' + '),
            finalPrice: snapshot.result.clientPrice,
            currency: snapshot.result.currency,
            calculationDateTime: calculatedAt ?? new Date().toISOString()
          })
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      await (response.json() as Promise<TimelineCommentResponse>);
      setResult(snapshot.result);
      setLastPayload(formState);
      setCalculatedAt(new Date().toISOString());
      setTimelineMessage('Расчет записан в сделку Bitrix24');
    } catch (timelineError) {
      setError(`Ошибка записи в сделку: ${timelineError instanceof Error ? timelineError.message : String(timelineError)}`);
    } finally {
      setWritingTimeline(false);
    }
  }

  function handleLocationTextChange(field: 'origin' | 'destination', text: string) {
    updateFormState(field, text, true);
  }

  function handleLocationSelect(field: 'origin' | 'destination', location: SelectedLocation, text: string) {
    updateFormState(field, location?.city ?? text, true);

    if (!stagesDirtyRef.current && stages.length > 0) {
      setStages((current) => {
        const next = [...current];
        if (field === 'origin' && next[0]) {
          next[0] = { ...next[0], fromLocation: location?.city ?? text };
        }
        if (field === 'destination' && next[next.length - 1]) {
          next[next.length - 1] = { ...next[next.length - 1], toLocation: location?.city ?? text };
        }
        return normalizeStages(next);
      });
    }

    sendParentResize();
  }

  const stageOptionsMarkup = stages.map((stage) => (
    <option key={stage.id} value={stage.id}>
      Этап {stage.sortOrder} — {STAGE_TYPE_LABELS[stage.type]}
    </option>
  ));

  return (
    <main ref={pageRef} className="page">
      <section className="shell shell-compact">
        <section className="hero-card">
          <div className="hero-copy">
            <span className="hero-eyebrow">Сделка №{formState.dealId || 'без номера'}</span>
            <h1>Калькулятор перевозки</h1>
            <p className="hero-subtitle">
              Соберите маршрут по этапам, добавьте услуги и подготовьте ставку для клиента.
            </p>
          </div>
          <div className="hero-meta">
            <div className="hero-meta-card">
              <span className="meta-label">Контрагент</span>
              <strong className="meta-value">
                {counterpartyLoading
                  ? 'Загрузка...'
                  : counterparty?.name || (counterpartyError ? 'Не загружен' : 'Не указан')}
              </strong>
              {counterparty?.type && counterparty.type !== 'unknown' && (
                <span className="meta-note">
                  {counterparty.type === 'company' ? 'Компания' : 'Контакт'}
                  {counterparty.id ? ` #${counterparty.id}` : ''}
                </span>
              )}
            </div>
            <div className="hero-meta-card">
              <span className="meta-label">Маршрут</span>
              <strong className="meta-value">
                {formState.origin || 'Пункт погрузки'} {'->'} {formState.destination || 'Пункт выгрузки'}
              </strong>
              <span className="meta-note">
                {stages.length} этап(ов){prefillLoading ? ' • подстановка из сделки...' : ''}
              </span>
            </div>
          </div>
        </section>

        {error && <p className="error">{error}</p>}
        {prefillWarning && <p className="warning">{prefillWarning}</p>}
        {savedId && <p className="success">Расчет сохранен. ID: {savedId}</p>}
        {timelineMessage && <p className="success">{timelineMessage}</p>}
        {bootstrapError && <p className="muted">Bootstrap словарей недоступен: {bootstrapError}</p>}

        <section className="accordion-card">
          <button
            type="button"
            className={`accordion-trigger${openSections.request ? ' is-open' : ''}`}
            onClick={() => toggleAccordion('request')}
          >
            <span>Параметры заявки</span>
            <span>{openSections.request ? '−' : '+'}</span>
          </button>
          {openSections.request && (
            <div className="accordion-body">
              <div className="fields request-grid request-grid-compact">
                <CityAutocomplete
                  label="Пункт погрузки"
                  name="origin"
                  metadataPrefix="origin"
                  required
                  value={formState.origin}
                  onTextChange={(text) => handleLocationTextChange('origin', text)}
                  onLocationChange={(location, text) => handleLocationSelect('origin', location, text)}
                />
                <CityAutocomplete
                  label="Пункт выгрузки"
                  name="destination"
                  metadataPrefix="destination"
                  required
                  value={formState.destination}
                  onTextChange={(text) => handleLocationTextChange('destination', text)}
                  onLocationChange={(location, text) => handleLocationSelect('destination', location, text)}
                />
                <label className="request-field-cargo">
                  Груз
                  <input
                    value={formState.cargoName}
                    onChange={(event) => updateFormState('cargoName', event.target.value)}
                    placeholder="Например, замороженная продукция"
                  />
                </label>
                <label>
                  Вес, кг
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={formState.weightKg}
                    onChange={(event) => updateFormState('weightKg', Number(event.target.value), false)}
                  />
                </label>
                <label>
                  Объем, м3
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={formState.volumeM3}
                    onChange={(event) => updateFormState('volumeM3', Number(event.target.value), false)}
                  />
                </label>
                <label>
                  Тип контейнера
                  <select
                    value={formState.containerType}
                    onChange={(event) => updateFormState('containerType', event.target.value, false)}
                  >
                    {dictionaries.containerTypes.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Статус контейнера
                  <select
                    value={formState.containerStatus}
                    onChange={(event) => updateFormState('containerStatus', event.target.value, false)}
                  >
                    <option value="SOC">SOC</option>
                    <option value="COC">COC</option>
                  </select>
                </label>
                <label>
                  Валюта
                  <select
                    value={formState.currency}
                    onChange={(event) => updateFormState('currency', event.target.value, false)}
                  >
                    {dictionaries.currencies.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}
        </section>

        <section className="accordion-card">
          <button
            type="button"
            className={`accordion-trigger${openSections.stages ? ' is-open' : ''}`}
            onClick={() => toggleAccordion('stages')}
          >
            <span>Этапы перевозки</span>
            <span>{openSections.stages ? '−' : '+'}</span>
          </button>
          {openSections.stages && (
            <div className="accordion-body">
              <div className="template-row">
                <span className="template-label">Шаблон маршрута</span>
                <div className="template-buttons">
                  <button
                    type="button"
                    className={routeTemplate === 'AUTO_ONLY' ? 'secondary-button is-active' : 'secondary-button'}
                    onClick={() => handleTemplateSelect('AUTO_ONLY')}
                  >
                    Авто
                  </button>
                  <button
                    type="button"
                    className={routeTemplate === 'AUTO_SEA_AUTO' ? 'secondary-button is-active' : 'secondary-button'}
                    onClick={() => handleTemplateSelect('AUTO_SEA_AUTO')}
                  >
                    Авто + море + авто
                  </button>
                  <button
                    type="button"
                    className={routeTemplate === 'AUTO_SEA_RAIL_AUTO' ? 'secondary-button is-active' : 'secondary-button'}
                    onClick={() => handleTemplateSelect('AUTO_SEA_RAIL_AUTO')}
                  >
                    Авто + море + ЖД + авто
                  </button>
                  <button
                    type="button"
                    className={routeTemplate === 'CUSTOM' ? 'secondary-button is-active' : 'secondary-button'}
                    onClick={() => handleTemplateSelect('CUSTOM')}
                  >
                    Свой маршрут
                  </button>
                </div>
              </div>

              <div className="stage-list">
                {stages.map((stage, index) => (
                  <article key={stage.id} className="stage-card">
                    <div className="stage-card-head">
                      <div>
                        <h3>{stage.title}</h3>
                        <p className="muted">Mock стоимость: {formatMoney(stage.costAmount, stage.costCurrency)}</p>
                      </div>
                      <div className="stage-actions">
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => handleMoveStage(stage.id, -1)}
                          disabled={index === 0}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => handleMoveStage(stage.id, 1)}
                          disabled={index === stages.length - 1}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="icon-button danger-button"
                          onClick={() => handleDeleteStage(stage.id)}
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                    <div className="fields request-grid">
                      <label>
                        Тип этапа
                        <select
                          value={stage.type}
                          onChange={(event) => updateStage(stage.id, { type: event.target.value as StageType })}
                        >
                          {(Object.keys(STAGE_TYPE_LABELS) as StageType[]).map((type) => (
                            <option key={type} value={type}>
                              {STAGE_TYPE_LABELS[type]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <CityAutocomplete
                        label="Откуда"
                        name={`${stage.id}-from`}
                        metadataPrefix={`${stage.id}-from`}
                        value={stage.fromLocation}
                        onTextChange={(text) => updateStage(stage.id, { fromLocation: text })}
                        onLocationChange={(location, text) => {
                          updateStage(stage.id, { fromLocation: location?.city ?? text });
                          sendParentResize();
                        }}
                      />
                      <label>
                        Адрес откуда
                        <input
                          value={stage.fromAddress}
                          onChange={(event) => updateStage(stage.id, { fromAddress: event.target.value })}
                        />
                      </label>
                      <CityAutocomplete
                        label="Куда"
                        name={`${stage.id}-to`}
                        metadataPrefix={`${stage.id}-to`}
                        value={stage.toLocation}
                        onTextChange={(text) => updateStage(stage.id, { toLocation: text })}
                        onLocationChange={(location, text) => {
                          updateStage(stage.id, { toLocation: location?.city ?? text });
                          sendParentResize();
                        }}
                      />
                      <label>
                        Адрес куда
                        <input
                          value={stage.toAddress}
                          onChange={(event) => updateStage(stage.id, { toAddress: event.target.value })}
                        />
                      </label>
                      <label>
                        Комментарий
                        <input
                          value={stage.comment}
                          onChange={(event) => updateStage(stage.id, { comment: event.target.value })}
                        />
                      </label>
                      <label>
                        Стоимость этапа
                        <input value={formatMoney(stage.costAmount, stage.costCurrency)} readOnly />
                      </label>
                    </div>
                  </article>
                ))}
              </div>

              <div className="actions">
                <button type="button" onClick={handleAddStage}>
                  + Добавить этап
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="accordion-card">
          <button
            type="button"
            className={`accordion-trigger${openSections.services ? ' is-open' : ''}`}
            onClick={() => toggleAccordion('services')}
          >
            <span>Дополнительные услуги</span>
            <span>{openSections.services ? '−' : '+'}</span>
          </button>
          {openSections.services && (
            <div className="accordion-body">
              <div className="service-list">
                {services.map((service) => (
                  <article key={service.id} className="service-card">
                    <label className="service-enable">
                      <input
                        type="checkbox"
                        checked={service.enabled}
                        onChange={(event) => handleServiceToggle(service.id, event.target.checked)}
                      />
                      <span>{service.serviceName}</span>
                    </label>
                    <label>
                      Этап
                      <select
                        value={service.stageId}
                        onChange={(event) => handleServiceChange(service.id, { stageId: event.target.value })}
                      >
                        <option value="">Без привязки</option>
                        {stageOptionsMarkup}
                      </select>
                    </label>
                    <label>
                      Количество
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={service.quantity}
                        onChange={(event) => handleServiceChange(service.id, { quantity: Number(event.target.value) })}
                      />
                    </label>
                    <label>
                      Стоимость
                      <input value={formatMoney(service.costAmount, formState.currency)} readOnly />
                    </label>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="accordion-card">
          <button
            type="button"
            className={`accordion-trigger${openSections.summary ? ' is-open' : ''}`}
            onClick={() => toggleAccordion('summary')}
          >
            <span>Итоговая ставка</span>
            <span>{openSections.summary ? '−' : '+'}</span>
          </button>
          {openSections.summary && (
            <div className="accordion-body">
              <div className="summary-grid">
                <div className="summary-metric">
                  <span>Сумма этапов</span>
                  <strong>{formatMoney(summary.totalStages, formState.currency)}</strong>
                </div>
                <div className="summary-metric">
                  <span>Сумма доп. услуг</span>
                  <strong>{formatMoney(summary.totalServices, formState.currency)}</strong>
                </div>
                <div className="summary-metric">
                  <span>Себестоимость</span>
                  <strong>{formatMoney(summary.totalCost, formState.currency)}</strong>
                </div>
                <div className="summary-metric">
                  <span>Маржа, %</span>
                  <strong>{summary.marginPercent.toFixed(2)}%</strong>
                </div>
                <div className="summary-metric summary-metric-accent">
                  <span>Цена клиенту</span>
                  <strong>{formatMoney(summary.clientPrice, formState.currency)}</strong>
                </div>
              </div>
              <div className="fields summary-controls">
                <label>
                  Маржа
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formState.marginValue}
                    onChange={(event) => updateFormState('marginValue', Number(event.target.value), false)}
                  />
                </label>
                <label>
                  Режим маржи
                  <select
                    value={formState.marginType}
                    onChange={(event) => updateFormState('marginType', event.target.value, false)}
                  >
                    <option value="percent">%</option>
                    <option value="fixed">Фиксированная сумма</option>
                  </select>
                </label>
              </div>
              {(result?.warnings ?? summary.result.warnings ?? []).map((warning) => (
                <p key={warning} className="warning">
                  {warning}
                </p>
              ))}
            </div>
          )}
        </section>

        <div className="actions sticky-actions">
          <button type="button" onClick={handleCalculate} disabled={loading}>
            {loading ? 'Расчет...' : 'Рассчитать'}
          </button>
          <button type="button" onClick={handleSaveCalculation} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить расчет'}
          </button>
          <button type="button" onClick={handleWriteToBitrixDeal} disabled={writingTimeline}>
            {writingTimeline ? 'Запись...' : 'Записать в сделку Bitrix24'}
          </button>
        </div>

        <section className="accordion-card">
          <button
            type="button"
            className={`accordion-trigger${openSections.admin ? ' is-open' : ''}`}
            onClick={() => toggleAccordion('admin')}
          >
            <span>Администрирование</span>
            <span>{openSections.admin ? '−' : '+'}</span>
          </button>
          {openSections.admin && (
            <div className="accordion-body">
              <div className="section-head">
                <h2>Справочник локаций</h2>
                <button type="button" onClick={handleSyncLocationsFromBitrix} disabled={syncingLocations}>
                  {syncingLocations ? 'Синхронизация...' : 'Синхронизировать из Bitrix24'}
                </button>
              </div>
              <p className="muted">
                Активных локаций: <b>{dictionaries.locations.length}</b>
              </p>
              {syncError && <p className="error">{syncError}</p>}
              {syncResult && (
                <div className="sync-result">
                  <p className="success">
                    Создано: <b>{syncResult.created}</b>, обновлено: <b>{syncResult.updated}</b>, пропущено:{' '}
                    <b>{syncResult.skipped}</b>
                  </p>
                  {syncResult.warnings.map((warning) => (
                    <p key={warning} className="warning">
                      {warning}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="card compact-history-card">
          <div className="section-head">
            <h2>История расчетов</h2>
            <span className="muted">{history.length} записей</span>
          </div>
          {history.length === 0 && <p className="muted">Пока нет сохраненных расчетов.</p>}
          {history.length > 0 && (
            <div className="history-list">
              {history.map((item) => (
                <article key={item.id} className="history-item">
                  <div className="history-main">
                    <strong>
                      {item.origin} {'->'} {item.destination}
                    </strong>
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="history-side">
                    <span>{item.counterpartyName || 'Без контрагента'}</span>
                    <strong>{formatMoney(item.clientPrice, item.currency)}</strong>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
