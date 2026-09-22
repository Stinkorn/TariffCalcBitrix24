type BitrixAuthContext = {
  access_token?: unknown;
  domain?: unknown;
  member_id?: unknown;
};

type BitrixSdk = {
  init: (callback: () => void) => void;
  getAuth: () => BitrixAuthContext;
};

declare global {
  interface Window {
    BX24?: BitrixSdk;
  }
}

let sdkLoadPromise: Promise<BitrixSdk> | null = null;

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
  const sdk = await loadBitrixSdk();

  return new Promise<{ access_token: string; domain: string; member_id?: string }>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error('Bitrix SDK init timeout')), 10000);
    sdk.init(() => {
      window.clearTimeout(timeoutId);
      try {
        const auth = sdk.getAuth();
        const accessToken = readRequiredString(auth?.access_token);
        const domain = readRequiredString(auth?.domain);
        const memberId = readRequiredString(auth?.member_id);

        if (!accessToken || !domain) {
          reject(new Error('Bitrix auth context is unavailable'));
          return;
        }

        resolve({
          access_token: accessToken,
          domain,
          ...(memberId ? { member_id: memberId } : {})
        });
      } catch {
        reject(new Error('Bitrix auth context is unavailable'));
      }
    });
  });
}
