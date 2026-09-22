import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react';
import { apiUrl } from '../api/config';
import { getBitrixBootstrapContext } from '../utils/bitrixAuth';

export type AuthStatus = 'loading' | 'authenticated' | 'forbidden' | 'outside-bitrix' | 'error';

export type AuthUser = {
  id: string;
  bitrixUserId: string;
  role: 'ADMIN' | 'LEAD' | 'MANAGER';
};

type BootstrapResponse = {
  authenticated?: boolean;
  accessToken?: string;
  expiresIn?: number;
  user?: AuthUser;
};

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
  retryAuthentication: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const bootstrapPromiseRef = useRef<Promise<string> | null>(null);

  const updateStatus = useCallback((nextStatus: AuthStatus) => {
    setStatus(nextStatus);
  }, []);

  const bootstrap = useCallback(async (force = false) => {
    if (bootstrapPromiseRef.current) {
      return bootstrapPromiseRef.current;
    }

    const request = (async () => {
      if (force) {
        accessTokenRef.current = null;
      }

      updateStatus('loading');
      let bitrixContext;
      try {
        bitrixContext = await getBitrixBootstrapContext();
      } catch (error) {
        accessTokenRef.current = null;
        setUser(null);
        updateStatus('outside-bitrix');
        throw error;
      }

      let response: Response;
      try {
        response = await fetch(apiUrl('/auth/bitrix/bootstrap'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bitrixContext)
        });
      } catch (error) {
        accessTokenRef.current = null;
        setUser(null);
        updateStatus('error');
        throw error;
      }

      if (response.status === 403) {
        accessTokenRef.current = null;
        setUser(null);
        updateStatus('forbidden');
        throw new Error('Access denied');
      }

      if (!response.ok) {
        accessTokenRef.current = null;
        setUser(null);
        updateStatus('error');
        throw new Error('Authentication failed');
      }

      const data = (await response.json()) as BootstrapResponse;
      if (
        data.authenticated !== true ||
        typeof data.accessToken !== 'string' ||
        !data.accessToken ||
        !data.user ||
        typeof data.user.id !== 'string' ||
        typeof data.user.bitrixUserId !== 'string' ||
        !['ADMIN', 'LEAD', 'MANAGER'].includes(data.user.role)
      ) {
        accessTokenRef.current = null;
        setUser(null);
        updateStatus('error');
        throw new Error('Invalid authentication response');
      }

      accessTokenRef.current = data.accessToken;
      setUser(data.user);
      updateStatus('authenticated');
      return data.accessToken;
    })();

    bootstrapPromiseRef.current = request;
    try {
      return await request;
    } finally {
      if (bootstrapPromiseRef.current === request) {
        bootstrapPromiseRef.current = null;
      }
    }
  }, [updateStatus]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const apiFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    const performRequest = (accessToken: string) => {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${accessToken}`);
      return fetch(apiUrl(path), { ...init, headers });
    };

    const initialToken = accessTokenRef.current ?? await bootstrap();
    const initialResponse = await performRequest(initialToken);
    if (initialResponse.status !== 401) {
      return initialResponse;
    }

    const refreshedToken = await bootstrap(true);
    const retryResponse = await performRequest(refreshedToken);
    if (retryResponse.status === 401) {
      accessTokenRef.current = null;
      setUser(null);
      updateStatus('error');
    }

    return retryResponse;
  }, [bootstrap, updateStatus]);

  const retryAuthentication = useCallback(async () => {
    await bootstrap(true);
  }, [bootstrap]);

  return (
    <AuthContext.Provider value={{ status, user, apiFetch, retryAuthentication }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
