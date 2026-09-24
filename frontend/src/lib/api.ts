// Talks to the backend. Adds the login token to every request and, when it has expired,
// quietly gets a new one with the refresh cookie and retries once.
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuth } from '../stores/auth';
import type { Session } from '../types/api';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true, // send the refresh cookie
  timeout: 20_000,
  // The backend refuses cookie requests without this header (protection against other sites).
  headers: { 'X-Requested-With': 'KaziForce' },
});

api.interceptors.request.use((config) => {
  const token = useAuth.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<boolean> | null = null;

/** Gets a new login token from the refresh cookie. Several callers share one request. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= api
    .post<Session>('/auth/refresh')
    .then((res) => {
      useAuth.getState().setSession(res.data);
      return true;
    })
    .catch((error: unknown) => {
      const suspended = apiErrorCode(error) === 'account_suspended';
      useAuth.getState().clear(suspended ? 'suspended' : null);
      return false;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as RetriableConfig | undefined;
  const status = error.response?.status;
  const isAuthCall = config?.url?.startsWith('/auth/');

  if (status === 401 && config && !config._retried && !isAuthCall) {
    config._retried = true;
    const hadSession = useAuth.getState().status === 'user';
    if (await refreshSession()) return api(config);
    if (hadSession) useAuth.getState().clear('expired');
  }
  if (status === 403 && apiErrorCode(error) === 'account_suspended') {
    useAuth.getState().clear('suspended');
  }
  throw error;
});

/** The backend's error code, e.g. "wrong_credentials"; "network" when it could not be reached. */
export function apiErrorCode(error: unknown): string {
  if (error instanceof AxiosError) {
    if (!error.response) return 'network';
    const code = (error.response.data as { error?: { code?: string } } | undefined)?.error?.code;
    return code ?? 'generic';
  }
  return 'generic';
}
