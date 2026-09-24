type BitrixAuthContext = {
  access_token?: unknown;
  domain?: unknown;
  member_id?: unknown;
};

type BitrixSdk = {
  init: (callback: () => void) => void;
  getAuth: () => BitrixAuthContext;
  resizeWindow?: (width: number, height: number) => void;
  placement?: {
    info?: (callback: (info: unknown) => void) => void;
  };
};

declare global {
  interface Window {
    BX24?: BitrixSdk;
    __BITRIX_PLACEMENT_CONTEXT__?: {
      PLACEMENT?: unknown;
      PLACEMENT_OPTIONS?: unknown;
      DOMAIN?: unknown;
      domain?: unknown;
    };
  }
}

let sdkLoadPromise: Promise<BitrixSdk> | null = null;
let sdkInitPromise: Promise<BitrixSdk> | null = null;

function readRequiredString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

async function loadBitrixSdk(): Promise<BitrixSdk> {
  if (window.BX24) {
    return window.BX24;
  }

  if (!sdkLoadPromise) {
    sdkLoadPromise = new Promise<BitrixSdk>((resolve, reject) => {
      const script = document.createElement('script');
      const timeoutId = window.setTimeout(() => reject(new Error('Bitrix SDK load timeout')), 10000);
      script.src = 'https://api.bitrix24.com/api/v1/';
      script.async = true;
      script.onload = () => {
        window.clearTimeout(timeoutId);
        if (window.BX24) {
          resolve(window.BX24);
        } else {
          reject(new Error('Bitrix SDK is unavailable'));
        }
      };
      script.onerror = () => {
        window.clearTimeout(timeoutId);
        reject(new Error('Bitrix SDK load failed'));
      };
      document.head.appendChild(script);
    }).catch((error) => {
      sdkLoadPromise = null;
      throw error;
    });
  }

  return sdkLoadPromise;
}

export async function getBitrixBootstrapContext() {
  const sdk = await initializeBitrixSdk();

  try {
    const auth = sdk.getAuth();
    const accessToken = readRequiredString(auth?.access_token);
    const domain = readRequiredString(auth?.domain);
    const memberId = readRequiredString(auth?.member_id);

    if (!accessToken || !domain) {
      throw new Error('Bitrix auth context is unavailable');
    }

    return {
      access_token: accessToken,
      domain,
      ...(memberId ? { member_id: memberId } : {})
    };
  } catch {
    throw new Error('Bitrix auth context is unavailable');
  }
}

export async function getBitrixPlacementDealId() {
  const placementContext = window.__BITRIX_PLACEMENT_CONTEXT__;
  const bridgedDealId = readPlacementDealId(placementContext?.PLACEMENT_OPTIONS ?? placementContext);
  if (bridgedDealId) return bridgedDealId;
  const queryDealId = readPlacementDealIdFromQuery(window.location.search);
  if (queryDealId) return queryDealId;

  const sdk = await initializeBitrixSdk();
  if (!sdk.placement?.info) return null;

  return new Promise<string | null>((resolve) => {
    try {
      sdk.placement?.info?.((info) => resolve(readPlacementDealId(info)));
    } catch {
      resolve(null);
    }
  });
}

export function getBitrixPlacementDomain() {
  const context = window.__BITRIX_PLACEMENT_CONTEXT__;
  const contextDomain = context?.DOMAIN ?? context?.domain;
  const directDomain = readRequiredString(contextDomain);
  if (directDomain) return directDomain;
  const params = new URLSearchParams(window.location.search);
  return readRequiredString(params.get('portal') ?? params.get('domain'));
}

async function initializeBitrixSdk() {
  if (!sdkInitPromise) {
    sdkInitPromise = loadBitrixSdk().then(
      (sdk) => new Promise<BitrixSdk>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => reject(new Error('Bitrix SDK init timeout')), 10000);
        sdk.init(() => {
          window.clearTimeout(timeoutId);
          resolve(sdk);
        });
      })
    ).catch((error) => {
      sdkInitPromise = null;
      throw error;
    });
  }

  return sdkInitPromise;
}

function readPlacementDealId(info: unknown) {
  let options = info;
  if (typeof options === 'string') {
    options = parsePlacementOptionsString(options);
  } else if (options && typeof options === 'object' && !Array.isArray(options)) {
    const wrapper = options as { options?: unknown; PLACEMENT_OPTIONS?: unknown; placement_options?: unknown };
    options = wrapper.options ?? wrapper.PLACEMENT_OPTIONS ?? wrapper.placement_options ?? options;
    if (typeof options === 'string') {
      options = parsePlacementOptionsString(options);
    }
  }

  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return null;
  }

  const raw = options as Record<string, unknown>;
  const value = raw.ID ?? raw.ENTITY_ID ?? raw.entityId ?? raw.dealId ?? raw.DEAL_ID;
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function parsePlacementOptionsString(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return Object.fromEntries(new URLSearchParams(value).entries());
  }
}

function readPlacementDealIdFromQuery(search: string) {
  const params = new URLSearchParams(search);
  const direct = params.get('dealId') ?? params.get('DEAL_ID') ?? params.get('ID') ?? params.get('ENTITY_ID');
  if (direct?.trim()) return direct.trim();

  const rawOptions = params.get('PLACEMENT_OPTIONS') ?? params.get('placement_options') ?? params.get('placementOptions');
  if (!rawOptions) return null;
  try {
    return readPlacementDealId({ options: rawOptions });
  } catch {
    return null;
  }
}
