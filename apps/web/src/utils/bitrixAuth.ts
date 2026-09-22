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
  const sdk = await initializeBitrixSdk();
  if (!sdk.placement?.info) {
    return null;
  }

  return new Promise<string | null>((resolve) => {
    try {
      sdk.placement?.info?.((info) => {
        resolve(readPlacementDealId(info));
      });
    } catch {
      resolve(null);
    }
  });
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
  if (!info || typeof info !== 'object') {
    return null;
  }

  const placementInfo = info as { options?: unknown };
  let options = placementInfo.options;
  if (typeof options === 'string') {
    try {
      options = JSON.parse(options);
    } catch {
      return null;
    }
  }

  if (!options || typeof options !== 'object') {
    return null;
  }

  const raw = options as Record<string, unknown>;
  const value = raw.ID ?? raw.ENTITY_ID ?? raw.entityId ?? raw.dealId;
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}
